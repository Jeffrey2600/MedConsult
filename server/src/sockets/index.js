import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { verifyToken } from '../middleware/auth.js';
import { User, Appointment, Message } from '../models/index.js';
import { ROLES } from '../utils/constants.js';

let io = null;

const userRoom = (userId) => `user:${userId}`;
const roleRoom = (role) => `role:${role}`;
const appointmentRoom = (id) => `appointment:${id}`;

export function initSocket(server) {
  io = new Server(server, {
    cors: { origin: env.corsOrigins, credentials: true },
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

        const saved = await Message.create({
          appointment: appointmentId,
          sender: id,
          text: trimmed,
        });

        const payload = {
          id: String(saved._id),
          appointmentId: String(appointmentId),
          senderId: id,
          senderName: socket.user.name,
          text: saved.text,
          createdAt: saved.createdAt,
        };

        io.to(appointmentRoom(appointmentId)).emit('chat:message', payload);

        // Nudge the other party even if they are not in the room right now.
        const otherId =
          String(appt.patient) === id ? String(appt.doctor) : String(appt.patient);
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
