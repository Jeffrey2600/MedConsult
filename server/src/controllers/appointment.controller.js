import {
  Appointment,
  User,
  DoctorProfile,
  AvailabilityRule,
  BlockedDate,
  Prescription,
} from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import {
  ROLES,
  APPOINTMENT_STATUS,
  ACTIVE_APPOINTMENT_STATUSES,
  VERIFICATION_STATUS,
  NOTIFICATION_TYPES,
} from '../utils/constants.js';
import { findMatchingSlot, dayjs, MAX_ADVANCE_DAYS } from '../utils/slots.js';
import { notify } from '../services/notification.service.js';
import { emitToUser } from '../sockets/index.js';
import {
  sendAppointmentBookedEmail,
  sendAppointmentDecisionEmail,
} from '../services/email.service.js';

/** Which transitions each role may perform, and from which states. */
const TRANSITIONS = {
  accept: {
    roles: [ROLES.DOCTOR],
    from: [APPOINTMENT_STATUS.PENDING],
    to: APPOINTMENT_STATUS.ACCEPTED,
  },
  reject: {
    roles: [ROLES.DOCTOR],
    from: [APPOINTMENT_STATUS.PENDING],
    to: APPOINTMENT_STATUS.REJECTED,
    requiresReason: true,
  },
  cancel: {
    roles: [ROLES.PATIENT, ROLES.DOCTOR],
    from: [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.ACCEPTED],
    to: APPOINTMENT_STATUS.CANCELLED,
  },
  complete: {
    roles: [ROLES.DOCTOR],
    from: [APPOINTMENT_STATUS.ACCEPTED],
    to: APPOINTMENT_STATUS.COMPLETED,
  },
};

export const createAppointment = asyncHandler(async (req, res) => {
  const { doctorId, startsAt, reason = '', symptomCheckId } = req.body;

  const doctorUser = await User.findOne({
    _id: doctorId,
    role: ROLES.DOCTOR,
    isActive: true,
  });
  if (!doctorUser) throw ApiError.notFound('Doctor not found');

  const profile = await DoctorProfile.findOne({ user: doctorId }).lean();
  if (!profile || profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw ApiError.badRequest('This doctor is not currently accepting appointments');
  }

  const requested = new Date(startsAt);
  if (dayjs(requested).isAfter(dayjs().add(MAX_ADVANCE_DAYS, 'day'))) {
    throw ApiError.badRequest(
      `Appointments can only be booked up to ${MAX_ADVANCE_DAYS} days ahead`
    );
  }

  const [rules, blocked, taken] = await Promise.all([
    AvailabilityRule.find({ doctor: doctorId, isActive: true }).lean(),
    BlockedDate.find({ doctor: doctorId }).select('date').lean(),
    Appointment.find({
      doctor: doctorId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      startsAt: {
        $gte: dayjs(requested).subtract(2, 'day').toDate(),
        $lte: dayjs(requested).add(2, 'day').toDate(),
      },
    })
      .select('startsAt')
      .lean(),
  ]);

  // The requested instant must be a slot the doctor actually published.
  // Without this check a patient could post any timestamp and book a doctor
  // outside their working hours entirely.
  const slot = findMatchingSlot({
    rules,
    startsAt: requested,
    blockedDates: new Set(blocked.map((b) => b.date)),
    bookedStarts: new Set(taken.map((a) => new Date(a.startsAt).getTime())),
  });

  if (!slot) {
    throw ApiError.badRequest(
      'That time is not one of this doctor’s available slots. Please pick a slot from the calendar.'
    );
  }
  if (!slot.available) {
    throw ApiError.conflict(
      slot.reason === 'past'
        ? 'That slot has already passed'
        : 'That slot has just been taken. Please choose another.'
    );
  }

  // A patient cannot be in two consultations at once.
  const clash = await Appointment.findOne({
    patient: req.user._id,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    startsAt: requested,
  }).lean();
  if (clash) {
    throw ApiError.conflict('You already have an appointment booked at that time');
  }

  let appointment;
  try {
    appointment = await Appointment.create({
      patient: req.user._id,
      doctor: doctorId,
      startsAt: requested,
      endsAt: new Date(slot.endsAt),
      reason,
      symptomCheck: symptomCheckId || undefined,
      status: APPOINTMENT_STATUS.PENDING,
    });
  } catch (err) {
    // The unique partial index on (doctor, startsAt) is the real guarantee:
    // if two patients submit the same slot simultaneously, exactly one insert
    // succeeds and the other lands here.
    if (err.code === 11000) {
      throw ApiError.conflict('That slot has just been taken. Please choose another.');
    }
    throw err;
  }

  await notify({
    user: doctorId,
    type: NOTIFICATION_TYPES.APPOINTMENT_BOOKED,
    title: 'New appointment request',
    body: `${req.user.name} requested an appointment.`,
    link: '/doctor/appointments',
  });
  emitToUser(doctorId, 'appointment:updated', { id: String(appointment._id) });

  sendAppointmentBookedEmail(doctorUser, req.user, appointment).catch(() => {});

  const populated = await appointment.populate([
    { path: 'doctor', select: 'name avatarUrl' },
    { path: 'patient', select: 'name avatarUrl' },
  ]);

  res.status(201).json({ success: true, appointment: populated.toJSON() });
});

