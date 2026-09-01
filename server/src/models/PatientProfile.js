import mongoose from 'mongoose';

const emergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    relation: { type: String, default: '', trim: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    /** International format without '+', e.g. 919876543210 — used by CallMeBot. */
    whatsappNumber: { type: String, default: '', trim: true },
    /**
     * CallMeBot issues a key to the RECIPIENT when they opt in, not to the
     * application, so it belongs to this contact rather than to server
     * configuration. A single global key in .env would only ever work if
     * every patient happened to share one emergency contact.
     */
    whatsappApiKey: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const patientProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''],
      default: '',
    },
    heightCm: { type: Number, min: 0, max: 300 },
    weightKg: { type: Number, min: 0, max: 500 },
    allergies: { type: [String], default: [] },
    chronicConditions: { type: [String], default: [] },
    currentMedications: { type: [String], default: [] },
    address: { type: String, default: '' },
    emergencyContact: { type: emergencyContactSchema, default: () => ({}) },
  },
  { timestamps: true }
);

patientProfileSchema.virtual('age').get(function computeAge() {
  if (!this.dateOfBirth) return null;
  const diff = Date.now() - this.dateOfBirth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
});

patientProfileSchema.set('toJSON', { virtuals: true });
patientProfileSchema.set('toObject', { virtuals: true });

export const PatientProfile = mongoose.model('PatientProfile', patientProfileSchema);
