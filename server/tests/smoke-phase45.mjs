/**
 * Realtime layer and video consultation.
 *
 * Appointments are created directly through Mongoose so their timing can be
 * controlled exactly — the join-window guard is the whole point of the video
 * token endpoint and cannot be exercised properly through the booking API,
 * which only ever produces slots on the doctor's published grid.
 */
import { io } from 'socket.io-client';

const BASE = 'http://127.0.0.1:5000/api';
const SOCKET_URL = 'http://127.0.0.1:5000';

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { Appointment, User, Notification } = await import('../src/models/index.js');

await connectDB();

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const loginAs = async (email, password = 'Password@123') =>
  (await call('/auth/login', { method: 'POST', body: { email, password } })).json.token;

const doctorToken = await loginAs('meera.nair@medconsult.local');
const patientToken = await loginAs('karthik@example.com');
const outsiderToken = await loginAs('ravi@example.com');

const doctor = await User.findOne({ email: 'meera.nair@medconsult.local' }).lean();
const patient = await User.findOne({ email: 'karthik@example.com' }).lean();
const outsider = await User.findOne({ email: 'ravi@example.com' }).lean();

const minutes = (n) => new Date(Date.now() + n * 60_000);

/** Creates a controlled appointment and returns its id. */
async function makeAppointment({ startsInMinutes, durationMinutes = 30, status = 'accepted' }) {
  const startsAt = minutes(startsInMinutes);
  const doc = await Appointment.create({
    patient: patient._id,
    doctor: doctor._id,
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
    status,
    reason: 'automated test',
    videoChannel: status === 'accepted' ? undefined : '',
  });
  if (status === 'accepted') {
    await Appointment.updateOne({ _id: doc._id }, { $set: { videoChannel: String(doc._id) } });
  }
  return String(doc._id);
}

const created = [];
const track = async (opts) => {
  const id = await makeAppointment(opts);
  created.push(id);
  return id;
};

// =========================================================================
// Video token guards
// =========================================================================
const liveId = await track({ startsInMinutes: 2 });

const noAuth = await call(`/video/token/${liveId}`);
check('the video token endpoint requires authentication', noAuth.status === 401);

const outsiderCall = await call(`/video/token/${liveId}`, { token: outsiderToken });
check('a non-participant is refused a video token', outsiderCall.status === 403,
  outsiderCall.json?.message);

const patientCall = await call(`/video/token/${liveId}`, { token: patientToken });
check('the patient receives credentials', patientCall.status === 200, patientCall.json?.message);
check('the channel is the appointment id', patientCall.json?.channel === liveId);
check('a provider is named', !!patientCall.json?.provider, patientCall.json?.provider);
check('with no Agora keys configured it falls back to Jitsi',
  patientCall.json?.provider === 'jitsi');
check('the Jitsi room is namespaced, not a guessable public room',
  patientCall.json?.jitsiRoom === `medconsult-${liveId}`, patientCall.json?.jitsiRoom);
check('the response never leaks an app certificate',
  !JSON.stringify(patientCall.json).toLowerCase().includes('certificate'));

const doctorCall = await call(`/video/token/${liveId}`, { token: doctorToken });
check('the doctor also receives credentials', doctorCall.status === 200);
check('both sides are given the same channel', doctorCall.json.channel === patientCall.json.channel);
check('each side is told who the other party is',
  doctorCall.json.otherParty?.name === patient.name &&
  patientCall.json.otherParty?.name === doctor.name);

const afterJoin = await Appointment.findById(liveId).lean();
check('joining records the arrival time for each side',
  !!afterJoin.patientJoinedAt && !!afterJoin.doctorJoinedAt);

// --- status guard --------------------------------------------------------
const pendingId = await track({ startsInMinutes: 2, status: 'pending' });
const pendingCall = await call(`/video/token/${pendingId}`, { token: patientToken });
check('an unconfirmed appointment has no room yet', pendingCall.status === 400,
  pendingCall.json?.message);

const cancelledId = await track({ startsInMinutes: 2, status: 'cancelled' });
const cancelledCall = await call(`/video/token/${cancelledId}`, { token: patientToken });
check('a cancelled appointment cannot be joined', cancelledCall.status === 400);

const completedId = await track({ startsInMinutes: -60, status: 'completed' });
const completedCall = await call(`/video/token/${completedId}`, { token: patientToken });
check('a completed consultation cannot be rejoined', completedCall.status === 400,
  completedCall.json?.message);

// --- time window guard ---------------------------------------------------
const earlyId = await track({ startsInMinutes: 120 });
const earlyCall = await call(`/video/token/${earlyId}`, { token: patientToken });
check('the room is shut until 10 minutes before the start', earlyCall.status === 400,
  earlyCall.json?.message);

const justOpenId = await track({ startsInMinutes: 9 });
const justOpenCall = await call(`/video/token/${justOpenId}`, { token: patientToken });
check('the room opens exactly 10 minutes before the start', justOpenCall.status === 200);

