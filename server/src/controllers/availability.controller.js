import {
  AvailabilityRule,
  BlockedDate,
  Appointment,
  DoctorProfile,
} from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ACTIVE_APPOINTMENT_STATUSES, VERIFICATION_STATUS } from '../utils/constants.js';
import {
  generateSlots,
  isValidDateString,
  MAX_ADVANCE_DAYS,
  dayjs,
  DATE_FORMAT,
} from '../utils/slots.js';

/** The signed-in doctor's weekly schedule and blocked dates. */
export const getMyAvailability = asyncHandler(async (req, res) => {
  const [rules, blocked] = await Promise.all([
    AvailabilityRule.find({ doctor: req.user._id }).sort({ dayOfWeek: 1, startMinute: 1 }).lean(),
    BlockedDate.find({ doctor: req.user._id }).sort({ date: 1 }).lean(),
  ]);
  res.json({
    success: true,
    rules,
    blockedDates: blocked,
    // Lets the UI show the 24x7 toggle as already on, without the client
    // having to re-derive the rule that defines it.
    alwaysAvailable: isAlwaysAvailable(rules),
  });
});

/** Rejects a window that overlaps one the doctor already published. */
async function assertNoOverlap({ doctor, dayOfWeek, startMinute, endMinute, excludeId }) {
  const filter = {
    doctor,
    dayOfWeek,
    isActive: true,
    // Two ranges overlap when each starts before the other ends.
    startMinute: { $lt: endMinute },
    endMinute: { $gt: startMinute },
  };
  if (excludeId) filter._id = { $ne: excludeId };

  const clash = await AvailabilityRule.findOne(filter).lean();
  if (clash) {
    throw ApiError.conflict(
      'That window overlaps one you have already published for this day'
    );
  }
}

export const createRule = asyncHandler(async (req, res) => {
  const { dayOfWeek, startMinute, endMinute, slotMinutes, timezone } = req.body;

  await assertNoOverlap({
    doctor: req.user._id,
    dayOfWeek,
    startMinute,
    endMinute,
  });

  const rule = await AvailabilityRule.create({
    doctor: req.user._id,
    dayOfWeek,
    startMinute,
    endMinute,
    slotMinutes,
    timezone,
  });

  res.status(201).json({ success: true, rule });
});

/** Minutes in a full day. A window of 0 -> 1440 covers midnight to midnight. */
const FULL_DAY = 1440;
const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

/**
 * Publishes round-the-clock availability: one midnight-to-midnight window on
 * every day of the week.
 *
 * This exists because the per-day form cannot express it. An <input type=time>
 * tops out at 23:59, so "closes at midnight" is unreachable through the normal
 * UI even though the data model has always allowed it. Rather than have every
 * doctor hand-build seven windows, the intent gets its own endpoint.
 *
 * Existing windows are replaced, not merged. Overlap is rejected elsewhere in
 * this controller, and a full day overlaps everything by definition, so the
 * only coherent meaning of "I am available 24x7" is that it supersedes
 * whatever was published before.
 */
export const setAlwaysAvailable = asyncHandler(async (req, res) => {
  const { slotMinutes = 30, timezone = 'Asia/Kolkata' } = req.body;

  if (FULL_DAY % slotMinutes !== 0) {
    throw ApiError.badRequest(
      `A ${slotMinutes}-minute slot does not divide evenly into a 24-hour day. `
      + 'Choose 10, 15, 20, 30, 45 or 60 minutes.'
    );
  }

  await AvailabilityRule.deleteMany({ doctor: req.user._id });

  const rules = await AvailabilityRule.insertMany(
    DAYS_OF_WEEK.map((dayOfWeek) => ({
      doctor: req.user._id,
      dayOfWeek,
      startMinute: 0,
      endMinute: FULL_DAY,
      slotMinutes,
      timezone,
    }))
  );

  res.status(201).json({ success: true, rules, alwaysAvailable: true });
});

/**
 * Whether the doctor's published schedule is genuinely round-the-clock: a
 * full-day window on all seven days. Derived rather than stored, so it cannot
 * drift out of step with the rules the booking engine actually reads.
 */
export function isAlwaysAvailable(rules = []) {
  const covered = new Set(
    rules
      .filter((r) => r.isActive !== false && r.startMinute === 0 && r.endMinute === FULL_DAY)
      .map((r) => r.dayOfWeek)
  );
  return DAYS_OF_WEEK.every((d) => covered.has(d));
}

export const updateRule = asyncHandler(async (req, res) => {
  const rule = await AvailabilityRule.findOne({
    _id: req.params.id,
    doctor: req.user._id,
  });
  if (!rule) throw ApiError.notFound('Availability window not found');

  const next = {
    dayOfWeek: req.body.dayOfWeek ?? rule.dayOfWeek,
    startMinute: req.body.startMinute ?? rule.startMinute,
    endMinute: req.body.endMinute ?? rule.endMinute,
  };

  await assertNoOverlap({
    doctor: req.user._id,
    ...next,
    excludeId: rule._id,
  });

  Object.assign(rule, req.body);
  await rule.save();

  res.json({ success: true, rule: rule.toJSON() });
});

