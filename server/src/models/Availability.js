import mongoose from 'mongoose';

/**
 * A recurring weekly window during which a doctor accepts appointments.
 * Times are stored as minutes-since-midnight in the doctor's own IANA
 * timezone; concrete UTC slots are generated on demand per requested date.
 * There is deliberately no time-of-day restriction — a doctor may publish a
 * 02:00 window, which is what makes "24x7 consultation" real.
 */
const availabilityRuleSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** 0 = Sunday ... 6 = Saturday, matching JS getDay(). */
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startMinute: { type: Number, required: true, min: 0, max: 1439 },
    endMinute: { type: Number, required: true, min: 1, max: 1440 },
    slotMinutes: { type: Number, default: 30, min: 5, max: 240 },
    timezone: { type: String, default: 'Asia/Kolkata' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

availabilityRuleSchema.pre('validate', function checkRange(next) {
  if (this.endMinute <= this.startMinute) {
    return next(new Error('End time must be after start time'));
  }
  if ((this.endMinute - this.startMinute) % this.slotMinutes !== 0) {
    return next(
      new Error('The window length must be an exact multiple of the slot duration')
    );
  }
  next();
});

availabilityRuleSchema.index({ doctor: 1, dayOfWeek: 1 });

export const AvailabilityRule = mongoose.model(
  'AvailabilityRule',
  availabilityRuleSchema
);

/** A single date on which the doctor takes no appointments (leave, holiday). */
const blockedDateSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Stored as YYYY-MM-DD in the doctor's timezone to avoid off-by-one bugs. */
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason: { type: String, default: '' },
  },
  { timestamps: true }
);

blockedDateSchema.index({ doctor: 1, date: 1 }, { unique: true });

export const BlockedDate = mongoose.model('BlockedDate', blockedDateSchema);
