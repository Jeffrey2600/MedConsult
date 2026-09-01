/**
 * Writes the most recent prescription to a PDF on disk so the layout can be
 * inspected by eye. Not part of `npm test`.
 *
 *   node tests/export-sample-prescription.mjs [outputPath]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Prescription, Appointment, DoctorProfile, PatientProfile, User } from '../src/models/index.js';
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

const buffer = await renderPrescriptionPdf({
  prescription,
  doctor,
  patient,
  doctorProfile,
  patientProfile: patientProfileDoc ? patientProfileDoc.toJSON() : null,
  appointment,
});

const outPath = path.resolve(process.argv[2] || 'sample-prescription.pdf');
await fs.writeFile(outPath, buffer);

console.log(`Wrote ${buffer.length} bytes to ${outPath}`);
await disconnectDB();
