import {
  Prescription,
  Appointment,
  DoctorProfile,
  PatientProfile,
  User,
} from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ROLES, APPOINTMENT_STATUS, NOTIFICATION_TYPES } from '../utils/constants.js';
import { renderPrescriptionPdf } from '../services/pdf.service.js';
import { uploadBuffer, signedUrl, usingCloudinary, readLocalFile } from '../services/storage.service.js';
import { notify } from '../services/notification.service.js';
import { sendPrescriptionEmail } from '../services/email.service.js';
import { emitToUser } from '../sockets/index.js';

/** Gathers everything the PDF template needs, in one place. */
async function loadContext(prescription) {
  const [doctor, patient, doctorProfile, patientProfile, appointment] = await Promise.all([
    User.findById(prescription.doctor).lean(),
    User.findById(prescription.patient).lean(),
    DoctorProfile.findOne({ user: prescription.doctor }).populate('specialty', 'name').lean(),
    PatientProfile.findOne({ user: prescription.patient }),
    Appointment.findById(prescription.appointment).lean(),
  ]);

  return {
    doctor,
    patient,
    doctorProfile,
    patientProfile: patientProfile ? patientProfile.toJSON() : null,
    appointment,
  };
}

/** Renders the PDF and stores it, returning the storage reference. */
async function generateAndStorePdf(prescription) {
  const context = await loadContext(prescription);
  const buffer = await renderPrescriptionPdf({ prescription, ...context });

  const stored = await uploadBuffer({
    buffer,
    folder: `prescriptions/${prescription.patient}`,
    mimeType: 'application/pdf',
    originalName: `prescription-${prescription._id}.pdf`,
  });

  return stored;
}

export const createPrescription = asyncHandler(async (req, res) => {
  const { appointmentId, diagnosis = '', medicines = [], tests = [], advice = '', followUpDate } = req.body;

  const appointment = await Appointment.findById(appointmentId)
    .populate('patient', 'name email preferredLanguage')
    .populate('doctor', 'name email');
  if (!appointment) throw ApiError.notFound('Appointment not found');

  if (String(appointment.doctor._id) !== String(req.user._id)) {
    throw ApiError.forbidden('Only the consulting doctor can issue this prescription');
  }

  // A prescription records what happened in a consultation, so there has to
  // have been one. Issuing against a pending or rejected booking is refused.
  if (![APPOINTMENT_STATUS.ACCEPTED, APPOINTMENT_STATUS.COMPLETED].includes(appointment.status)) {
    throw ApiError.badRequest(
      'A prescription can only be issued for a confirmed or completed consultation'
    );
  }

  if (!medicines.length && !advice.trim() && !tests.length) {
    throw ApiError.badRequest('Add at least one medicine, test or piece of advice');
  }

  if (await Prescription.exists({ appointment: appointmentId })) {
    throw ApiError.conflict('A prescription has already been issued for this consultation');
  }

  const prescription = await Prescription.create({
    appointment: appointmentId,
    doctor: appointment.doctor._id,
    patient: appointment.patient._id,
    diagnosis,
    medicines,
    tests,
    advice,
    followUpDate,
    issuedAt: new Date(),
  });

  // The record is the source of truth; the PDF is a rendering of it. If
  // generation fails the prescription still stands, and the download route
  // rebuilds the file on demand.
  try {
    const stored = await generateAndStorePdf(prescription);
    prescription.pdfPublicId = stored.publicId;
    prescription.pdfBytes = stored.bytes;
    prescription.pdfLocalPath = stored.localPath;
    await prescription.save();
  } catch (err) {
    console.error('[prescription] PDF generation failed, will retry on download:', err.message);
  }

  await notify({
    user: appointment.patient._id,
    type: NOTIFICATION_TYPES.PRESCRIPTION_ISSUED,
    title: 'Prescription issued',
    body: `${appointment.doctor.name} issued a prescription after your consultation.`,
    link: '/patient/prescriptions',
  });
  emitToUser(appointment.patient._id, 'appointment:updated', { id: String(appointmentId) });

  sendPrescriptionEmail(appointment.patient, appointment.doctor, prescription).catch(() => {});

  res.status(201).json({ success: true, prescription: prescription.toJSON() });
});

export const listPrescriptions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.validatedQuery ?? {};

  const filter =
    req.user.role === ROLES.DOCTOR
      ? { doctor: req.user._id }
      : { patient: req.user._id };

  const [prescriptions, total] = await Promise.all([
    Prescription.find(filter)
      .populate('doctor', 'name')
      .populate('patient', 'name')
      .populate({ path: 'appointment', select: 'startsAt status' })
      .sort({ issuedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Prescription.countDocuments(filter),
  ]);

  // Attach each doctor's specialty without a query per row.
  const doctorIds = [...new Set(prescriptions.map((p) => String(p.doctor?._id)))];
  const profiles = await DoctorProfile.find({ user: { $in: doctorIds } })
    .populate('specialty', 'name')
    .select('user specialty')
    .lean();
  const byUser = Object.fromEntries(profiles.map((p) => [String(p.user), p]));

  res.json({
    success: true,
    prescriptions: prescriptions.map((p) => ({
      ...p,
      doctorProfile: byUser[String(p.doctor?._id)] ?? null,
    })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getPrescription = asyncHandler(async (req, res) => {
  const prescription = await Prescription.findById(req.params.id)
    .populate('doctor', 'name')
    .populate('patient', 'name')
    .populate({ path: 'appointment', select: 'startsAt endsAt status' })
    .lean();

  if (!prescription) throw ApiError.notFound('Prescription not found');

  const isOwner =
    String(prescription.patient._id) === String(req.user._id) ||
    String(prescription.doctor._id) === String(req.user._id);
  if (!isOwner) throw ApiError.forbidden('This is not your prescription');

  const doctorProfile = await DoctorProfile.findOne({ user: prescription.doctor._id })
    .populate('specialty', 'name')
    .lean();

  res.json({ success: true, prescription: { ...prescription, doctorProfile } });
});

/**
 * Returns a link to the prescription PDF, regenerating the file first if it
 * is missing — which covers both a failed upload at issue time and records
 * created by the seed script.
 */
export const getPrescriptionPdf = asyncHandler(async (req, res) => {
  const prescription = await Prescription.findById(req.params.id);
  if (!prescription) throw ApiError.notFound('Prescription not found');

  const isOwner =
    String(prescription.patient) === String(req.user._id) ||
    String(prescription.doctor) === String(req.user._id);
  if (!isOwner) throw ApiError.forbidden('This is not your prescription');

  if (!prescription.pdfPublicId) {
    const stored = await generateAndStorePdf(prescription);
    prescription.pdfPublicId = stored.publicId;
    prescription.pdfBytes = stored.bytes;
    prescription.pdfLocalPath = stored.localPath;
    await prescription.save();
  }

  // Without Cloudinary the file lives on this server, so stream it straight
  // back rather than handing out a link to it.
  if (!usingCloudinary()) {
    const buffer = await readLocalFile(prescription.pdfLocalPath).catch(() => null);
    if (!buffer) throw ApiError.internal('The prescription file could not be read');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="prescription-${prescription._id}.pdf"`
    );
    return res.send(buffer);
  }

  const { url, expiresAt } = signedUrl({
    publicId: prescription.pdfPublicId,
    resourceType: 'raw',
  });

  res.json({ success: true, url, expiresAt });
});
