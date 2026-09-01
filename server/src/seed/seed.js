/**
 * Demo data seeder.
 *
 *   npm run seed          clears the app collections and reseeds
 *   npm run seed:fresh    drops the whole database first
 *
 * Produces a dataset that lets every screen and every role be demonstrated
 * immediately after a fresh clone: an admin, eight specialties, six doctors
 * (five approved plus one left pending so the verification queue is not
 * empty), three patients, published availability including an overnight
 * window to show 24x7 booking, and appointments in every status with a
 * prescription attached to the completed one.
 */
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import { connectDB, disconnectDB } from '../config/db.js';
import {
  User,
  Specialty,
  DoctorProfile,
  PatientProfile,
  AvailabilityRule,
  Appointment,
  Prescription,
  Notification,
  Setting,
  Message,
  MedicalRecord,
  SosEvent,
  SymptomCheck,
  BlockedDate,
} from '../models/index.js';
import {
  ROLES,
  VERIFICATION_STATUS,
  APPOINTMENT_STATUS,
  NOTIFICATION_TYPES,
  DEFAULT_SETTINGS,
} from '../utils/constants.js';
import { slugify } from '../models/Specialty.js';

const DEMO_PASSWORD = 'Password@123';
const ADMIN_PASSWORD = 'Admin@12345';

const SPECIALTIES = [
  ['General Physician', 'First point of contact for common illnesses and health checks.', 'stethoscope'],
  ['Cardiology', 'Heart and blood vessel conditions, blood pressure, chest pain.', 'heart-pulse'],
  ['Dermatology', 'Skin, hair and nail conditions, allergies and rashes.', 'scan-face'],
  ['Pediatrics', 'Healthcare for infants, children and adolescents.', 'baby'],
  ['Orthopaedics', 'Bones, joints, fractures, back and knee pain.', 'bone'],
  ['Gynaecology', "Women's reproductive health, pregnancy and menstrual care.", 'venus'],
  ['Psychiatry', 'Mental health, anxiety, depression, sleep and stress.', 'brain'],
  ['ENT', 'Ear, nose, throat, sinus, hearing and voice problems.', 'ear'],
];

const DOCTORS = [
  {
    name: 'Dr. Anitha Raman',
    email: 'anitha.raman@medconsult.local',
    specialty: 'General Physician',
    registrationNumber: 'TN-GP-48120',
    qualifications: ['MBBS', 'MD (General Medicine)'],
    experienceYears: 12,
    languages: ['en', 'ta'],
    consultationFee: 300,
    bio: 'General physician with over a decade of experience in primary care, diabetes management and preventive health.',
    status: VERIFICATION_STATUS.APPROVED,
  },
  {
    name: 'Dr. Vikram Iyer',
    email: 'vikram.iyer@medconsult.local',
    specialty: 'Cardiology',
    registrationNumber: 'TN-CD-22907',
    qualifications: ['MBBS', 'MD', 'DM (Cardiology)'],
    experienceYears: 18,
    languages: ['en', 'ta', 'hi'],
    consultationFee: 800,
    bio: 'Interventional cardiologist focused on hypertension, arrhythmia and post-operative cardiac follow-up.',
    status: VERIFICATION_STATUS.APPROVED,
  },
  {
    name: 'Dr. Meera Nair',
    email: 'meera.nair@medconsult.local',
    specialty: 'Dermatology',
    registrationNumber: 'KL-DR-71554',
    qualifications: ['MBBS', 'MD (Dermatology)'],
    experienceYears: 9,
    languages: ['en', 'ml'],
    consultationFee: 450,
    bio: 'Dermatologist treating acne, eczema, pigmentation and hair loss, with an interest in teledermatology.',
    status: VERIFICATION_STATUS.APPROVED,
  },
  {
    name: 'Dr. Sanjay Reddy',
    email: 'sanjay.reddy@medconsult.local',
    specialty: 'Pediatrics',
    registrationNumber: 'TG-PD-33418',
    qualifications: ['MBBS', 'DCH', 'MD (Paediatrics)'],
    experienceYears: 14,
    languages: ['en', 'te', 'hi'],
    consultationFee: 400,
    bio: 'Paediatrician handling childhood infections, growth and nutrition, vaccination schedules and newborn care.',
    status: VERIFICATION_STATUS.APPROVED,
    // Overnight availability, so "24x7 consultation" is visible in the UI.
    overnight: true,
  },
  {
    name: 'Dr. Priya Deshmukh',
    email: 'priya.deshmukh@medconsult.local',
    specialty: 'Psychiatry',
    registrationNumber: 'MH-PS-90233',
    qualifications: ['MBBS', 'MD (Psychiatry)'],
    experienceYears: 7,
    languages: ['en', 'hi'],
    consultationFee: 700,
    bio: 'Psychiatrist working on anxiety, depression, sleep disorders and workplace stress, with a counselling-first approach.',
    status: VERIFICATION_STATUS.APPROVED,
  },
  {
    // Deliberately left unverified so the admin queue has something in it.
    name: 'Dr. Rahul Menon',
    email: 'rahul.menon@medconsult.local',
    specialty: 'Orthopaedics',
    registrationNumber: 'KL-OR-10877',
    qualifications: ['MBBS', 'MS (Orthopaedics)'],
    experienceYears: 6,
    languages: ['en', 'ml', 'ta'],
    consultationFee: 550,
    bio: 'Orthopaedic surgeon with a focus on sports injuries, joint pain and post-fracture rehabilitation.',
    status: VERIFICATION_STATUS.PENDING,
  },
];

