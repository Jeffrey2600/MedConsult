const SRV = '../src';
const { generateSlots, findMatchingSlot, dayjs } = await import(`${SRV}/utils/slots.js`);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const IST = 'Asia/Kolkata';
// A Wednesday. Fixed "now" well before it so nothing is in the past.
const DATE = '2027-03-10';
const NOW = new Date('2027-03-01T00:00:00Z');

const rule = (over = {}) => ({
  dayOfWeek: 3, startMinute: 9 * 60, endMinute: 13 * 60,
  slotMinutes: 30, timezone: IST, isActive: true, ...over,
});

// ---- basic generation ----------------------------------------------------
const basic = generateSlots({ rules: [rule()], dateStr: DATE, now: NOW });
check('a 4-hour window at 30 min produces 8 slots', basic.length === 8, `${basic.length}`);
check('every slot is available when nothing blocks them', basic.every((s) => s.available));

const firstLocal = dayjs(basic[0].startsAt).tz(IST);
check('first slot starts at 09:00 in the doctor\'s timezone',
  firstLocal.format('HH:mm') === '09:00', firstLocal.format('YYYY-MM-DD HH:mm'));
check('the stored instant is UTC, offset by +05:30',
  basic[0].startsAt === '2027-03-10T03:30:00.000Z', basic[0].startsAt);
check('the last slot ends exactly at 13:00',
  dayjs(basic[7].endsAt).tz(IST).format('HH:mm') === '13:00',
  dayjs(basic[7].endsAt).tz(IST).format('HH:mm'));

// ---- weekday matching ----------------------------------------------------
const wrongDay = generateSlots({ rules: [rule()], dateStr: '2027-03-11', now: NOW });
check('a rule does not fire on a different weekday', wrongDay.length === 0);

// ---- partial slots -------------------------------------------------------
const ragged = generateSlots({
  rules: [rule({ endMinute: 9 * 60 + 50 })], dateStr: DATE, now: NOW,
});
check('a window that does not divide evenly never emits a partial slot',
  ragged.length === 1, `${ragged.length} slots from a 50-minute window`);

// ---- overnight window ----------------------------------------------------
// 22:00-24:00 on Wednesday plus 00:00-02:00 on Thursday.
const overnight = [
  rule({ startMinute: 22 * 60, endMinute: 24 * 60 }),
  rule({ dayOfWeek: 4, startMinute: 0, endMinute: 2 * 60 }),
];
const wedNight = generateSlots({ rules: overnight, dateStr: DATE, now: NOW });
const thuEarly = generateSlots({ rules: overnight, dateStr: '2027-03-11', now: NOW });
check('an overnight window yields late-night slots', wedNight.length === 4, `${wedNight.length}`);
check('and early-morning slots on the following day', thuEarly.length === 4, `${thuEarly.length}`);
check('the 23:30 slot exists (24x7 booking is real)',
  wedNight.some((s) => dayjs(s.startsAt).tz(IST).format('HH:mm') === '23:30'));
check('the 01:30 slot exists',
  thuEarly.some((s) => dayjs(s.startsAt).tz(IST).format('HH:mm') === '01:30'));

// ---- blocked dates -------------------------------------------------------
const blocked = generateSlots({
  rules: [rule()], dateStr: DATE, blockedDates: new Set([DATE]), now: NOW,
});
check('a blocked date produces no slots at all', blocked.length === 0);

// ---- already-booked ------------------------------------------------------
const takenMs = new Date(basic[2].startsAt).getTime();
const withBooked = generateSlots({
  rules: [rule()], dateStr: DATE, bookedStarts: new Set([takenMs]), now: NOW,
});
check('a booked slot is still listed', withBooked.length === 8);
check('but marked unavailable', withBooked[2].available === false);
check('with the reason "booked"', withBooked[2].reason === 'booked');
check('neighbouring slots stay available', withBooked[1].available && withBooked[3].available);

