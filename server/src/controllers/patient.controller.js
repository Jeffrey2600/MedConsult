import { PatientProfile } from '../models/index.js';
import { asyncHandler } from '../utils/ApiError.js';

export const getMyPatientProfile = asyncHandler(async (req, res) => {
  // Created on registration, but upserted here so a profile can never be
  // missing for an account that exists.
  let profile = await PatientProfile.findOne({ user: req.user._id });
  if (!profile) profile = await PatientProfile.create({ user: req.user._id });

  res.json({ success: true, profile: profile.toJSON() });
});

export const updateMyPatientProfile = asyncHandler(async (req, res) => {
  let profile = await PatientProfile.findOne({ user: req.user._id });
  if (!profile) profile = new PatientProfile({ user: req.user._id });

  const {
    dateOfBirth, gender, bloodGroup, heightCm, weightKg,
    allergies, chronicConditions, currentMedications, address, emergencyContact,
  } = req.body;

  if (dateOfBirth !== undefined) profile.dateOfBirth = dateOfBirth;
  if (gender !== undefined) profile.gender = gender;
  if (bloodGroup !== undefined) profile.bloodGroup = bloodGroup;
  if (heightCm !== undefined) profile.heightCm = heightCm;
  if (weightKg !== undefined) profile.weightKg = weightKg;
  if (allergies !== undefined) profile.allergies = allergies;
  if (chronicConditions !== undefined) profile.chronicConditions = chronicConditions;
  if (currentMedications !== undefined) profile.currentMedications = currentMedications;
  if (address !== undefined) profile.address = address;

  // Merged rather than replaced, so updating only the WhatsApp number does
  // not silently wipe the contact's email.
  if (emergencyContact !== undefined) {
    profile.emergencyContact = {
      ...(profile.emergencyContact?.toObject?.() ?? profile.emergencyContact ?? {}),
      ...emergencyContact,
    };
  }

  await profile.save();
  res.json({ success: true, profile: profile.toJSON() });
});
