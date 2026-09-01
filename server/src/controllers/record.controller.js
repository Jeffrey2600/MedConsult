import { MedicalRecord, Appointment, User, PatientProfile } from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ROLES, RECORD_ACCESS_STATUSES, RECORD_CATEGORIES } from '../utils/constants.js';
import { sniffMimeType } from '../middleware/upload.js';
import {
  uploadBuffer,
  signedUrl,
  destroyFile,
  usingCloudinary,
  readLocalFile,
  verifyLocalToken,
} from '../services/storage.service.js';

/**
 * Decides whether `viewer` may see `patientId`'s medical records.
 *
 * A patient always sees their own. A doctor sees them only while they have a
 * confirmed or completed appointment with that patient — the relationship is
 * what grants access, and it is re-checked on every request rather than
 * granted once. Administrators are deliberately excluded: they manage
 * accounts, not clinical records, and there is no operational reason for the
 * platform's operator to read a patient's scans.
 */
async function assertCanViewRecords(viewer, patientId) {
  if (String(viewer._id) === String(patientId)) return;

  if (viewer.role === ROLES.DOCTOR) {
    const linked = await Appointment.exists({
      doctor: viewer._id,
      patient: patientId,
      status: { $in: RECORD_ACCESS_STATUSES },
    });
    if (linked) return;
    throw ApiError.forbidden(
      'You can only view records for patients you have a confirmed consultation with'
    );
  }

  throw ApiError.forbidden('You do not have access to these records');
}

export const uploadRecord = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose a file to upload');

  // The declared Content-Type got the file through multer; this is the check
  // that actually matters.
  const realMimeType = sniffMimeType(req.file.buffer);
  if (!realMimeType) {
    throw ApiError.badRequest(
      'That file is not a valid PDF, JPEG or PNG. Only those formats can be uploaded.'
    );
  }

  const { title, category = 'other', notes = '', recordDate } = req.body;

  const stored = await uploadBuffer({
    buffer: req.file.buffer,
    folder: `records/${req.user._id}`,
    mimeType: realMimeType,
    originalName: req.file.originalname,
  });

  const record = await MedicalRecord.create({
    patient: req.user._id,
    uploadedBy: req.user._id,
    title,
    category: RECORD_CATEGORIES.includes(category) ? category : 'other',
    notes,
    recordDate: recordDate || new Date(),
    publicId: stored.publicId,
    resourceType: stored.resourceType,
    format: stored.format,
    mimeType: realMimeType,
    sizeBytes: stored.bytes,
    originalName: req.file.originalname,
    localPath: stored.localPath,
  });

  res.status(201).json({ success: true, record });
});

export const listMyRecords = asyncHandler(async (req, res) => {
  const { category } = req.validatedQuery ?? {};

  const filter = { patient: req.user._id };
  if (category) filter.category = category;

  const records = await MedicalRecord.find(filter).sort({ recordDate: -1, createdAt: -1 }).lean();
  res.json({ success: true, records });
});

/** A doctor viewing one of their patients' records. */
export const listPatientRecords = asyncHandler(async (req, res) => {
  const patientId = req.params.patientId;

  const patient = await User.findOne({ _id: patientId, role: ROLES.PATIENT }).lean();
  if (!patient) throw ApiError.notFound('Patient not found');

  await assertCanViewRecords(req.user, patientId);

  const [records, profile] = await Promise.all([
    MedicalRecord.find({ patient: patientId }).sort({ recordDate: -1 }).lean(),
    PatientProfile.findOne({ user: patientId }),
  ]);

  res.json({
    success: true,
    records,
    patient: { id: patient._id, name: patient.name },
    profile: profile ? profile.toJSON() : null,
  });
});

/**
 * Issues a short-lived link to one file. This is the only way to reach a
 * stored document — nothing is ever served from a permanent public URL.
 */
export const getRecordUrl = asyncHandler(async (req, res) => {
  const record = await MedicalRecord.findById(req.params.id).lean();
  if (!record) throw ApiError.notFound('Record not found');

  await assertCanViewRecords(req.user, record.patient);

  const { url, token, expiresAt } = signedUrl({
    publicId: record.publicId,
    resourceType: record.resourceType,
  });

  res.json({
    success: true,
    // With Cloudinary the browser goes straight to a signed CDN URL; without
    // it, back to this API with a self-signed expiring token.
    url: url ?? `/api/records/${record._id}/raw?t=${token}`,
    external: Boolean(url),
    expiresAt,
    mimeType: record.mimeType,
    filename: record.originalName || record.title,
  });
});

/**
 * Streams a locally-stored file. Reachable only with an unexpired signature
 * produced by `getRecordUrl`, so the permission check still gates it even
 * though this route takes no Authorization header — that is what allows the
 * URL to be used directly in an <img> or a download link.
 */
export const streamLocalRecord = asyncHandler(async (req, res) => {
  if (usingCloudinary()) throw ApiError.notFound('Not found');

  const record = await MedicalRecord.findById(req.params.id).lean();
  if (!record || !record.localPath) throw ApiError.notFound('Record not found');

  if (!verifyLocalToken(record.publicId, req.query.t)) {
    throw ApiError.forbidden('This link is invalid or has expired');
  }

  const buffer = await readLocalFile(record.localPath).catch(() => null);
  if (!buffer) throw ApiError.notFound('The stored file could not be read');

  res.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(record.originalName || 'record')}"`
  );
  res.send(buffer);
});

export const updateRecord = asyncHandler(async (req, res) => {
  const record = await MedicalRecord.findOne({
    _id: req.params.id,
    patient: req.user._id,
  });
  if (!record) throw ApiError.notFound('Record not found');

  const { title, category, notes, recordDate } = req.body;
  if (title !== undefined) record.title = title;
  if (category !== undefined) record.category = category;
  if (notes !== undefined) record.notes = notes;
  if (recordDate !== undefined) record.recordDate = recordDate;

  await record.save();
  res.json({ success: true, record: record.toJSON() });
});

/** Only the patient may delete their own record; a doctor never can. */
export const deleteRecord = asyncHandler(async (req, res) => {
  const record = await MedicalRecord.findOne({
    _id: req.params.id,
    patient: req.user._id,
  });
  if (!record) throw ApiError.notFound('Record not found');

  await destroyFile({
    publicId: record.publicId,
    resourceType: record.resourceType,
    localPath: record.localPath,
  });
  await record.deleteOne();

  res.json({ success: true, message: 'Record deleted' });
});
