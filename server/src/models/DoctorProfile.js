import mongoose from 'mongoose';
import { VERIFICATION_STATUS, SUPPORTED_LANGUAGES } from '../utils/constants.js';

const doctorProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    specialty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Specialty',
      required: true,
      index: true,
    },
    registrationNumber: { type: String, required: true, trim: true },
    qualifications: { type: [String], default: [] },
    experienceYears: { type: Number, default: 0, min: 0, max: 70 },
    bio: { type: String, default: '', maxlength: 2000 },
    languages: {
      type: [String],
      enum: SUPPORTED_LANGUAGES,
      default: ['en'],
    },
    consultationFee: { type: Number, default: 0, min: 0 },
    clinicAddress: { type: String, default: '' },

    verificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.PENDING,
      index: true,
    },
    rejectionReason: { type: String, default: '' },
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    /** Credential documents (degree, registration certificate) for the admin. */
    documents: [
      {
        title: String,
        publicId: String,
        mimeType: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/** Backs the free-text part of doctor search (name lives on User, so bio here). */
doctorProfileSchema.index({ bio: 'text', registrationNumber: 'text' });

export const DoctorProfile = mongoose.model('DoctorProfile', doctorProfileSchema);