const PATIENTS = [
  {
    name: 'Karthik Subramanian',
    email: 'karthik@example.com',
    phone: '+919876543210',
    preferredLanguage: 'ta',
    dateOfBirth: '1996-04-18',
    gender: 'male',
    bloodGroup: 'O+',
    allergies: ['Penicillin'],
    chronicConditions: ['Asthma'],
    emergencyContact: {
      name: 'Lakshmi Subramanian',
      relation: 'Mother',
      email: 'lakshmi@example.com',
      whatsappNumber: '919876543211',
    },
  },
  {
    name: 'Fathima Beevi',
    email: 'fathima@example.com',
    phone: '+919812345678',
    preferredLanguage: 'ml',
    dateOfBirth: '1988-11-02',
    gender: 'female',
    bloodGroup: 'B+',
    allergies: [],
    chronicConditions: ['Hypothyroidism'],
    emergencyContact: {
      name: 'Abdul Rahman',
      relation: 'Husband',
      email: 'abdul@example.com',
      whatsappNumber: '919812345679',
    },
  },
  {
    name: 'Ravi Teja',
    email: 'ravi@example.com',
    phone: '+919701234567',
    preferredLanguage: 'te',
    dateOfBirth: '2001-07-25',
    gender: 'male',
    bloodGroup: 'A+',
    allergies: ['Dust mites'],
    chronicConditions: [],
    emergencyContact: {
      name: 'Sridevi Teja',
      relation: 'Sister',
      email: 'sridevi@example.com',
      whatsappNumber: '919701234568',
    },
  },
];

const MANAGED_MODELS = [
  User,
  Specialty,
  DoctorProfile,
  PatientProfile,
  AvailabilityRule,
  BlockedDate,
  Appointment,
  Message,
  Prescription,
  MedicalRecord,
  Notification,
  SosEvent,
  SymptomCheck,
  Setting,
];

async function createUser({ password, ...fields }) {
  const user = new User(fields);
  await user.setPassword(password);
  await user.save();
  return user;
}

/** Next occurrence of a weekday at a given local hour, as a UTC Date. */
function upcoming(daysAhead, hour, minute = 0) {
  return dayjs().add(daysAhead, 'day').hour(hour).minute(minute).second(0).millisecond(0).toDate();
}

function past(daysAgo, hour, minute = 0) {
  return dayjs().subtract(daysAgo, 'day').hour(hour).minute(minute).second(0).millisecond(0).toDate();
}

/**
 * Emails this script only ever creates itself. Anything else found in the
 * User collection was typed by a real person through the app and must never
 * be silently destroyed by a demo-data reset.
 */
const KNOWN_SEED_EMAILS = new Set([
  'admin@medconsult.local',
  ...DOCTORS.map((d) => d.email),
  ...PATIENTS.map((p) => p.email),
]);

const CONFIRM_FLAG = '--i-understand-this-deletes-all-data';

