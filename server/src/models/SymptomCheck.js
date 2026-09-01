import mongoose from 'mongoose';
import { URGENCY, SUPPORTED_LANGUAGES } from '../utils/constants.js';

const symptomCheckSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    inputText: { type: String, required: true, maxlength: 2000 },
    ageYears: { type: Number, min: 0, max: 120 },
    gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    durationDays: { type: Number, min: 0 },
    language: { type: String, enum: SUPPORTED_LANGUAGES, default: 'en' },

    /** Which layer produced the answer — shown in the UI and the report. */
    source: {
      type: String,
      enum: ['red_flag_rules', 'gemini', 'rules'],
      required: true,
    },
    suggestedSpecialty: { type: String, default: '' },
    /** Resolved Specialty id when the suggestion matched a known specialty. */
    specialtyRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Specialty' },
    urgency: {
      type: String,
      enum: Object.values(URGENCY),
      default: URGENCY.ROUTINE,
    },
    possibleConditions: { type: [String], default: [] },
    advice: { type: String, default: '' },
    redFlags: { type: [String], default: [] },
    fallbackReason: { type: String, default: '' },
  },
  { timestamps: true }
);

symptomCheckSchema.index({ patient: 1, createdAt: -1 });

export const SymptomCheck = mongoose.model('SymptomCheck', symptomCheckSchema);
