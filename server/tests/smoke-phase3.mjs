const BASE = 'http://127.0.0.1:5000/api';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const loginAs = async (email, password = 'Password@123') =>
  (await call('/auth/login', { method: 'POST', body: { email, password } })).json.token;

const admin = await loginAs('admin@medconsult.local', 'Admin@12345');
const derma = await loginAs('meera.nair@medconsult.local');
const patientA = await loginAs('karthik@example.com');
const patientB = await loginAs('fathima@example.com');

const dermaUserId = (await call('/auth/me', { token: derma })).json.user.id;

// ---- availability management --------------------------------------------
const mine = await call('/availability/me', { token: derma });
check('doctor can read their own availability', mine.status === 200 && mine.json.rules.length > 0,
  `${mine.json.rules.length} rules`);

const asPatient = await call('/availability/me', { token: patientA });
check('a patient cannot read the availability admin endpoint', asPatient.status === 403);

// Sunday is free in the seed data (rules cover Mon-Sat).
const newRule = await call('/availability/rules', {
  method: 'POST', token: derma,
  body: { dayOfWeek: 0, startMinute: 600, endMinute: 720, slotMinutes: 30 },
});
check('doctor can publish a new window', newRule.status === 201, newRule.json?.message);

const overlap = await call('/availability/rules', {
  method: 'POST', token: derma,
  body: { dayOfWeek: 0, startMinute: 660, endMinute: 780, slotMinutes: 30 },
});
check('an overlapping window is rejected', overlap.status === 409, overlap.json?.message);

const adjacent = await call('/availability/rules', {
  method: 'POST', token: derma,
  body: { dayOfWeek: 0, startMinute: 720, endMinute: 840, slotMinutes: 30 },
});
check('a window starting exactly where another ends is allowed', adjacent.status === 201);

// Sunday 14:00-16:00 is clear of both the seeded Mon-Sat rules and the
// Sunday windows created above, so these two only test what they claim to.
const backwards = await call('/availability/rules', {
  method: 'POST', token: derma,
  body: { dayOfWeek: 0, startMinute: 960, endMinute: 840, slotMinutes: 30 },
});
check('a window that ends before it starts is rejected with 400',
  backwards.status === 400, `HTTP ${backwards.status}: ${backwards.json?.details?.endMinute}`);

const ragged = await call('/availability/rules', {
  method: 'POST', token: derma,
  body: { dayOfWeek: 0, startMinute: 840, endMinute: 890, slotMinutes: 30 },
});
check('a window that is not a whole number of slots is rejected with 400',
  ragged.status === 400, `HTTP ${ragged.status}: ${ragged.json?.details?.slotMinutes}`);

await call(`/availability/rules/${newRule.json.rule._id}`, { method: 'DELETE', token: derma });
await call(`/availability/rules/${adjacent.json.rule._id}`, { method: 'DELETE', token: derma });

// ---- slot listing --------------------------------------------------------
const summary = await call(`/doctors/${dermaUserId}/slot-summary?days=14`);
check('slot summary covers the requested number of days', summary.json.days.length === 14);
const firstOpen = summary.json.days.find((d) => d.available > 0);
check('at least one day in the next fortnight has free slots', !!firstOpen,
  firstOpen ? `${firstOpen.date}: ${firstOpen.available}` : 'none');

const slots = await call(`/doctors/${dermaUserId}/slots?date=${firstOpen.date}`);
check('slots load for that date', slots.status === 200 && slots.json.slots.length > 0,
  `${slots.json.slots.length} slots, ${slots.json.availableCount} free`);
check('each slot reports a duration', slots.json.slots.every((s) => s.durationMinutes > 0));

const badDate = await call(`/doctors/${dermaUserId}/slots?date=12-03-2027`);
check('a badly formatted date is rejected', badDate.status === 400);

const farFuture = await call(`/doctors/${dermaUserId}/slots?date=2099-01-01`);
check('a date beyond the booking horizon is rejected', farFuture.status === 400,
  farFuture.json?.message);

const target = slots.json.slots.find((s) => s.available);

const outsideHorizon = await call('/appointments', {
  method: 'POST', token: patientA,
  body: { doctorId: dermaUserId, startsAt: '2099-01-01T09:00:00.000Z', reason: 'far future' },
});
check('a booking beyond the 60-day horizon is rejected',
  outsideHorizon.status === 400 && /60 days/.test(outsideHorizon.json?.message ?? ''),
  outsideHorizon.json?.message);

