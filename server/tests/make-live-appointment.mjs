/**
 * Creates an appointment that is joinable right now, for manually walking
 * through the consultation room. Not part of `npm test`.
 *
 *   node tests/make-live-appointment.mjs
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Appointment, User } from '../src/models/index.js';

await connectDB();

const doctor = await User.findOne({ email: 'meera.nair@medconsult.local' });
const patient = await User.findOne({ email: 'karthik@example.com' });

if (!doctor || !patient) {
  console.error('Seed the database first: npm run seed:fresh');
  await disconnectDB();
  process.exit(1);
}

// Started five minutes ago so it is joinable immediately, and deliberately
// long so a testing session does not expire halfway through. Pass a duration
// in minutes as the first argument to override.
const durationMinutes = Number(process.argv[2]) || 180;
const startsAt = new Date(Date.now() - 5 * 60_000);
const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

await Appointment.deleteMany({ patient: patient._id, doctor: doctor._id, reason: 'Live demo consultation' });

const appointment = await Appointment.create({
  patient: patient._id,
  doctor: doctor._id,
  startsAt,
  endsAt,
  status: 'accepted',
  reason: 'Live demo consultation',
});
await Appointment.updateOne(
  { _id: appointment._id },
  { $set: { videoChannel: String(appointment._id) } }
);

console.log(`\nJoinable now: http://localhost:5173/consult/${appointment._id}`);
console.log(`  patient: ${patient.email}`);
console.log(`  doctor:  ${doctor.email}`);
console.log('  password for both: Password@123\n');

await disconnectDB();
