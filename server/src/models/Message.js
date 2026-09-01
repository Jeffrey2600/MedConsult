import mongoose from 'mongoose';

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
    readAt: { type: Date },
  },
  { timestamps: true }
);

messageSchema.index({ appointment: 1, createdAt: 1 });

export const Message = mongoose.model('Message', messageSchema);
