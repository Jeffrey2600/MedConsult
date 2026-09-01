import { Specialty, DoctorProfile } from '../models/index.js';
import { slugify } from '../models/Specialty.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { VERIFICATION_STATUS } from '../utils/constants.js';

/**
 * Public list of specialties, each with a count of approved doctors so the
 * patient-facing browse screen can hide or grey out empty categories.
 */
export const listSpecialties = asyncHandler(async (req, res) => {
  const includeInactive = req.validatedQuery?.includeInactive === true;
  const filter = includeInactive ? {} : { isActive: true };

  const specialties = await Specialty.find(filter).sort({ name: 1 }).lean();

  const counts = await DoctorProfile.aggregate([
    { $match: { verificationStatus: VERIFICATION_STATUS.APPROVED } },
    { $group: { _id: '$specialty', count: { $sum: 1 } } },
  ]);
  const countBySpecialty = Object.fromEntries(
    counts.map((c) => [String(c._id), c.count])
  );

  res.json({
    success: true,
    specialties: specialties.map((s) => ({
      ...s,
      doctorCount: countBySpecialty[String(s._id)] || 0,
    })),
  });
});

export const createSpecialty = asyncHandler(async (req, res) => {
  const { name, description, icon } = req.body;
  const slug = slugify(name);

  if (await Specialty.exists({ $or: [{ name }, { slug }] })) {
    throw ApiError.conflict('A specialty with that name already exists');
  }

  const specialty = await Specialty.create({ name, slug, description, icon });
  res.status(201).json({ success: true, specialty });
});

export const updateSpecialty = asyncHandler(async (req, res) => {
  const specialty = await Specialty.findById(req.params.id);
  if (!specialty) throw ApiError.notFound('Specialty not found');

  const { name, description, icon, isActive } = req.body;

  if (name && name !== specialty.name) {
    const slug = slugify(name);
    const clash = await Specialty.exists({
      _id: { $ne: specialty._id },
      $or: [{ name }, { slug }],
    });
    if (clash) throw ApiError.conflict('A specialty with that name already exists');
    specialty.name = name;
    specialty.slug = slug;
  }

  if (description !== undefined) specialty.description = description;
  if (icon !== undefined) specialty.icon = icon;
  if (isActive !== undefined) specialty.isActive = isActive;

  await specialty.save();
  res.json({ success: true, specialty });
});

/**
 * Specialties are deactivated rather than deleted while doctors still
 * reference them — removing the row would leave those profiles dangling.
 */
export const deleteSpecialty = asyncHandler(async (req, res) => {
  const specialty = await Specialty.findById(req.params.id);
  if (!specialty) throw ApiError.notFound('Specialty not found');

  const inUse = await DoctorProfile.countDocuments({ specialty: specialty._id });
  if (inUse > 0) {
    specialty.isActive = false;
    await specialty.save();
    return res.json({
      success: true,
      deactivated: true,
      message: `${inUse} doctor(s) still use this specialty, so it was deactivated instead of deleted.`,
      specialty,
    });
  }

  await specialty.deleteOne();
  res.json({ success: true, deactivated: false, message: 'Specialty deleted' });
});
