import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export { dayjs };

/** A patient cannot book a slot starting within this many minutes. */
export const MIN_LEAD_MINUTES = 15;

/** How many days ahead the booking calendar is open. */
export const MAX_ADVANCE_DAYS = 60;

export const DATE_FORMAT = 'YYYY-MM-DD';

export const isValidDateString = (value) =>
  typeof value === 'string' && dayjs(value, DATE_FORMAT, true).isValid();

/**
 * Expands a doctor's weekly availability rules into concrete slots for one
 * calendar date.
 *
 * Rules store minutes-since-midnight plus an IANA timezone; the requested
 * date is interpreted in each rule's own timezone and the resulting instants
 * are returned as UTC. That is what lets a doctor publish 22:00–02:00 (stored
 * as two windows) without any special-casing for midnight, and what makes the
 * "24x7" claim real rather than cosmetic.
 *
 * Every slot the rules produce is returned, each flagged `available` or not,
 * so the patient can see that a doctor is genuinely busy rather than the slot
 * silently vanishing.
 *
 * @param {object[]} rules            AvailabilityRule documents (plain objects)
 * @param {string}   dateStr          'YYYY-MM-DD'
 * @param {Set<string>} blockedDates  dates the doctor has blocked off
 * @param {Set<number>} bookedStarts  epoch ms of slots already taken
 * @param {Date}     now              current instant (injectable for tests)
 */
export function generateSlots({
  rules,
  dateStr,
  blockedDates = new Set(),
  bookedStarts = new Set(),
  now = new Date(),
}) {
  if (!isValidDateString(dateStr)) return [];
  if (blockedDates.has(dateStr)) return [];

  const earliest = dayjs(now).add(MIN_LEAD_MINUTES, 'minute');
  const slots = [];
  const seen = new Set();

  for (const rule of rules) {
    if (rule.isActive === false) continue;

    const zone = rule.timezone || 'Asia/Kolkata';
    // Midnight of the requested date, in this rule's timezone.
    const dayStart = dayjs.tz(dateStr, DATE_FORMAT, zone);
    if (!dayStart.isValid()) continue;

    // The weekday must also be evaluated in the rule's timezone.
    if (dayStart.day() !== rule.dayOfWeek) continue;

    const step = rule.slotMinutes || 30;

    for (let minute = rule.startMinute; minute + step <= rule.endMinute; minute += step) {
      const start = dayStart.add(minute, 'minute');
      const end = start.add(step, 'minute');
      const startMs = start.valueOf();

      // Overlapping rules must not produce the same slot twice.
      if (seen.has(startMs)) continue;
      seen.add(startMs);

      const isPast = start.isBefore(earliest);
      const isBooked = bookedStarts.has(startMs);

      slots.push({
        startsAt: start.toDate().toISOString(),
        endsAt: end.toDate().toISOString(),
        durationMinutes: step,
        available: !isPast && !isBooked,
        reason: isPast ? 'past' : isBooked ? 'booked' : null,
      });
    }
  }

  return slots.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

/**
 * Confirms a requested instant is genuinely one of the doctor's published
 * slots. Without this a patient could POST any timestamp they liked and book
 * a doctor at 4am on a day they do not work.
 */
export function findMatchingSlot({ rules, startsAt, blockedDates, bookedStarts, now }) {
  const target = new Date(startsAt);
  if (Number.isNaN(target.getTime())) return null;

  // Check the slot's own date in each rule's timezone — a slot near midnight
  // may belong to the previous or next calendar day depending on the zone.
  const candidateDates = new Set();
  for (const rule of rules) {
    const zone = rule.timezone || 'Asia/Kolkata';
    const local = dayjs(target).tz(zone);
    candidateDates.add(local.format(DATE_FORMAT));
    candidateDates.add(local.subtract(1, 'day').format(DATE_FORMAT));
    candidateDates.add(local.add(1, 'day').format(DATE_FORMAT));
  }

  for (const dateStr of candidateDates) {
    const slots = generateSlots({ rules, dateStr, blockedDates, bookedStarts, now });
    const match = slots.find((s) => new Date(s.startsAt).getTime() === target.getTime());
    if (match) return match;
  }

  return null;
}

/** Human-friendly label for a rule, e.g. "Mon 09:00 – 13:00 (30 min slots)". */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const minutesToTime = (minute) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export const describeRule = (rule) =>
  `${DAY_NAMES[rule.dayOfWeek]} ${minutesToTime(rule.startMinute)} – ${minutesToTime(
    rule.endMinute
  )} (${rule.slotMinutes} min)`;
