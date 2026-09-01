import mongoose from 'mongoose';

/** Audit trail of every emergency button press. */
const sosEventSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    accuracyMeters: { type: Number },
    mapLink: { type: String, default: '' },
    note: { type: String, default: '', maxlength: 500 },

    emailSent: { type: Boolean, default: false },
    emailError: { type: String, default: '' },
    whatsappSent: { type: Boolean, default: false },
    whatsappError: { type: String, default: '' },
    contactEmail: { type: String, default: '' },

    hospitalCount: { type: Number, default: 0 },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

sosEventSchema.index({ createdAt: -1 });

export const SosEvent = mongoose.model('SosEvent', sosEventSchema);