/** Attaches each doctor's specialty in one extra query rather than N. */
async function withSpecialties(appointments) {
  const doctorIds = [...new Set(appointments.map((a) => String(a.doctor?._id ?? a.doctor)))];
  const profiles = await DoctorProfile.find({ user: { $in: doctorIds } })
    .populate('specialty', 'name slug icon')
    .select('user specialty consultationFee')
    .lean();

  const byUser = Object.fromEntries(profiles.map((p) => [String(p.user), p]));

  return appointments.map((a) => ({
    ...a,
    doctorProfile: byUser[String(a.doctor?._id ?? a.doctor)] ?? null,
  }));
}

export const listAppointments = asyncHandler(async (req, res) => {
  const { scope = 'all', status, page = 1, limit = 20 } = req.validatedQuery ?? {};

  const filter =
    req.user.role === ROLES.DOCTOR
      ? { doctor: req.user._id }
      : { patient: req.user._id };

  if (status) filter.status = status;

  const now = new Date();
  if (scope === 'upcoming') {
    // Keyed on the END time, not the start. A consultation that began ten
    // minutes ago and runs for another twenty is still very much upcoming
    // from the patient's point of view — filing it under "past" while they
    // are trying to join it would be actively unhelpful.
    filter.endsAt = { $gte: now };
    filter.status = status ?? { $in: ACTIVE_APPOINTMENT_STATUSES };
  } else if (scope === 'past') {
    // Anything concluded, plus anything whose window has fully closed.
    filter.$or = [
      { status: { $in: [APPOINTMENT_STATUS.COMPLETED, APPOINTMENT_STATUS.REJECTED, APPOINTMENT_STATUS.CANCELLED] } },
      { endsAt: { $lt: now } },
    ];
  }

  const sort = scope === 'upcoming' ? { startsAt: 1 } : { startsAt: -1 };

  const [rows, total] = await Promise.all([
    Appointment.find(filter)
      .populate('patient', 'name avatarUrl preferredLanguage')
      .populate('doctor', 'name avatarUrl')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Appointment.countDocuments(filter),
  ]);

  const appointments = await withSpecialties(rows);

  // Flag which ones already have a prescription so the list can link to it.
  const ids = appointments.map((a) => a._id);
  const prescriptions = await Prescription.find({ appointment: { $in: ids } })
    .select('appointment')
    .lean();
  const hasPrescription = new Set(prescriptions.map((p) => String(p.appointment)));

  res.json({
    success: true,
    appointments: appointments.map((a) => ({
      ...a,
      hasPrescription: hasPrescription.has(String(a._id)),
    })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('patient', 'name avatarUrl preferredLanguage phone')
    .populate('doctor', 'name avatarUrl')
    .lean();

  if (!appointment) throw ApiError.notFound('Appointment not found');

  const isParticipant =
    String(appointment.patient._id) === String(req.user._id) ||
    String(appointment.doctor._id) === String(req.user._id);

  if (!isParticipant && req.user.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('This is not your appointment');
  }

  const [withSpecialty] = await withSpecialties([appointment]);
  const prescription = await Prescription.findOne({ appointment: appointment._id }).lean();

  res.json({
    success: true,
    appointment: { ...withSpecialty, prescription: prescription ?? null },
  });
});

/**
 * Single entry point for every status change, so the rules about who may do
 * what, and from which state, live in one table rather than scattered across
 * four endpoints.
 */
export const updateAppointmentStatus = asyncHandler(async (req, res) => {
  const { action, reason = '' } = req.body;
  const rule = TRANSITIONS[action];
  if (!rule) throw ApiError.badRequest('Unknown action');

  const appointment = await Appointment.findById(req.params.id)
    .populate('patient', 'name email preferredLanguage')
    .populate('doctor', 'name email preferredLanguage');
  if (!appointment) throw ApiError.notFound('Appointment not found');

  const isPatient = String(appointment.patient._id) === String(req.user._id);
  const isDoctor = String(appointment.doctor._id) === String(req.user._id);
  if (!isPatient && !isDoctor) {
    throw ApiError.forbidden('This is not your appointment');
  }

  if (!rule.roles.includes(req.user.role)) {
    throw ApiError.forbidden(`Only the ${rule.roles.join(' or ')} can do that`);
  }

  if (!rule.from.includes(appointment.status)) {
    throw ApiError.badRequest(
      `You cannot ${action} an appointment that is already ${appointment.status}`
    );
  }

  if (rule.requiresReason && !reason.trim()) {
    throw ApiError.badRequest('Please give a reason');
  }

  appointment.status = rule.to;

  if (action === 'accept') {
    // The channel name is the appointment id, so both sides derive the same
    // room without any extra coordination.
    appointment.videoChannel = String(appointment._id);
  } else if (action === 'reject') {
    appointment.rejectionReason = reason.trim();
  } else if (action === 'cancel') {
    appointment.cancelledBy = req.user._id;
    appointment.cancellationReason = reason.trim();
  } else if (action === 'complete') {
    appointment.completedAt = new Date();
    if (reason.trim()) appointment.doctorNotes = reason.trim();
  }

  await appointment.save();

  // Tell the other party.
  const otherParty = isDoctor ? appointment.patient : appointment.doctor;
  const actorName = isDoctor ? `Dr. ${appointment.doctor.name.replace(/^Dr\.?\s*/i, '')}` : appointment.patient.name;

  const NOTICE = {
    accept: {
      type: NOTIFICATION_TYPES.APPOINTMENT_ACCEPTED,
      title: 'Appointment confirmed',
      body: `${actorName} confirmed your appointment.`,
    },
    reject: {
      type: NOTIFICATION_TYPES.APPOINTMENT_REJECTED,
      title: 'Appointment declined',
      body: appointment.rejectionReason,
    },
    cancel: {
      type: NOTIFICATION_TYPES.APPOINTMENT_CANCELLED,
      title: 'Appointment cancelled',
      body: `${actorName} cancelled the appointment.`,
    },
    complete: {
      type: NOTIFICATION_TYPES.APPOINTMENT_COMPLETED,
      title: 'Consultation completed',
      body: 'Your consultation has been marked complete.',
    },
  }[action];

  await notify({
    user: otherParty._id,
    ...NOTICE,
    link: isDoctor ? '/patient/appointments' : '/doctor/appointments',
  });
  emitToUser(otherParty._id, 'appointment:updated', { id: String(appointment._id) });

  if (action === 'accept' || action === 'reject') {
    sendAppointmentDecisionEmail(
      appointment.patient,
      appointment.doctor,
      appointment,
      action === 'accept'
    ).catch(() => {});
  }

  res.json({ success: true, appointment: appointment.toJSON() });
});

/** Distinct patients this doctor has consulted, for the doctor's patient list. */
export const listMyPatients = asyncHandler(async (req, res) => {
  const rows = await Appointment.aggregate([
    { $match: { doctor: req.user._id } },
    { $sort: { startsAt: -1 } },
    {
      $group: {
        _id: '$patient',
        lastVisit: { $first: '$startsAt' },
        totalAppointments: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', APPOINTMENT_STATUS.COMPLETED] }, 1, 0] },
        },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $lookup: {
        from: 'patientprofiles',
        localField: '_id',
        foreignField: 'user',
        as: 'profile',
      },
    },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        'user.passwordHash': 0,
        'user.role': 0,
      },
    },
    { $sort: { lastVisit: -1 } },
  ]);

  res.json({ success: true, patients: rows });
});
