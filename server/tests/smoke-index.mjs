const SRV = '../src';
const { connectDB, disconnectDB } = await import(`${SRV}/config/db.js`);
const { Appointment, User } = await import(`${SRV}/models/index.js`);

await connectDB();

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const indexes = await Appointment.collection.indexes();
const uniq = indexes.find((i) => i.name === 'uniq_doctor_slot_active');
check('unique slot index exists on the collection', !!uniq);
check('index is unique', uniq?.unique === true);
check('index is partial (frees rejected/cancelled slots)', !!uniq?.partialFilterExpression,
  JSON.stringify(uniq?.partialFilterExpression));

const doctor = await User.findOne({ role: 'doctor' });
const patients = await User.find({ role: 'patient' }).limit(2);
const slot = new Date('2030-01-01T10:00:00.000Z');
const end = new Date('2030-01-01T10:30:00.000Z');

await Appointment.deleteMany({ startsAt: slot });

const first = await Appointment.create({
  patient: patients[0]._id, doctor: doctor._id,
  startsAt: slot, endsAt: end, status: 'pending', reason: 'first',
});
check('first booking for the slot succeeds', !!first);

// Two patients racing for the same slot.
let secondFailed = false, code = null;
try {
  await Appointment.create({
    patient: patients[1]._id, doctor: doctor._id,
    startsAt: slot, endsAt: end, status: 'pending', reason: 'second',
  });
} catch (e) { secondFailed = true; code = e.code; }
check('a second booking for the same doctor+slot is rejected', secondFailed, `code=${code}`);
check('rejection is a duplicate-key error (translated to HTTP 409)', code === 11000);

// True concurrency: both inserts issued before either resolves.
const slot2 = new Date('2030-01-02T10:00:00.000Z');
await Appointment.deleteMany({ startsAt: slot2 });
const results = await Promise.allSettled([
  Appointment.create({ patient: patients[0]._id, doctor: doctor._id, startsAt: slot2, endsAt: slot2, status: 'pending' }),
  Appointment.create({ patient: patients[1]._id, doctor: doctor._id, startsAt: slot2, endsAt: slot2, status: 'pending' }),
]);
const ok = results.filter((r) => r.status === 'fulfilled').length;
check('under a simultaneous race exactly one insert wins', ok === 1, `${ok} of 2 succeeded`);

// A different doctor at the same time must still be bookable.
const otherDoctor = await User.findOne({ role: 'doctor', _id: { $ne: doctor._id } });
const otherOk = await Appointment.create({
  patient: patients[0]._id, doctor: otherDoctor._id, startsAt: slot, endsAt: end, status: 'pending',
});
check('a different doctor can be booked at the same time', !!otherOk);

// Freeing the slot must make it bookable again.
await Appointment.updateOne({ _id: first._id }, { $set: { status: 'cancelled' } });
let rebooked = null;
try {
  rebooked = await Appointment.create({
    patient: patients[1]._id, doctor: doctor._id, startsAt: slot, endsAt: end, status: 'pending', reason: 'rebooked',
  });
} catch (e) { /* ignore */ }
check('cancelling frees the slot for someone else', !!rebooked);

await Appointment.deleteMany({ startsAt: { $in: [slot, slot2] } });
await disconnectDB();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
