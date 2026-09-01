import mongoose from 'mongoose';
import { User, DoctorProfile, Specialty, Appointment } from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { VERIFICATION_STATUS, APPOINTMENT_STATUS } from '../utils/constants.js';

/**
 * Patient-facing doctor search.
 *
 * The doctor's name lives on User while the searchable professional fields
 * live on DoctorProfile, so this runs as an aggregation that joins the two
 * and filters on the combined document. Only approved, active doctors are
 * ever returned — an unverified doctor is invisible to patients.
 */
export const listDoctors = asyncHandler(async (req, res) => {
  const {
    specialty,
    q = '',
    language,
    minExperience,
    maxFee,
    sort = 'rating',
    page = 1,
    limit = 12,
  } = req.validatedQuery ?? {};

  const match = { verificationStatus: VERIFICATION_STATUS.APPROVED };
  if (specialty) match.specialty = new mongoose.Types.ObjectId(specialty);
  if (language) match.languages = language;
  if (minExperience !== undefined) match.experienceYears = { $gte: minExperience };
  if (maxFee !== undefined) match.consultationFee = { $lte: maxFee };

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $match: { 'user.isActive': true } },
  ];

  // Free-text search spans the doctor's name and their bio.
  if (q.trim()) {
    const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    pipeline.push({ $match: { $or: [{ 'user.name': rx }, { bio: rx }] } });
  }

  pipeline.push({
    $lookup: {
      from: 'specialties',
      localField: 'specialty',
      foreignField: '_id',
      as: 'specialty',
    },
  });
  pipeline.push({ $unwind: '$specialty' });

  const sortStage = {
    rating: { ratingAverage: -1, ratingCount: -1 },
    experience: { experienceYears: -1 },
    feeAsc: { consultationFee: 1 },
    feeDesc: { consultationFee: -1 },
    name: { 'user.name': 1 },
  }[sort] ?? { ratingAverage: -1 };
  pipeline.push({ $sort: sortStage });

  pipeline.push({
    $project: {
      registrationNumber: 0,
      documents: 0,
      verifiedBy: 0,
      rejectionReason: 0,
      'user.passwordHash': 0,
      'user.email': 0,
      'user.phone': 0,
      'user.lastLoginAt': 0,
    },
  });

  // $facet returns the page and the total count in a single round trip.
  pipeline.push({
    $facet: {
      results: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      total: [{ $count: 'count' }],
    },
  });

  const [facet] = await DoctorProfile.aggregate(pipeline);
  const total = facet?.total?.[0]?.count ?? 0;

  res.json({
    success: true,
    doctors: facet?.results ?? [],
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

/** Public profile of a single approved doctor. */
export const getDoctor = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({
    user: req.params.id,
    verificationStatus: VERIFICATION_STATUS.APPROVED,
  })
    .populate('user', 'name avatarUrl preferredLanguage isActive')
    .populate('specialty', 'name slug icon description')
    .select('-registrationNumber -documents -verifiedBy -rejectionReason')
    .lean();

  if (!profile || !profile.user?.isActive) {
    throw ApiError.notFound('Doctor not found');
  }

  const consultations = await Appointment.countDocuments({
    doctor: req.params.id,
    status: APPOINTMENT_STATUS.COMPLETED,
  });

  res.json({ success: true, doctor: { ...profile, completedConsultations: consultations } });
});

/** The signed-in doctor's own full profile, including private fields. */
export const getMyDoctorProfile = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ user: req.user._id })
    .populate('specialty', 'name slug icon')
    .lean();
  if (!profile) throw ApiError.notFound('Doctor profile not found');
  res.json({ success: true, profile });
});

export const updateMyDoctorProfile = asyncHandler(async (req, res) => {
  const profile = await DoctorProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound('Doctor profile not found');

  const {
    specialty,
    registrationNumber,
    qualifications,
    experienceYears,
    bio,
    languages,
    consultationFee,
    clinicAddress,
  } = req.body;

  if (specialty && String(specialty) !== String(profile.specialty)) {
    const exists = await Specialty.exists({ _id: specialty, isActive: true });
    if (!exists) throw ApiError.badRequest('Select a valid specialty');
    profile.specialty = specialty;
  }

  // Changing the registration number invalidates the previous approval —
  // the admin verified a specific credential, not the account in general.
  if (
    registrationNumber &&
    registrationNumber !== profile.registrationNumber &&
    profile.verificationStatus === VERIFICATION_STATUS.APPROVED
  ) {
    profile.verificationStatus = VERIFICATION_STATUS.PENDING;
    profile.verifiedAt = undefined;
    profile.verifiedBy = undefined;
  }
  if (registrationNumber) profile.registrationNumber = registrationNumber;

  if (qualifications !== undefined) profile.qualifications = qualifications;
  if (experienceYears !== undefined) profile.experienceYears = experienceYears;
  if (bio !== undefined) profile.bio = bio;
  if (languages !== undefined) profile.languages = languages;
  if (consultationFee !== undefined) profile.consultationFee = consultationFee;
  if (clinicAddress !== undefined) profile.clinicAddress = clinicAddress;

  await profile.save();
  await profile.populate('specialty', 'name slug icon');

  res.json({ success: true, profile: profile.toJSON() });
});
