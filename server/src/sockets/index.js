import { Server } from 'socket.io';
import { isOriginAllowed } from '../config/env.js';
import { verifyToken } from '../middleware/auth.js';
import { User, Appointment, Message } from '../models/index.js';
import { ROLES } from '../utils/constants.js';
import { geminiAvailable, geminiTranslate } from '../services/gemini.service.js';

let io = null;

const userRoom = (userId) => `user:${userId}`;
const roleRoom = (role) => `role:${role}`;
const appointmentRoom = (id) => `appointment:${id}`;

/**
 * Best-effort translation for one recipient, shared by chat messages and
 * live call captions. Never throws — a slow or unavailable Gemini, or the
 * two people sharing a language, just means the caller gets empty strings
 * back and the original text goes through untranslated.
 */
async function translateForRecipient(senderId, recipientId, text) {
  if (!geminiAvailable()) return { translatedText: '', sourceLanguage: '', translatedLanguage: '' };
  try {
    const users = await User.find({ _id: { $in: [senderId, recipientId] } })
      .select('preferredLanguage')
      .lean();
    const senderLang = users.find((u) => String(u._id) === senderId)?.preferredLanguage || 'en';
    const recipientLang =
      users.find((u) => String(u._id) === recipientId)?.preferredLanguage || 'en';

    if (senderLang === recipientLang) {
      return { translatedText: '', sourceLanguage: '', translatedLanguage: '' };
    }

    const translatedText = await geminiTranslate({ text, targetLanguage: recipientLang });
    return { translatedText, sourceLanguage: senderLang, translatedLanguage: recipientLang };
  } catch {
    return { translatedText: '', sourceLanguage: '', translatedLanguage: '' };
  }
}

export function initSocket(server) {
  io = new Server(server, {
    cors: { origin: (origin, cb) => cb(null, isOriginAllowed(origin)), credentials: true },
    // Render's free tier supports websockets, but polling is kept as a
    // fallback for restrictive college/campus networks.
    transports: ['websocket', 'polling'],
  });

  // The same JWT that authorises the REST API authorises the socket.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token provided'));

      const payload = verifyToken(token);
      const user = await User.findById(payload.sub).lean();
      if (!user || !user.isActive) return next(new Error('Invalid account'));

      socket.user = { id: String(user._id), role: user.role, name: user.name };
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.user;
    socket.join(userRoom(id));
    socket.join(roleRoom(role));

    /** Join an appointment's chat room after verifying participation. */
    socket.on('appointment:join', async (appointmentId, ack) => {
      try {
        const appt = await Appointment.findById(appointmentId).lean();
        const allowed =
          appt &&
          (String(appt.patient) === id ||
            String(appt.doctor) === id ||
            role === ROLES.ADMIN);
        if (!allowed) return ack?.({ ok: false, error: 'Not your appointment' });

        socket.join(appointmentRoom(appointmentId));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'Could not join' });
      }
    });

    socket.on('appointment:leave', (appointmentId) => {
      socket.leave(appointmentRoom(appointmentId));
    });

    /** Persist then broadcast, so chat history survives a page refresh. */
    socket.on('chat:send', async ({ appointmentId, text } = {}, ack) => {
      try {
        const trimmed = String(text || '').trim();
        if (!trimmed) return ack?.({ ok: false, error: 'Message is empty' });
        if (trimmed.length > 2000) {
          return ack?.({ ok: false, error: 'Message is too long' });
        }

        const appt = await Appointment.findById(appointmentId).lean();
        if (!appt || (String(appt.patient) !== id && String(appt.doctor) !== id)) {
          return ack?.({ ok: false, error: 'Not your appointment' });
        }

        const otherId =
          String(appt.patient) === id ? String(appt.doctor) : String(appt.patient);

        const { translatedText, sourceLanguage, translatedLanguage } =
          await translateForRecipient(id, otherId, trimmed);

        const saved = await Message.create({
          appointment: appointmentId,
          sender: id,
          text: trimmed,
          translatedText,
          sourceLanguage,
          translatedLanguage,
        });

        const payload = {
          id: String(saved._id),
          appointmentId: String(appointmentId),
          senderId: id,
          senderName: socket.user.name,
          text: saved.text,
          translatedText: saved.translatedText,
          sourceLanguage: saved.sourceLanguage,
          translatedLanguage: saved.translatedLanguage,
          createdAt: saved.createdAt,
        };

        io.to(appointmentRoom(appointmentId)).emit('chat:message', payload);

        // Nudge the other party even if they are not in the room right now.
        io.to(userRoom(otherId)).emit('chat:unread', {
          appointmentId: String(appointmentId),
        });

        ack?.({ ok: true, message: payload });
      } catch (err) {
        ack?.({ ok: false, error: 'Could not send message' });
      }
    });

    socket.on('call:signal', ({ appointmentId, type } = {}) => {
      // Lightweight presence hints ("I joined the room", "I left") shown in
      // the consultation UI. Actual media negotiation is handled by Agora.
      socket.to(appointmentRoom(appointmentId)).emit('call:signal', {
        type,
        from: id,
        name: socket.user.name,
      });
    });

    /**
     * Live translated captions during a call. Each side transcribes its own
     * microphone locally (browser SpeechRecognition) and forwards finished
     * phrases here; this only translates and relays them to the other
     * party. Unlike chat, nothing is persisted — a caption is a live aid for
     * the call, not part of the permanent record.
     */
    socket.on('call:caption', async ({ appointmentId, text } = {}) => {
      try {
        const trimmed = String(text || '').trim().slice(0, 500);
        if (!trimmed) return;

        const appt = await Appointment.findById(appointmentId).lean();
        if (!appt || (String(appt.patient) !== id && String(appt.doctor) !== id)) return;

        const otherId =
          String(appt.patient) === id ? String(appt.doctor) : String(appt.patient);
        const { translatedText, translatedLanguage } =
          await translateForRecipient(id, otherId, trimmed);

        io.to(userRoom(otherId)).emit('call:caption', {
          appointmentId: String(appointmentId),
          from: id,
          name: socket.user.name,
          text: trimmed,
          translatedText,
          targetLanguage: translatedLanguage,
        });
      } catch {
        // A dropped caption is not worth surfacing — the call itself is
        // unaffected either way.
      }
    });
  });

  console.log('[socket] Socket.io ready');
  return io;
}

export function getIO() {
  return io;
}

/** Push an event to one user across all their open tabs/devices. */
export function emitToUser(userId, event, payload) {
  io?.to(userRoom(String(userId))).emit(event, payload);
}

export function emitToRole(role, event, payload) {
  io?.to(roleRoom(role)).emit(event, payload);
}

export function emitToAppointment(appointmentId, event, payload) {
  io?.to(appointmentRoom(String(appointmentId))).emit(event, payload);
}
