import {
  User,
  PatientProfile,
  DoctorProfile,
  Specialty,
} from '../models/index.js';
import { signToken } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ROLES, VERIFICATION_STATUS } from '../utils/constants.js';
import { sendWelcomeEmail } from '../services/email.service.js';

/**
 * Builds the payload every auth endpoint returns: the user plus whichever
 * role profile applies, so the client can route straight to the right
 * dashboard without a second request.
 */
async function buildSession(user) {
  const payload = { user: user.toSafeJSON(), profile: null };

  if (user.role === ROLES.DOCTOR) {
    payload.profile = await DoctorProfile.findOne({ user: user._id })
      .populate('specialty', 'name slug icon')
      .lean();
  } else if (user.role === ROLES.PATIENT) {
    // Not .lean() — the profile exposes an `age` virtual computed from the
    // date of birth, and lean documents skip virtuals entirely.
    const patientProfile = await PatientProfile.findOne({ user: user._id });
    payload.profile = patientProfile ? patientProfile.toJSON() : null;
  }

  return payload;
}

export const registerPatient = asyncHandler(async (req, res) => {
  const { name, email, password, phone, preferredLanguage, dateOfBirth, gender } =
    req.body;

  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with that email already exists');
  }

  const user = new User({
    name,
    email,
    phone,
    preferredLanguage,
    role: ROLES.PATIENT,
  });
  await user.setPassword(password);
  await user.save();

  try {
    await PatientProfile.create({
      user: user._id,
      dateOfBirth,
      gender,
    });
  } catch (err) {
    // Don't leave an orphaned User behind if the profile insert fails.
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  sendWelcomeEmail(user).catch(() => {});

  res.status(201).json({
    success: true,
    token: signToken(user),
    ...(await buildSession(user)),
  });
});

export const registerDoctor = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    preferredLanguage,
    specialty,
    registrationNumber,
    qualifications,
    experienceYears,
    bio,
    languages,
    consultationFee,
  } = req.body;

  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with that email already exists');
  }

  const specialtyDoc = await Specialty.findOne({ _id: specialty, isActive: true });
  if (!specialtyDoc) throw ApiError.badRequest('Select a valid specialty');

  const user = new User({
    name,
    email,
    phone,
    preferredLanguage,
    role: ROLES.DOCTOR,
  });
  await user.setPassword(password);
  await user.save();

  try {
    await DoctorProfile.create({
      user: user._id,
      specialty: specialtyDoc._id,
      registrationNumber,
      qualifications,
      experienceYears,
      bio,
      languages,
      consultationFee,
      // Every new doctor starts unverified and stays hidden from patients
      // until an administrator approves them.
      verificationStatus: VERIFICATION_STATUS.PENDING,
    });
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    throw err;
  }

  sendWelcomeEmail(user).catch(() => {});

  res.status(201).json({
    success: true,
    token: signToken(user),
    ...(await buildSession(user)),
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  // Same message for unknown email and wrong password so the endpoint
  // cannot be used to enumerate which addresses have accounts.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated');
  }

  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    success: true,
    token: signToken(user),
    ...(await buildSession(user)),
  });
});

export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await buildSession(req.user)) });
});

export const updateMe = asyncHandler(async (req, res) => {
  Object.assign(req.user, req.body);
  await req.user.save();
  res.json({ success: true, ...(await buildSession(req.user)) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect');
  }

  await user.setPassword(newPassword);
  await user.save();

  res.json({ success: true, message: 'Password updated' });
});
