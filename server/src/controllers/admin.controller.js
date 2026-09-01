import {
  User,
  DoctorProfile,
  PatientProfile,
  Appointment,
  Prescription,
  SosEvent,
  getSettings,
  setSettings,
} from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import {
  ROLES,
  VERIFICATION_STATUS,
  APPOINTMENT_STATUS,
  NOTIFICATION_TYPES,
} from '../utils/constants.js';
import { notify } from '../services/notification.service.js';
import { sendDoctorVerificationEmail } from '../services/email.service.js';

/** Counts for the admin dashboard, gathered in one parallel batch. */
export const getStats = asyncHandler(async (req, res) => {
  const [
    patients,
    doctorsApproved,
    doctorsPending,
    doctorsRejected,
    appointmentsTotal,
    appointmentsPending,
    appointmentsCompleted,
    prescriptions,
    sosEvents,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.PATIENT }),
    DoctorProfile.countDocuments({ verificationStatus: VERIFICATION_STATUS.APPROVED }),
    DoctorProfile.countDocuments({ verificationStatus: VERIFICATION_STATUS.PENDING }),
    DoctorProfile.countDocuments({ verificationStatus: VERIFICATION_STATUS.REJECTED }),
    Appointment.countDocuments(),
    Appointment.countDocuments({ status: APPOINTMENT_STATUS.PENDING }),
    Appointment.countDocuments({ status: APPOINTMENT_STATUS.COMPLETED }),
    Prescription.countDocuments(),
    SosEvent.countDocuments(),
  ]);

  res.json({
    success: true,
    stats: {
      patients,
      doctors: {
        approved: doctorsApproved,
        pending: doctorsPending,
        rejected: doctorsRejected,
        total: doctorsApproved + doctorsPending + doctorsRejected,
      },
      appointments: {
        total: appointmentsTotal,
        pending: appointmentsPending,
        completed: appointmentsCompleted,
      },
      prescriptions,
      sosEvents,
    },
  });
});

/** The verification queue — pending first, then recently decided ones. */
export const listDoctorsForVerification = asyncHandler(async (req, res) => {
  const { status = VERIFICATION_STATUS.PENDING } = req.validatedQuery ?? {};

  const profiles = await DoctorProfile.find({ verificationStatus: status })
    .populate('user', 'name email phone isActive createdAt preferredLanguage')
    .populate('specialty', 'name slug')
    .populate('verifiedBy', 'name')
    .sort({ createdAt: 1 })
    .lean();

  res.json({ success: true, doctors: profiles });
});

export const verifyDoctor = asyncHandler(async (req, res) => {
  const { approve, reason = '' } = req.body;

  const profile = await DoctorProfile.findById(req.params.id).populate(
    'user',
    'name email preferredLanguage'
  );
  if (!profile) throw ApiError.notFound('Doctor profile not found');

  if (!approve && !reason.trim()) {
    throw ApiError.badRequest('Give a reason when rejecting a registration');
  }

  profile.verificationStatus = approve
    ? VERIFICATION_STATUS.APPROVED
    : VERIFICATION_STATUS.REJECTED;
  profile.rejectionReason = approve ? '' : reason.trim();
  profile.verifiedAt = new Date();
  profile.verifiedBy = req.user._id;
  await profile.save();

  await notify({
    user: profile.user._id,
    type: approve
      ? NOTIFICATION_TYPES.DOCTOR_APPROVED
      : NOTIFICATION_TYPES.DOCTOR_REJECTED,
    title: approve
      ? 'Your account has been verified'
      : 'Your registration was not approved',
    body: approve
      ? 'Your profile is now visible to patients and you can accept appointments.'
      : profile.rejectionReason,
    link: '/doctor/profile',
  });

  // Email is a side effect — never let a slow SMTP server hold the response.
  sendDoctorVerificationEmail(profile.user, approve, profile.rejectionReason).catch(
    () => {}
  );

  res.json({ success: true, profile: profile.toJSON() });
});

export const listUsers = asyncHandler(async (req, res) => {
  const { role, q = '', isActive, page = 1, limit = 20 } = req.validatedQuery ?? {};

  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;
  if (q.trim()) {
    const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    users: users.map(({ passwordHash, ...u }) => u),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** Soft enable/disable. Accounts are never hard-deleted — records reference them. */
export const setUserActive = asyncHandler(async (req, res) => {
  const { isActive } = req.body;

  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  // Losing the last administrator would lock everyone out of the admin panel.
  if (user.role === ROLES.ADMIN && !isActive) {
    const activeAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      isActive: true,
      _id: { $ne: user._id },
    });
    if (activeAdmins === 0) {
      throw ApiError.badRequest('At least one active administrator must remain');
    }
  }

  user.isActive = isActive;
  await user.save();

  res.json({ success: true, user: user.toSafeJSON() });
});

/** Full detail for one user, including their role profile. */
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw ApiError.notFound('User not found');
  delete user.passwordHash;

  let profile = null;
  if (user.role === ROLES.DOCTOR) {
    profile = await DoctorProfile.findOne({ user: user._id })
      .populate('specialty', 'name slug')
      .lean();
  } else if (user.role === ROLES.PATIENT) {
    profile = await PatientProfile.findOne({ user: user._id }).lean();
  }

  res.json({ success: true, user, profile });
});

export const listAllAppointments = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.validatedQuery ?? {};

  const filter = {};
  if (status) filter.status = status;

  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .populate('patient', 'name email')
      .populate('doctor', 'name email')
      .sort({ startsAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Appointment.countDocuments(filter),
  ]);

  res.json({
    success: true,
    appointments,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const listSosEvents = asyncHandler(async (req, res) => {
  const events = await SosEvent.find()
    .populate('patient', 'name email phone')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ success: true, events });
});

export const getSystemSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, settings: await getSettings() });
});

export const updateSystemSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, settings: await setSettings(req.body) });
});
