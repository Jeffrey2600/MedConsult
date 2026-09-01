import mongoose from 'mongoose';
import { RECORD_CATEGORIES } from '../utils/constants.js';

/**
 * A file in the patient's Digital Health Record.
 *
 * Note there is no public URL stored. Files are uploaded to Cloudinary as
 * `authenticated` assets under a random public id, and a short-lived signed
 * URL is minted per request after an authorisation check. That keeps medical
 * documents off guessable public links.
 */
const medicalRecordSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    category: {
      type: String,
      enum: RECORD_CATEGORIES,
      default: 'other',
      index: true,
    },
    notes: { type: String, default: '', maxlength: 1000 },
    recordDate: { type: Date, default: Date.now },

    publicId: { type: String, required: true },
    resourceType: { type: String, default: 'raw' },
    format: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    sizeBytes: { type: Number, default: 0 },
    originalName: { type: String, default: '' },
    /** Local dev fallback when Cloudinary credentials are absent. */
    localPath: { type: String, default: '' },
  },
  { timestamps: true }
);

medicalRecordSchema.index({ patient: 1, createdAt: -1 });

export const MedicalRecord = mongoose.model('MedicalRecord', medicalRecordSchema);