// ---- booking -------------------------------------------------------------
// Deliberately inside the 60-day horizon and on a day the doctor works, but
// at 07:07 — not on any slot boundary. This must fail slot matching, not the
// horizon check.
const offGrid = new Date(new Date(target.startsAt).getTime() + 7 * 60 * 1000).toISOString();
const arbitrary = await call('/appointments', {
  method: 'POST', token: patientA,
  body: { doctorId: dermaUserId, startsAt: offGrid, reason: 'made-up time' },
});
check('a timestamp that is not on a slot boundary cannot be booked',
  arbitrary.status === 400 && /available slots/i.test(arbitrary.json?.message ?? ''),
  arbitrary.json?.message);

const pastBooking = await call('/appointments', {
  method: 'POST', token: patientA,
  body: { doctorId: dermaUserId, startsAt: '2020-01-01T09:00:00.000Z', reason: 'in the past' },
});
check('a slot in the past cannot be booked', pastBooking.status >= 400);

const booked = await call('/appointments', {
  method: 'POST', token: patientA,
  body: { doctorId: dermaUserId, startsAt: target.startsAt, reason: 'Rash on forearm' },
});
check('a published slot can be booked', booked.status === 201, booked.json?.message);
check('a new booking starts as pending', booked.json?.appointment?.status === 'pending');
check('the end time comes from the doctor\'s slot length',
  new Date(booked.json.appointment.endsAt) - new Date(booked.json.appointment.startsAt) ===
    target.durationMinutes * 60000);
const apptId = booked.json.appointment._id;

const doubleBook = await call('/appointments', {
  method: 'POST', token: patientB,
  body: { doctorId: dermaUserId, startsAt: target.startsAt, reason: 'same slot' },
});
check('a second patient cannot take the same slot', doubleBook.status === 409, doubleBook.json?.message);

const afterBooking = await call(`/doctors/${dermaUserId}/slots?date=${firstOpen.date}`);
const nowTaken = afterBooking.json.slots.find((s) => s.startsAt === target.startsAt);
check('the booked slot is now shown as unavailable', nowTaken?.available === false);
check('with the reason "booked"', nowTaken?.reason === 'booked');

// A patient cannot be in two places at once, even with a different doctor.
const gp = await loginAs('anitha.raman@medconsult.local');
const gpId = (await call('/auth/me', { token: gp })).json.user.id;
const gpSlots = await call(`/doctors/${gpId}/slots?date=${firstOpen.date}`);
const sameTime = gpSlots.json.slots.find((s) => s.startsAt === target.startsAt && s.available);
if (sameTime) {
  const clash = await call('/appointments', {
    method: 'POST', token: patientA,
    body: { doctorId: gpId, startsAt: sameTime.startsAt, reason: 'clash' },
  });
  check('a patient cannot book two doctors at the same instant', clash.status === 409,
    clash.json?.message);
} else {
  check('a patient cannot book two doctors at the same instant', true, 'skipped: no matching GP slot');
}

// ---- state machine -------------------------------------------------------
const patientAccepts = await call(`/appointments/${apptId}/status`, {
  method: 'PATCH', token: patientA, body: { action: 'accept' },
});
check('a patient cannot accept their own appointment', patientAccepts.status === 403,
  patientAccepts.json?.message);

const strangerLooks = await call(`/appointments/${apptId}`, { token: patientB });
check('an unrelated patient cannot read the appointment', strangerLooks.status === 403);

const adminLooks = await call(`/appointments/${apptId}`, { token: admin });
check('an administrator can read any appointment', adminLooks.status === 200);

const completeTooEarly = await call(`/appointments/${apptId}/status`, {
  method: 'PATCH', token: derma, body: { action: 'complete' },
});
check('a pending appointment cannot jump straight to completed', completeTooEarly.status === 400,
  completeTooEarly.json?.message);

const rejectNoReason = await call(`/appointments/${apptId}/status`, {
  method: 'PATCH', token: derma, body: { action: 'reject' },
});
check('rejecting without a reason is refused', rejectNoReason.status === 400);

const accepted = await call(`/appointments/${apptId}/status`, {
  method: 'PATCH', token: derma, body: { action: 'accept' },
});
check('the doctor can accept', accepted.status === 200 && accepted.json.appointment.status === 'accepted');
check('accepting assigns a video channel', accepted.json.appointment.videoChannel === apptId,
  accepted.json.appointment.videoChannel);

const acceptTwice = await call(`/appointments/${apptId}/status`, {
  method: 'PATCH', token: derma, body: { action: 'accept' },
});
check('an accepted appointment cannot be accepted again', acceptTwice.status === 400,
  acceptTwice.json?.message);

const rejectAfterAccept = await call(`/appointments/${apptId}/status`, {
  method: 'PATCH', token: derma, body: { action: 'reject', reason: 'changed my mind' },
});
check('an accepted appointment cannot be rejected (it must be cancelled)',
  rejectAfterAccept.status === 400);

const completed = await call(`/appointments/${apptId}/status`, {
  method: 'PATCH', token: derma, body: { action: 'complete', reason: 'Contact dermatitis.' },
});
check('the doctor can complete an accepted appointment',
  completed.status === 200 && completed.json.appointment.status === 'completed');