// ---- lead time -----------------------------------------------------------
// "Now" is 10:10 IST on the day itself: 09:00-10:00 gone, 10:30 onwards fine.
const midday = new Date('2027-03-10T04:40:00Z');
const lateInDay = generateSlots({ rules: [rule()], dateStr: DATE, now: midday });
check('slots already past are marked unavailable',
  lateInDay.filter((s) => s.reason === 'past').length === 3,
  lateInDay.map((s) => `${dayjs(s.startsAt).tz(IST).format('HH:mm')}:${s.available ? 'y' : 'n'}`).join(' '));
check('a slot 20 minutes away is outside the lead window and bookable',
  lateInDay.find((s) => dayjs(s.startsAt).tz(IST).format('HH:mm') === '10:30')?.available === true);

// Now 10:20 IST, so the 10:30 slot is only 10 minutes away â€” inside the
// 15-minute lead window and therefore not bookable.
const tooClose = generateSlots({
  rules: [rule()], dateStr: DATE, now: new Date('2027-03-10T04:50:00Z'),
});
check('a slot inside the 15-minute lead window is refused',
  tooClose.find((s) => dayjs(s.startsAt).tz(IST).format('HH:mm') === '10:30')?.available === false);
check('the next slot after the lead window is bookable',
  tooClose.find((s) => dayjs(s.startsAt).tz(IST).format('HH:mm') === '11:00')?.available === true);

// ---- overlapping rules ---------------------------------------------------
const overlapping = generateSlots({
  rules: [rule(), rule({ startMinute: 11 * 60, endMinute: 15 * 60 })],
  dateStr: DATE, now: NOW,
});
const starts = overlapping.map((s) => s.startsAt);
check('overlapping rules never emit a duplicate slot',
  new Set(starts).size === starts.length, `${starts.length} slots, ${new Set(starts).size} unique`);
check('slots are returned in chronological order',
  starts.every((v, i) => i === 0 || new Date(starts[i - 1]) <= new Date(v)));

// ---- a different timezone ------------------------------------------------
const london = generateSlots({
  rules: [rule({ timezone: 'Europe/London' })], dateStr: DATE, now: NOW,
});
check('a rule in another timezone resolves against that zone',
  london[0].startsAt === '2027-03-10T09:00:00.000Z', london[0].startsAt);

// ---- findMatchingSlot ----------------------------------------------------
const valid = findMatchingSlot({
  rules: [rule()], startsAt: basic[0].startsAt,
  blockedDates: new Set(), bookedStarts: new Set(), now: NOW,
});
check('a published slot is recognised', !!valid);

const arbitrary = findMatchingSlot({
  rules: [rule()], startsAt: '2027-03-10T04:07:00.000Z',
  blockedDates: new Set(), bookedStarts: new Set(), now: NOW,
});
check('an arbitrary timestamp is rejected', arbitrary === null);

const outsideHours = findMatchingSlot({
  rules: [rule()], startsAt: '2027-03-09T20:30:00.000Z',
  blockedDates: new Set(), bookedStarts: new Set(), now: NOW,
});
check('a 02:00 time on a day the doctor does not work is rejected', outsideHours === null);

const nightMatch = findMatchingSlot({
  rules: overnight, startsAt: thuEarly[3].startsAt,
  blockedDates: new Set(), bookedStarts: new Set(), now: NOW,
});
check('a slot that crosses midnight is still matched', !!nightMatch,
  nightMatch ? dayjs(nightMatch.startsAt).tz(IST).format('YYYY-MM-DD HH:mm') : 'not found');

const badDate = generateSlots({ rules: [rule()], dateStr: 'not-a-date', now: NOW });
check('an invalid date string yields no slots rather than throwing', badDate.length === 0);

const inactive = generateSlots({
  rules: [rule({ isActive: false })], dateStr: DATE, now: NOW,
});
check('a deactivated rule produces nothing', inactive.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
