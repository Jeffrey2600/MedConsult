import { Appointment } from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { APPOINTMENT_STATUS, ROLES } from '../utils/constants.js';
import { env, features } from '../config/env.js';
import { buildRtcToken, buildJitsiRoom } from '../services/agora.service.js';
import { emitToUser } from '../sockets/index.js';
import { dayjs } from '../utils/slots.js';

/** The consultation room opens shortly before, and closes a while after. */
export const JOIN_WINDOW_BEFORE_MINUTES = 10;
export const JOIN_WINDOW_AFTER_MINUTES = 30;

/**
 * Issues the credentials needed to join a consultation.
 *
 * Four things are checked before anything is minted, and all four matter:
 * the appointment must exist, the caller must be one of its two
 * participants, it must actually be confirmed, and the current time must
 * fall inside the join window. Without the last two, an accepted-then-
 * cancelled appointment or a booking three weeks away would still hand out
 * a working key to a video room.
 */
export const getVideoToken = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.appointmentId)
    .populate('patient', 'name avatarUrl')
    .populate('doctor', 'name avatarUrl');

  if (!appointment) throw ApiError.notFound('Appointment not found');

  const isPatient = String(appointment.patient._id) === String(req.user._id);
  const isDoctor = String(appointment.doctor._id) === String(req.user._id);
  if (!isPatient && !isDoctor) {
    // Deliberately not 404 — the caller is authenticated and the record
    // exists; they simply have no business in this room.
    throw ApiError.forbidden('This is not your consultation');
  }

  if (appointment.status !== APPOINTMENT_STATUS.ACCEPTED) {
    throw ApiError.badRequest(
      appointment.status === APPOINTMENT_STATUS.COMPLETED
        ? 'This consultation has already been completed'
        : 'The consultation room opens once the doctor confirms the appointment'
    );
  }

  const now = dayjs();
  const opensAt = dayjs(appointment.startsAt).subtract(JOIN_WINDOW_BEFORE_MINUTES, 'minute');
  const closesAt = dayjs(appointment.endsAt).add(JOIN_WINDOW_AFTER_MINUTES, 'minute');

  if (now.isBefore(opensAt)) {
    throw ApiError.badRequest(
      `The consultation room opens ${JOIN_WINDOW_BEFORE_MINUTES} minutes before the scheduled time`
    );
  }
  if (now.isAfter(closesAt)) {
    throw ApiError.badRequest('This consultation window has closed');
  }

  const channel = appointment.videoChannel || String(appointment._id);

  // Record arrival, and let the other party's open room know.
  const field = isDoctor ? 'doctorJoinedAt' : 'patientJoinedAt';
  if (!appointment[field]) {
    appointment[field] = new Date();
    await appointment.save();
  }
  const otherPartyId = isDoctor ? appointment.patient._id : appointment.doctor._id;
  emitToUser(otherPartyId, 'call:participant-joined', {
    appointmentId: String(appointment._id),
    name: req.user.name,
  });

  const shared = {
    success: true,
    channel,
    appointmentId: String(appointment._id),
    role: isDoctor ? ROLES.DOCTOR : ROLES.PATIENT,
    otherParty: isDoctor ? appointment.patient : appointment.doctor,
    endsAt: appointment.endsAt,
    windowClosesAt: closesAt.toDate(),
  };

  // Falls back to Jitsi whenever Agora is unconfigured or switched off, so a
  // missing key degrades to a working call rather than a broken screen.
  if (!features.agora || env.videoProvider !== 'agora') {
    return res.json({
      ...shared,
      provider: 'jitsi',
      jitsiRoom: buildJitsiRoom(appointment._id),
    });
  }

  const credentials = buildRtcToken({ channelName: channel, userId: req.user._id });

  res.json({ ...shared, provider: 'agora', ...credentials });
});