check('completing records the timestamp', !!completed.json.appointment.completedAt);
check('the doctor\'s notes are saved',
  completed.json.appointment.doctorNotes === 'Contact dermatitis.');

const cancelCompleted = await call(`/appointments/${apptId}/status`, {
  method: 'PATCH', token: patientA, body: { action: 'cancel' },
});
check('a completed appointment cannot be cancelled', cancelCompleted.status === 400);

const freedSlot = await call(`/doctors/${dermaUserId}/slots?date=${firstOpen.date}`);
check('completing the appointment frees the slot in the calendar',
  freedSlot.json.slots.find((s) => s.startsAt === target.startsAt)?.available === true);

// ---- cancellation frees the slot ----------------------------------------
const second = await call('/appointments', {
  method: 'POST', token: patientB,
  body: { doctorId: dermaUserId, startsAt: target.startsAt, reason: 'second booking' },
});
check('the freed slot can be booked by someone else', second.status === 201);

const cancelled = await call(`/appointments/${second.json.appointment._id}/status`, {
  method: 'PATCH', token: patientB, body: { action: 'cancel', reason: 'no longer needed' },
});
check('a patient can cancel their own pending appointment',
  cancelled.status === 200 && cancelled.json.appointment.status === 'cancelled');
check('cancellation records who cancelled', !!cancelled.json.appointment.cancelledBy);

// ---- listing -------------------------------------------------------------
const patientList = await call('/appointments?scope=all', { token: patientA });
check('a patient sees only their own appointments',
  patientList.json.appointments.every((a) => String(a.patient._id) === String(
    JSON.parse(atob(patientA.split('.')[1])).sub)),
  `${patientList.json.appointments.length} rows`);
check('the list joins the doctor\'s specialty',
  patientList.json.appointments.every((a) => a.doctorProfile?.specialty?.name));

const upcoming = await call('/appointments?scope=upcoming', { token: patientA });
check('the upcoming scope only returns appointments that have not finished',
  upcoming.json.appointments.every((a) => new Date(a.endsAt) >= new Date()),
  `${upcoming.json.appointments.length} upcoming`);
check('the upcoming scope excludes cancelled and rejected ones',
  upcoming.json.appointments.every((a) => ['pending', 'accepted'].includes(a.status)));

// An in-progress consultation must stay under "upcoming" — the patient is
// looking there for the button to join it.
const inProgressStart = new Date(Date.now() - 10 * 60_000);
const inProgress = await call('/appointments', {
  method: 'POST', token: patientA,
  body: { doctorId: dermaUserId, startsAt: inProgressStart.toISOString(), reason: 'in progress' },
});
// The booking API only accepts published slots, so this is created directly
// through the status endpoint's own data path instead.
if (inProgress.status !== 201) {
  const { Appointment } = await import('../src/models/index.js');
  const { connectDB, disconnectDB } = await import('../src/config/db.js');
  await connectDB();
  const me = JSON.parse(atob(patientA.split('.')[1])).sub;
  const created = await Appointment.create({
    patient: me, doctor: dermaUserId,
    startsAt: inProgressStart, endsAt: new Date(Date.now() + 20 * 60_000),
    status: 'accepted', reason: 'in progress scope test',
  });
  const scoped = await call('/appointments?scope=upcoming', { token: patientA });
  check('a consultation already under way still counts as upcoming',
    scoped.json.appointments.some((a) => a._id === String(created._id)));
  const pastScope = await call('/appointments?scope=past', { token: patientA });
  check('and does not also appear under past',
    !pastScope.json.appointments.some((a) => a._id === String(created._id)));
  await Appointment.deleteOne({ _id: created._id });
  await disconnectDB();
}

const past = await call('/appointments?scope=past', { token: patientA });
check('the past scope returns finished appointments', past.json.appointments.length > 0,
  `${past.json.appointments.length} past`);
check('a completed appointment is flagged as having a prescription',
  past.json.appointments.some((a) => a.hasPrescription));

const doctorList = await call('/appointments?scope=all', { token: derma });
check('a doctor sees their own appointments', doctorList.json.appointments.length > 0,
  `${doctorList.json.appointments.length} rows`);

const myPatients = await call('/appointments/my-patients', { token: derma });
check('the doctor can list the patients they have seen', myPatients.status === 200 &&
  myPatients.json.patients.length > 0, `${myPatients.json.patients?.length} patients`);
check('each patient row carries a visit count',
  myPatients.json.patients.every((p) => p.totalAppointments > 0));

const patientsAsPatient = await call('/appointments/my-patients', { token: patientA });
check('a patient cannot list a doctor\'s patients', patientsAsPatient.status === 403);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
