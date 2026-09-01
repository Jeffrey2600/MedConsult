import mongoose from 'mongoose';
import {
  APPOINTMENT_STATUS,
  ACTIVE_APPOINTMENT_STATUSES,
} from '../utils/constants.js';

const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Always UTC. The browser renders it in the viewer's local timezone. */
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },

    status: {
      type: String,
      enum: Object.values(APPOINTMENT_STATUS),
      default: APPOINTMENT_STATUS.PENDING,
      index: true,
    },
    reason: { type: String, default: '', maxlength: 1000 },
    /** Optional link to the symptom check that led the patient here. */
    symptomCheck: { type: mongoose.Schema.Types.ObjectId, ref: 'SymptomCheck' },

    /** Agora channel / Jitsi room name. Set when the doctor accepts. */
    videoChannel: { type: String, default: '' },

    rejectionReason: { type: String, default: '' },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancellationReason: { type: String, default: '' },

    doctorJoinedAt: { type: Date },
    patientJoinedAt: { type: Date },
    completedAt: { type: Date },
    doctorNotes: { type: String, default: '' },
    reminderSentAt: { type: Date },
  },
  { timestamps: true }
);

/**
 * The core integrity guarantee of the booking system.
 *
 * A doctor can hold at most one pending-or-accepted appointment per start
 * time. Enforcing this with a unique partial index means two simultaneous
 * bookings for the same slot cannot both succeed no matter how the requests
 * interleave — the loser gets a duplicate-key error, which the controller
 * translates into HTTP 409. A read-then-write check in application code
 * would leave a race window here; this does not.
 *
 * Rejected/cancelled/completed rows are excluded from the index so a freed
 * slot immediately becomes bookable again.
 */
appointmentSchema.index(
  { doctor: 1, startsAt: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_APPOINTMENT_STATUSES } },
    name: 'uniq_doctor_slot_active',
  }
);

/** Supports the patient's "my appointments", newest first. */
appointmentSchema.index({ patient: 1, startsAt: -1 });
/** Supports the doctor's dashboard and the reminder sweep. */
appointmentSchema.index({ doctor: 1, status: 1, startsAt: 1 });

appointmentSchema.methods.isParticipant = function isParticipant(userId) {
  const id = String(userId);
  return String(this.patient) === id || String(this.doctor) === id;
};

export const Appointment = mongoose.model('Appointment', appointmentSchema);