/**
 * Refuses to proceed if the database holds any account this script did not
 * itself create — unless the caller has explicitly passed CONFIRM_FLAG.
 *
 * Both the default reset (deleteMany({})) and --fresh (dropDatabase) are
 * unconditionally destructive across every collection, including User. That
 * makes them safe against a purpose-built demo database and dangerous
 * against anything a real person has touched, and the script has no way to
 * tell those apart except by checking for accounts it does not recognise.
 * This check is what happened to be missing the day this script deleted a
 * real user's account and their emergency contact settings with it.
 */
async function assertSafeToWipe(forced) {
  const strangers = await User.find({ email: { $nin: [...KNOWN_SEED_EMAILS] } })
    .select('email role createdAt')
    .lean();

  if (!strangers.length) return;

  console.error('\n[seed] REFUSING TO RUN.');
  console.error(
    `[seed] This database contains ${strangers.length} account(s) this script did not create:`
  );
  for (const u of strangers.slice(0, 20)) {
    console.error(`  - ${u.email} (${u.role}), created ${u.createdAt?.toISOString?.() ?? 'unknown'}`);
  }
  if (strangers.length > 20) console.error(`  ...and ${strangers.length - 20} more`);
  console.error(
    '\n[seed] Both the default reset and --fresh delete EVERY account, seeded or not.'
  );
  console.error(
    `[seed] If you are certain none of the above matters, re-run with ${CONFIRM_FLAG}.`
  );
  console.error(
    '[seed] If you are not certain, stop and back up the database first.\n'
  );

  if (!forced) {
    await disconnectDB();
    process.exit(1);
  }

  console.warn(`[seed] ${CONFIRM_FLAG} was passed — proceeding despite the accounts above.\n`);
}