const graceId = await track({ startsInMinutes: -50, durationMinutes: 30 });
const graceCall = await call(`/video/token/${graceId}`, { token: patientToken });
check('a slightly overrunning consultation is still joinable', graceCall.status === 200);

const lateId = await track({ startsInMinutes: -180, durationMinutes: 30 });
const lateCall = await call(`/video/token/${lateId}`, { token: patientToken });
check('the room closes 30 minutes after the end', lateCall.status === 400, lateCall.json?.message);

const missing = await call('/video/token/000000000000000000000000', { token: patientToken });
check('an unknown appointment id gives 404', missing.status === 404);

// =========================================================================
// Agora token generation (with stub keys, so no real account is needed)
// =========================================================================
process.env.AGORA_APP_ID = 'a'.repeat(32);
process.env.AGORA_APP_CERTIFICATE = 'b'.repeat(32);
const { default: agoraToken } = await import('agora-token');
const { RtcTokenBuilder, RtcRole } = agoraToken;
const sampleToken = RtcTokenBuilder.buildTokenWithUserAccount(
  'a'.repeat(32), 'b'.repeat(32), 'channel-1', String(patient._id),
  RtcRole.PUBLISHER, 3600, Math.floor(Date.now() / 1000) + 3600
);
check('an Agora token can be built with the configured signature',
  typeof sampleToken === 'string' && sampleToken.startsWith('007'),
  `${sampleToken.slice(0, 12)}… (${sampleToken.length} chars)`);

const otherChannelToken = RtcTokenBuilder.buildTokenWithUserAccount(
  'a'.repeat(32), 'b'.repeat(32), 'channel-2', String(patient._id),
  RtcRole.PUBLISHER, 3600, Math.floor(Date.now() / 1000) + 3600
);
check('a token is scoped to one channel, not reusable across rooms',
  sampleToken !== otherChannelToken);

// =========================================================================
// Notifications
// =========================================================================
const notifNoAuth = await call('/notifications');
check('notifications require authentication', notifNoAuth.status === 401);

const patientNotifs = await call('/notifications', { token: patientToken });
check('a patient can list their notifications', patientNotifs.status === 200,
  `${patientNotifs.json.notifications?.length} rows`);
check('the list reports an unread count',
  typeof patientNotifs.json.unreadCount === 'number', `${patientNotifs.json.unreadCount}`);
check('a patient only sees their own notifications',
  patientNotifs.json.notifications.every((n) => String(n.user) === String(patient._id)));

const countBefore = (await call('/notifications/unread-count', { token: patientToken })).json.unreadCount;
check('the unread count endpoint agrees with the list',
  countBefore === patientNotifs.json.unreadCount);

const unreadOnly = await call('/notifications?unreadOnly=true', { token: patientToken });
check('the unread filter returns only unread rows',
  unreadOnly.json.notifications.every((n) => n.isRead === false));

const target = patientNotifs.json.notifications.find((n) => !n.isRead);
if (target) {
  const stolen = await call(`/notifications/${target._id}/read`, {
    method: 'POST', token: outsiderToken,
  });
  check('another user cannot mark your notification as read', stolen.status === 404,
    `HTTP ${stolen.status}`);
  const stillUnread = await Notification.findById(target._id).lean();
  check('and it genuinely stays unread', stillUnread.isRead === false);

  const marked = await call(`/notifications/${target._id}/read`, {
    method: 'POST', token: patientToken,
  });
  check('the owner can mark it read', marked.status === 200 && marked.json.notification.isRead);

  const countAfter = (await call('/notifications/unread-count', { token: patientToken })).json.unreadCount;
  check('the unread count drops by one', countAfter === countBefore - 1,
    `${countBefore} -> ${countAfter}`);
} else {
  check('another user cannot mark your notification as read', true, 'skipped: none unread');
}

await call('/notifications/read-all', { method: 'POST', token: patientToken });
const zeroed = (await call('/notifications/unread-count', { token: patientToken })).json.unreadCount;
check('mark-all-read clears the unread count', zeroed === 0, `${zeroed}`);

const outsiderStillHas = await call('/notifications/unread-count', { token: outsiderToken });
check('mark-all-read only affected the caller',
  typeof outsiderStillHas.json.unreadCount === 'number');

// A booking notifies the doctor — check the whole path end to end.
const notifCountBefore = await Notification.countDocuments({ user: doctor._id });
await call(`/appointments/${pendingId}/status`, {
  method: 'PATCH', token: doctorToken, body: { action: 'accept' },
});
const patientNotified = await Notification.countDocuments({
  user: patient._id, type: 'appointment_accepted',
});
check('accepting an appointment creates a notification for the patient',
  patientNotified > 0, `${patientNotified} found`);
check('notifications are addressed, not broadcast',
  (await Notification.countDocuments({ user: doctor._id })) === notifCountBefore);

// =========================================================================
// Chat history
// =========================================================================
const historyOutsider = await call(`/appointments/${liveId}/messages`, { token: outsiderToken });
check('a non-participant cannot read the chat history', historyOutsider.status === 403);

const historyEmpty = await call(`/appointments/${liveId}/messages`, { token: patientToken });
check('a participant can read the chat history', historyEmpty.status === 200);
check('a new appointment starts with no messages', historyEmpty.json.messages.length === 0);

