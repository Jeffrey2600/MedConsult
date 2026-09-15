import mongoose from 'mongoose';
import { URGENCY, SUPPORTED_LANGUAGES } from '../utils/constants.js';

/**
 * A result from the document intelligence engine (lab report / prescription
 * / scan reader). Only the extracted, structured result is kept — the
 * uploaded file itself is never written to disk or object storage. That
 * matches how the feature is described to users: "processed transiently for
 * interpretation," not added to their permanent record store. A patient who
 * wants the document itself kept uses Health Records, which is the
 * persistent, access-controlled store; this is a one-shot reading aid.
 */
const findingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 200 },
    value: { type: String, default: '', maxlength: 100 },
    unit: { type: String, default: '', maxlength: 40 },
    referenceRange: { type: String, default: '', maxlength: 100 },
    status: {
      type: String,
      enum: ['normal', 'high', 'low', 'unclear'],
      default: 'unclear',
    },
    explanation: { type: String, default: '', maxlength: 500 },
  },
  { _id: false }
);

const documentCheckSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalFilename: { type: String, default: '', maxlength: 260 },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    language: { type: String, enum: SUPPORTED_LANGUAGES, default: 'en' },

    source: { type: String, enum: ['gemini', 'unavailable'], required: true },
    documentType: { type: String, default: 'Other', maxlength: 100 },
    summary: { type: String, default: '', maxlength: 2500 },
    findings: { type: [findingSchema], default: [] },
    suggestedSpecialty: { type: String, default: '' },
    specialtyRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Specialty' },
    urgency: { type: String, enum: Object.values(URGENCY), default: URGENCY.ROUTINE },
    fallbackReason: { type: String, default: '' },
  },
  { timestamps: true }
);

documentCheckSchema.index({ patient: 1, createdAt: -1 });

export const DocumentCheck = mongoose.model('DocumentCheck', documentCheckSchema);
