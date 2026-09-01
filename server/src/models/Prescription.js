import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dosage: { type: String, default: '', trim: true },
    frequency: { type: String, default: '', trim: true },
    duration: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const prescriptionSchema = new mongoose.Schema(
  {
    /** One prescription per appointment keeps the record unambiguous. */
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      unique: true,
      index: true,
    },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    diagnosis: { type: String, default: '', maxlength: 2000 },
    medicines: { type: [medicineSchema], default: [] },
    tests: { type: [String], default: [] },
    advice: { type: String, default: '', maxlength: 2000 },
    followUpDate: { type: Date },

    /** Cloudinary reference for the generated PDF. */
    pdfPublicId: { type: String, default: '' },
    pdfBytes: { type: Number, default: 0 },
    /** Set only when Cloudinary is not configured (local dev fallback). */
    pdfLocalPath: { type: String, default: '' },

    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

prescriptionSchema.index({ patient: 1, issuedAt: -1 });

export const Prescription = mongoose.model('Prescription', prescriptionSchema);