async function run() {
  const fresh = process.argv.includes('--fresh');
  const forced = process.argv.includes(CONFIRM_FLAG);
  await connectDB();

  await assertSafeToWipe(forced);

  if (fresh) {
    await mongoose.connection.dropDatabase();
    console.log('[seed] Dropped the entire database');
  } else {
    await Promise.all(MANAGED_MODELS.map((M) => M.deleteMany({})));
    console.log('[seed] Cleared existing application data');
  }

  // Indexes are normally built lazily on first write; building them up front
  // means the unique double-booking index is definitely active for the demo.
  await Promise.all(MANAGED_MODELS.map((M) => M.syncIndexes()));

  // ---- Settings -----------------------------------------------------------
  await Setting.bulkWrite(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
      updateOne: { filter: { key }, update: { $set: { key, value } }, upsert: true },
    }))
  );

  // ---- Specialties --------------------------------------------------------
  const specialtyDocs = await Specialty.insertMany(
    SPECIALTIES.map(([name, description, icon]) => ({
      name,
      slug: slugify(name),
      description,
      icon,
      isActive: true,
    }))
  );
  const specialtyByName = Object.fromEntries(specialtyDocs.map((s) => [s.name, s]));
  console.log(`[seed] ${specialtyDocs.length} specialties`);

  // ---- Admin --------------------------------------------------------------
  const admin = await createUser({
    name: 'System Administrator',
    email: 'admin@medconsult.local',
    password: ADMIN_PASSWORD,
    role: ROLES.ADMIN,
    phone: '+911140001000',
    preferredLanguage: 'en',
  });
  console.log('[seed] 1 administrator');

  // ---- Doctors ------------------------------------------------------------
  const doctors = [];
  for (const d of DOCTORS) {
    const user = await createUser({
      name: d.name,
      email: d.email,
      password: DEMO_PASSWORD,
      role: ROLES.DOCTOR,
      phone: '+9199' + Math.floor(10000000 + Math.random() * 89999999),
      preferredLanguage: d.languages[0],
    });

    const profile = await DoctorProfile.create({
      user: user._id,
      specialty: specialtyByName[d.specialty]._id,
      registrationNumber: d.registrationNumber,
      qualifications: d.qualifications,
      experienceYears: d.experienceYears,
      bio: d.bio,
      languages: d.languages,
      consultationFee: d.consultationFee,
      verificationStatus: d.status,
      verifiedAt: d.status === VERIFICATION_STATUS.APPROVED ? new Date() : undefined,
      verifiedBy: d.status === VERIFICATION_STATUS.APPROVED ? admin._id : undefined,
      ratingAverage: d.status === VERIFICATION_STATUS.APPROVED ? 4 + Math.random() : 0,
      ratingCount: d.status === VERIFICATION_STATUS.APPROVED ? 10 + Math.floor(Math.random() * 40) : 0,
    });

    // Approved doctors publish a weekly schedule; the pending one does not.
    if (d.status === VERIFICATION_STATUS.APPROVED) {
      const rules = [];
      for (let day = 1; day <= 6; day += 1) {
        rules.push({
          doctor: user._id,
          dayOfWeek: day,
          startMinute: 9 * 60,
          endMinute: 13 * 60,
          slotMinutes: 30,
        });
        rules.push({
          doctor: user._id,
          dayOfWeek: day,
          startMinute: 17 * 60,
          endMinute: 21 * 60,
          slotMinutes: 30,
        });
      }
      if (d.overnight) {
        // 22:00–02:00 would cross midnight, so it is stored as two windows.
        for (let day = 0; day <= 6; day += 1) {
          rules.push({
            doctor: user._id,
            dayOfWeek: day,
            startMinute: 22 * 60,
            endMinute: 24 * 60,
            slotMinutes: 30,
          });
          rules.push({
            doctor: user._id,
            dayOfWeek: day,
            startMinute: 0,
            endMinute: 2 * 60,
            slotMinutes: 30,
          });
        }
      }
      await AvailabilityRule.insertMany(rules);
    }

    doctors.push({ user, profile, meta: d });
  }
  console.log(`[seed] ${doctors.length} doctors (${DOCTORS.filter((d) => d.status === 'pending').length} awaiting verification)`);

  // ---- Patients -----------------------------------------------------------
  const patients = [];
  for (const p of PATIENTS) {
    const user = await createUser({
      name: p.name,
      email: p.email,
      password: DEMO_PASSWORD,
      role: ROLES.PATIENT,
      phone: p.phone,
      preferredLanguage: p.preferredLanguage,
    });
    const profile = await PatientProfile.create({
      user: user._id,
      dateOfBirth: new Date(p.dateOfBirth),
      gender: p.gender,
      bloodGroup: p.bloodGroup,
      allergies: p.allergies,
      chronicConditions: p.chronicConditions,
      emergencyContact: p.emergencyContact,
    });
    patients.push({ user, profile });
  }
  console.log(`[seed] ${patients.length} patients`);

  // ---- Appointments, one in every status ----------------------------------
  const [gp, cardio, derma, paeds] = doctors;
  const [karthik, fathima, ravi] = patients;

  const appointments = await Appointment.insertMany([
    {
      patient: karthik.user._id,
      doctor: gp.user._id,
      startsAt: upcoming(1, 10, 0),
      endsAt: upcoming(1, 10, 30),
      status: APPOINTMENT_STATUS.PENDING,
      reason: 'Persistent dry cough and mild fever for the last four days.',
    },
    {
      patient: fathima.user._id,
      doctor: cardio.user._id,
      startsAt: upcoming(2, 17, 30),
      endsAt: upcoming(2, 18, 0),
      status: APPOINTMENT_STATUS.ACCEPTED,
      reason: 'Follow-up on blood pressure medication and recent ECG report.',
      videoChannel: '',
    },
    {
      patient: ravi.user._id,
      doctor: paeds.user._id,
      startsAt: upcoming(0, 23, 0),
      endsAt: upcoming(0, 23, 30),
      status: APPOINTMENT_STATUS.ACCEPTED,
      reason: 'Late-night consultation for a younger sibling with high fever.',
    },
    {
      patient: karthik.user._id,
      doctor: derma.user._id,
      startsAt: past(6, 11, 0),
      endsAt: past(6, 11, 30),
      status: APPOINTMENT_STATUS.COMPLETED,
      reason: 'Itchy red patches on both forearms after starting a new detergent.',
      completedAt: past(6, 11, 28),
      doctorNotes: 'Contact dermatitis, likely detergent related. Advised patch testing if it recurs.',
    },
    {
      patient: fathima.user._id,
      doctor: gp.user._id,
      startsAt: past(3, 18, 0),
      endsAt: past(3, 18, 30),
      status: APPOINTMENT_STATUS.REJECTED,
      reason: 'General health check-up.',
      rejectionReason: 'Emergency surgery scheduled at that time — please book another slot.',
    },
    {
      patient: ravi.user._id,
      doctor: cardio.user._id,
      startsAt: past(2, 9, 30),
      endsAt: past(2, 10, 0),
      status: APPOINTMENT_STATUS.CANCELLED,
      reason: 'Chest tightness while exercising.',
      cancelledBy: ravi.user._id,
      cancellationReason: 'Symptoms resolved, rebooking later.',
    },
  ]);

  // Give the accepted ones a video channel, exactly as the accept flow does.
  await Promise.all(
    appointments
      .filter((a) => a.status === APPOINTMENT_STATUS.ACCEPTED)
      .map((a) =>
        Appointment.updateOne({ _id: a._id }, { $set: { videoChannel: String(a._id) } })
      )
  );
  console.log(`[seed] ${appointments.length} appointments across every status`);

  // ---- Prescription for the completed consultation ------------------------
  const completed = appointments.find((a) => a.status === APPOINTMENT_STATUS.COMPLETED);
  await Prescription.create({
    appointment: completed._id,
    doctor: completed.doctor,
    patient: completed.patient,
    diagnosis: 'Allergic contact dermatitis of both forearms.',
    medicines: [
      {
        name: 'Cetirizine 10mg',
        dosage: '1 tablet',
        frequency: 'Once at night',
        duration: '7 days',
        notes: 'May cause drowsiness. Avoid driving after taking it.',
      },
      {
        name: 'Mometasone 0.1% cream',
        dosage: 'Thin layer',
        frequency: 'Twice daily',
        duration: '10 days',
        notes: 'Apply to affected areas only. Do not use on the face.',
      },
    ],
    tests: ['Patch test (only if the rash returns after treatment)'],
    advice:
      'Switch to a fragrance-free detergent and rinse clothes twice. Use lukewarm water, avoid scratching, and moisturise after every wash. Return if the rash spreads or blisters appear.',
    followUpDate: dayjs(completed.startsAt).add(14, 'day').toDate(),
    issuedAt: completed.completedAt,
  });
  console.log('[seed] 1 prescription');

  // ---- A few unread notifications so the bell is not empty ----------------
  await Notification.insertMany([
    {
      user: gp.user._id,
      type: NOTIFICATION_TYPES.APPOINTMENT_BOOKED,
      title: 'New appointment request',
      body: `${karthik.user.name} requested an appointment.`,
      link: '/doctor/appointments',
    },
    {
      user: fathima.user._id,
      type: NOTIFICATION_TYPES.APPOINTMENT_ACCEPTED,
      title: 'Appointment confirmed',
      body: `${cardio.user.name} confirmed your appointment.`,
      link: '/patient/appointments',
    },
    {
      user: karthik.user._id,
      type: NOTIFICATION_TYPES.PRESCRIPTION_ISSUED,
      title: 'Prescription issued',
      body: `${derma.user.name} issued a prescription after your consultation.`,
      link: '/patient/prescriptions',
    },
    {
      user: admin._id,
      type: NOTIFICATION_TYPES.DOCTOR_APPROVED,
      title: 'Doctor awaiting verification',
      body: 'Dr. Rahul Menon has registered and needs verification.',
      link: '/admin/verification',
    },
  ]);

  // ---- Summary ------------------------------------------------------------
  const line = '-'.repeat(74);
  console.log(`\n${line}\n  DEMO ACCOUNTS\n${line}`);
  console.log(`  ADMIN     admin@medconsult.local                 ${ADMIN_PASSWORD}`);
  for (const d of DOCTORS) {
    const tag = d.status === VERIFICATION_STATUS.APPROVED ? 'DOCTOR   ' : 'DOCTOR(!)';
    console.log(`  ${tag} ${d.email.padEnd(38)} ${DEMO_PASSWORD}`);
  }
  for (const p of PATIENTS) {
    console.log(`  PATIENT   ${p.email.padEnd(38)} ${DEMO_PASSWORD}`);
  }
  console.log(line);
  console.log('  (!) = awaiting verification, use this one to demo the admin queue');
  console.log(`${line}\n`);

  await disconnectDB();
}

run().catch(async (err) => {
  console.error('[seed] Failed:', err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