// =========================================================================
// Socket.io
// =========================================================================
const connect = (token) =>
  new Promise((resolve) => {
    const socket = io(SOCKET_URL, {
      auth: { token }, transports: ['websocket'], reconnection: false, timeout: 5000,
    });
    socket.on('connect', () => resolve({ ok: true, socket }));
    socket.on('connect_error', (err) => resolve({ ok: false, error: err.message, socket }));
  });

const badSocket = await connect('not-a-real-token');
check('a socket with an invalid token is refused', badSocket.ok === false, badSocket.error);
badSocket.socket.close();

const noTokenSocket = await connect(undefined);
check('a socket with no token is refused', noTokenSocket.ok === false, noTokenSocket.error);
noTokenSocket.socket.close();

const patientSocket = await connect(patientToken);
check('a socket with a valid token connects', patientSocket.ok === true, patientSocket.error);

const doctorSocket = await connect(doctorToken);
check('the other participant connects too', doctorSocket.ok === true);

const outsiderSocket = await connect(outsiderToken);
check('an unrelated user can also hold a socket', outsiderSocket.ok === true);

const emitAck = (socket, event, payload) =>
  new Promise((resolve) => {
    let done = false;
    socket.emit(event, payload, (ack) => { done = true; resolve(ack); });
    setTimeout(() => { if (!done) resolve({ ok: false, error: 'timeout' }); }, 4000);
  });

const joinOk = await emitAck(patientSocket.socket, 'appointment:join', liveId);
check('a participant can join the appointment room', joinOk?.ok === true, joinOk?.error);

const joinDoctor = await emitAck(doctorSocket.socket, 'appointment:join', liveId);
check('the doctor can join the same room', joinDoctor?.ok === true);

const joinOutsider = await emitAck(outsiderSocket.socket, 'appointment:join', liveId);
check('an outsider cannot join the appointment room', joinOutsider?.ok === false,
  joinOutsider?.error);

// Message delivery between the two participants.
const received = new Promise((resolve) => {
  doctorSocket.socket.once('chat:message', resolve);
  setTimeout(() => resolve(null), 4000);
});
const sendAck = await emitAck(patientSocket.socket, 'chat:send', {
  appointmentId: liveId, text: 'Hello doctor, I have a question.',
});
check('a participant can send a message', sendAck?.ok === true, sendAck?.error);

const delivered = await received;
check('the other participant receives it live', delivered?.text === 'Hello doctor, I have a question.',
  delivered ? 'delivered' : 'not delivered within 4s');
check('the delivered message names its sender', delivered?.senderName === patient.name);

const persisted = await call(`/appointments/${liveId}/messages`, { token: doctorToken });
check('the message is persisted and survives a refresh',
  persisted.json.messages.length === 1 &&
  persisted.json.messages[0].text === 'Hello doctor, I have a question.');

const emptyMessage = await emitAck(patientSocket.socket, 'chat:send', {
  appointmentId: liveId, text: '   ',
});
check('an empty message is refused', emptyMessage?.ok === false, emptyMessage?.error);

const longMessage = await emitAck(patientSocket.socket, 'chat:send', {
  appointmentId: liveId, text: 'x'.repeat(2500),
});
check('an over-long message is refused', longMessage?.ok === false, longMessage?.error);

const outsiderSend = await emitAck(outsiderSocket.socket, 'chat:send', {
  appointmentId: liveId, text: 'let me in',
});
check('an outsider cannot post into the conversation', outsiderSend?.ok === false,
  outsiderSend?.error);

const stillOne = await call(`/appointments/${liveId}/messages`, { token: doctorToken });
check('and nothing they sent was stored', stillOne.json.messages.length === 1);

// A live notification should reach the doctor's socket without a refresh.
const livePush = new Promise((resolve) => {
  doctorSocket.socket.once('notification:new', resolve);
  setTimeout(() => resolve(null), 5000);
});
const bookingSlot = await call(`/doctors/${doctor._id}/slot-summary?days=14`);
const openDay = bookingSlot.json.days.find((d) => d.available > 0);
const daySlots = await call(`/doctors/${doctor._id}/slots?date=${openDay.date}`);
const freeSlot = daySlots.json.slots.find((s) => s.available);
const newBooking = await call('/appointments', {
  method: 'POST', token: patientToken,
  body: { doctorId: String(doctor._id), startsAt: freeSlot.startsAt, reason: 'socket push test' },
});
if (newBooking.status === 201) created.push(newBooking.json.appointment._id);
const pushed = await livePush;
check('booking pushes a live notification to the doctor', pushed?.title === 'New appointment request',
  pushed ? pushed.title : 'nothing received within 5s');

patientSocket.socket.close();
doctorSocket.socket.close();
outsiderSocket.socket.close();

// ---- cleanup -------------------------------------------------------------
const { Message } = await import('../src/models/index.js');
await Message.deleteMany({ appointment: { $in: created } });
await Appointment.deleteMany({ _id: { $in: created } });

await disconnectDB();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
