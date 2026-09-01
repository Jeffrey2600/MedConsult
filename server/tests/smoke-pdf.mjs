/**
 * Prescription PDF rendering.
 *
 * Renders uncompressed so the drawn text can be read back out of the file and
 * asserted on — this is what proves the document actually says what it should,
 * rather than merely being a valid PDF of a plausible size.
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import {
  Prescription,
  Appointment,
  DoctorProfile,
  PatientProfile,
  User,
} from '../src/models/index.js';
import { renderPrescriptionPdf } from '../src/services/pdf.service.js';

await connectDB();

const prescription = await Prescription.findOne().sort({ issuedAt: -1 }).lean();
if (!prescription) {
  console.error('No prescriptions found. Run: npm run seed:fresh');
  await disconnectDB();
  process.exit(1);
}

const [doctor, patient, doctorProfile, patientProfileDoc, appointment] = await Promise.all([
  User.findById(prescription.doctor).lean(),
  User.findById(prescription.patient).lean(),
  DoctorProfile.findOne({ user: prescription.doctor }).populate('specialty', 'name').lean(),
  PatientProfile.findOne({ user: prescription.patient }),
  Appointment.findById(prescription.appointment).lean(),
]);
const patientProfile = patientProfileDoc ? patientProfileDoc.toJSON() : null;

const buffer = await renderPrescriptionPdf({
  prescription, doctor, patient, doctorProfile, patientProfile, appointment,
  compress: false,
});
const raw = buffer.toString('latin1');

/** PDFKit draws text as <hex> strings inside TJ arrays. */
const extractText = (pdf) =>
  [...pdf.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map((m) => Buffer.from(m[1], 'hex').toString('latin1'))
    .join(' ');

const countPages = (pdf) => (pdf.match(/\/MediaBox/g) || []).length;

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// Kerning splits words across array elements ("Kar thik"), so whitespace
// carries no meaning here and is stripped from both sides before comparing.
const squash = (s) => String(s).toLowerCase().replace(/\s+/g, '');
const shown = squash(extractText(raw));
const has = (needle) => shown.includes(squash(needle));

check('the PDF is a valid document', buffer.subarray(0, 5).toString() === '%PDF-');
check('a normal prescription fits on a single page', countPages(raw) === 1,
  `${countPages(raw)} page(s)`);
check('the product name appears', has('MedConsult'));
check('the doctor is named', has(doctor.name.replace(/^Dr\.?\s*/i, '')), doctor.name);
check('the patient is named', has(patient.name), patient.name);
check('the specialty appears', has(doctorProfile.specialty.name));
check('the registration number appears', has(doctorProfile.registrationNumber));
check('section headings are present',
  has('PRESCRIBED BY') && has('PATIENT') && has('MEDICATION'));

if (prescription.diagnosis) {
  check('the diagnosis appears', has(prescription.diagnosis.slice(0, 30)));
}
for (const med of prescription.medicines) {
  check(`medicine "${med.name}" appears`, has(med.name));
}
if (prescription.medicines[0]?.frequency) {
  check('dosing instructions appear', has(prescription.medicines[0].frequency));
}
if (prescription.advice) {
  check('the advice appears', has(prescription.advice.slice(0, 25)));
}
if (patientProfile?.bloodGroup) {
  check('the patient age and blood group appear',
    has(String(patientProfile.age)) && has(patientProfile.bloodGroup));
}
if (patientProfile?.allergies?.length) {
  check('allergies are printed prominently',
    has('ALLERGIES') && has(patientProfile.allergies[0]), patientProfile.allergies.join(', '));
}

check('the legal disclaimer is on the document itself', has('not a legally valid e-prescription'));
check('it warns against dispensing', has('Do not use it to dispense'));

// A long prescription must paginate cleanly rather than lose content.
const bigBuffer = await renderPrescriptionPdf({
  prescription: {
    ...prescription,
    medicines: Array.from({ length: 18 }, (_, i) => ({
      name: `Test Medicine ${i + 1} 500mg`,
      dosage: '2 tablets',
      frequency: 'Three times daily after food',
      duration: '14 days',
      notes: 'Take with a full glass of water.',
    })),
    advice: 'Follow-up advice repeated at length. '.repeat(20),
  },
  doctor, patient, doctorProfile, patientProfile, appointment, compress: false,
});
const bigRaw = bigBuffer.toString('latin1');
const bigText = squash(extractText(bigRaw));

check('a long prescription spills onto further pages', countPages(bigRaw) > 1,
  `${countPages(bigRaw)} pages`);

const missing = Array.from({ length: 18 }, (_, i) => `Test Medicine ${i + 1} 500mg`)
  .filter((name) => !bigText.includes(squash(name)));
check('every medicine survives pagination', missing.length === 0,
  missing.length ? `missing: ${missing.join(', ')}` : 'all 18 present');
check('the disclaimer still appears on a long prescription',
  bigText.includes(squash('not a legally valid e-prescription')));

await disconnectDB();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
