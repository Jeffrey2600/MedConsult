import mongoose from 'mongoose';
import { SUPPORTED_LANGUAGES } from '../utils/constants.js';

/** Text chat tied to an appointment — used in-call and before/after it. */
const messageSchema = new mongoose.Schema(
  {
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    // Set only when the sender and recipient had different preferred
    // languages at send time and Gemini translated successfully. Left blank
    // otherwise, so the chat UI can tell "not needed" apart from "Gemini was
    // unavailable" without a separate flag.
    translatedText: { type: String, default: '', maxlength: 4000 },
    sourceLanguage: { type: String, enum: [...SUPPORTED_LANGUAGES, ''], default: '' },
    translatedLanguage: { type: String, enum: [...SUPPORTED_LANGUAGES, ''], default: '' },
    readAt: { type: Date },
  },
  { timestamps: true }
);

messageSchema.index({ appointment: 1, createdAt: 1 });

export const Message = mongoose.model('Message', messageSchema);