/**
 * Removing a window does not touch appointments already accepted inside it —
 * cancelling a confirmed consultation must be a deliberate act, not a side
 * effect of editing a schedule. The count is reported so the doctor knows.
 */
export const deleteRule = asyncHandler(async (req, res) => {
  const rule = await AvailabilityRule.findOneAndDelete({
    _id: req.params.id,
    doctor: req.user._id,
  });
  if (!rule) throw ApiError.notFound('Availability window not found');

  const upcoming = await Appointment.countDocuments({
    doctor: req.user._id,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    startsAt: { $gte: new Date() },
  });

  res.json({
    success: true,
    message: 'Availability window removed',
    upcomingAppointments: upcoming,
  });
});

export const blockDate = asyncHandler(async (req, res) => {
  const { date, reason = '' } = req.body;

  const existing = await BlockedDate.findOne({ doctor: req.user._id, date });
  if (existing) throw ApiError.conflict('That date is already blocked');

  const blocked = await BlockedDate.create({ doctor: req.user._id, date, reason });

  const affected = await Appointment.countDocuments({
    doctor: req.user._id,
    status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    startsAt: {
      $gte: dayjs(date).startOf('day').toDate(),
      $lt: dayjs(date).endOf('day').toDate(),
    },
  });

  res.status(201).json({ success: true, blockedDate: blocked, affectedAppointments: affected });
});

export const unblockDate = asyncHandler(async (req, res) => {
  const removed = await BlockedDate.findOneAndDelete({
    _id: req.params.id,
    doctor: req.user._id,
  });
  if (!removed) throw ApiError.notFound('Blocked date not found');
  res.json({ success: true, message: 'Date unblocked' });
});

/**
 * Public bookable slots for one doctor on one date.
 *
 * Slots are computed on demand rather than stored, so editing availability
 * takes effect immediately and there is no slot table to keep in sync.
 */
export const getDoctorSlots = asyncHandler(async (req, res) => {
  const doctorId = req.params.id;
  const { date } = req.validatedQuery ?? {};

  if (!isValidDateString(date)) {
    throw ApiError.badRequest('Provide a date in YYYY-MM-DD format');
  }

  const requested = dayjs(date, DATE_FORMAT);
  if (requested.isAfter(dayjs().add(MAX_ADVANCE_DAYS, 'day'))) {
    throw ApiError.badRequest(
      `Appointments can only be booked up to ${MAX_ADVANCE_DAYS} days ahead`
    );
  }

  const profile = await DoctorProfile.findOne({
    user: doctorId,
    verificationStatus: VERIFICATION_STATUS.APPROVED,
  }).lean();
  if (!profile) throw ApiError.notFound('Doctor not found');

  const [rules, blocked, taken] = await Promise.all([
    AvailabilityRule.find({ doctor: doctorId, isActive: true }).lean(),
    BlockedDate.find({ doctor: doctorId }).select('date').lean(),
    // A generous window either side of the date covers slots that fall on a
    // neighbouring UTC day once the doctor's timezone is applied.
    Appointment.find({
      doctor: doctorId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      startsAt: {
        $gte: requested.subtract(2, 'day').toDate(),
        $lte: requested.add(2, 'day').toDate(),
      },
    })
      .select('startsAt')
      .lean(),
  ]);

  const slots = generateSlots({
    rules,
    dateStr: date,
    blockedDates: new Set(blocked.map((b) => b.date)),
    bookedStarts: new Set(taken.map((a) => new Date(a.startsAt).getTime())),
  });

  res.json({
    success: true,
    date,
    slots,
    availableCount: slots.filter((s) => s.available).length,
    isBlocked: blocked.some((b) => b.date === date),
  });
});

/** Which of the next N days have at least one free slot — powers the calendar. */
export const getDoctorSlotSummary = asyncHandler(async (req, res) => {
  const doctorId = req.params.id;
  const days = Math.min(Number(req.validatedQuery?.days ?? 14), MAX_ADVANCE_DAYS);

  const profile = await DoctorProfile.findOne({
    user: doctorId,
    verificationStatus: VERIFICATION_STATUS.APPROVED,
  }).lean();
  if (!profile) throw ApiError.notFound('Doctor not found');

  const start = dayjs().startOf('day');

  const [rules, blocked, taken] = await Promise.all([
    AvailabilityRule.find({ doctor: doctorId, isActive: true }).lean(),
    BlockedDate.find({ doctor: doctorId }).select('date').lean(),
    Appointment.find({
      doctor: doctorId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      startsAt: { $gte: start.toDate(), $lte: start.add(days + 2, 'day').toDate() },
    })
      .select('startsAt')
      .lean(),
  ]);

  const blockedSet = new Set(blocked.map((b) => b.date));
  const bookedSet = new Set(taken.map((a) => new Date(a.startsAt).getTime()));

  const summary = [];
  for (let i = 0; i < days; i += 1) {
    const dateStr = start.add(i, 'day').format(DATE_FORMAT);
    const slots = generateSlots({
      rules,
      dateStr,
      blockedDates: blockedSet,
      bookedStarts: bookedSet,
    });
    summary.push({
      date: dateStr,
      total: slots.length,
      available: slots.filter((s) => s.available).length,
      isBlocked: blockedSet.has(dateStr),
    });
  }

  res.json({ success: true, days: summary });
});
