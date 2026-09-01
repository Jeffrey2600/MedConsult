/**
 * Health records and prescriptions: upload validation, the access rules that
 * decide who may read a patient's documents, expiring links, and PDF
 * generation.
 *
 * Runs against local-disk storage when Cloudinary is unconfigured, which is
 * the same code path with a different backend — the authorisation checks and
 * the expiring-signature model are identical either way.
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { MedicalRecord, Prescription, Appointment, User } from '../src/models/index.js';
import { sniffMimeType } from '../src/middleware/upload.js';

const BASE = 'http://127.0.0.1:5000/api';

await connectDB();

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function call(path, { method = 'GET', body, token, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(raw ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: raw ? body : JSON.stringify(body) } : {}),
  });
  const type = res.headers.get('content-type') ?? '';
  let json = null;
  let buffer = null;
  if (type.includes('application/json')) {
    try { json = await res.json(); } catch {}
  } else {
    buffer = Buffer.from(await res.arrayBuffer());
  }
  return { status: res.status, json, buffer, type };
}

const loginAs = async (email, password = 'Password@123') =>
  (await call('/auth/login', { method: 'POST', body: { email, password } })).json.token;

const patientToken = await loginAs('karthik@example.com');
const otherPatientToken = await loginAs('fathima@example.com');
const dermaToken = await loginAs('meera.nair@medconsult.local');
const cardioToken = await loginAs('vikram.iyer@medconsult.local');
const adminToken = await loginAs('admin@medconsult.local', 'Admin@12345');

const patient = await User.findOne({ email: 'karthik@example.com' }).lean();
const derma = await User.findOne({ email: 'meera.nair@medconsult.local' }).lean();

// ---- file signature sniffing (pure function) -----------------------------
check('a real PDF is recognised',
  sniffMimeType(Buffer.from('%PDF-1.7\n...')) === 'application/pdf');
check('a real PNG is recognised',
  sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])) === 'image/png');
check('a real JPEG is recognised',
  sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])) === 'image/jpeg');
check('an executable is not mistaken for a document',
  sniffMimeType(Buffer.from('MZ\x90\x00executable')) === null);
check('plain text is rejected', sniffMimeType(Buffer.from('just some text here')) === null);
check('an empty buffer is rejected', sniffMimeType(Buffer.alloc(0)) === null);

// ---- upload --------------------------------------------------------------
const makePdf = (label) => Buffer.concat([
  Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n'),
  Buffer.from(`% ${label}\n`),
  Buffer.from('trailer<</Root 1 0 R>>\n%%EOF\n'),
]);

const upload = async ({ token, buffer, filename, contentType, title = 'Blood test report', category = 'lab_report' }) => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), filename);
  form.append('title', title);
  form.append('category', category);
  const res = await fetch(`${BASE}/records`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const noAuth = await upload({ token: '', buffer: makePdf('x'), filename: 'a.pdf', contentType: 'application/pdf' });
check('uploading requires authentication', noAuth.status === 401);

const asDoctor = await upload({ token: dermaToken, buffer: makePdf('x'), filename: 'a.pdf', contentType: 'application/pdf' });
check('a doctor cannot upload into a patient record area', asDoctor.status === 403);

const goodUpload = await upload({
  token: patientToken, buffer: makePdf('blood test'),
  filename: 'blood-test.pdf', contentType: 'application/pdf',
});
check('a patient can upload a PDF', goodUpload.status === 201, goodUpload.json?.message);
check('the stored record keeps the sniffed mime type',
  goodUpload.json?.record?.mimeType === 'application/pdf');
check('the stored public id is unguessable',
  /[0-9a-f]{48}/.test(goodUpload.json?.record?.publicId ?? ''),
  goodUpload.json?.record?.publicId);
check('no public URL is stored on the record',
  !JSON.stringify(goodUpload.json.record).includes('http'));
const recordId = goodUpload.json.record._id;

const pngUpload = await upload({
  token: patientToken,
  buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]),
  filename: 'scan.png', contentType: 'image/png', title: 'Chest X-ray', category: 'scan',
});
check('a patient can upload a PNG', pngUpload.status === 201);

// A file claiming to be a PDF that is really something else.
const disguised = await upload({
  token: patientToken, buffer: Buffer.from('MZ\x90\x00 this is an executable'),
  filename: 'report.pdf', contentType: 'application/pdf',
});
check('a disguised file is rejected despite a valid name and Content-Type',
  disguised.status === 400, disguised.json?.message);

const wrongType = await upload({
  token: patientToken, buffer: Buffer.from('body,of,csv'),
  filename: 'data.csv', contentType: 'text/csv',
});
check('an unsupported Content-Type is rejected', wrongType.status === 400);

const tooBig = await upload({
  token: patientToken,
  buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(6 * 1024 * 1024)]),
  filename: 'huge.pdf', contentType: 'application/pdf',
});
check('a file over the size limit is rejected', tooBig.status === 400, tooBig.json?.message);

const noTitle = await (async () => {
  const form = new FormData();
  form.append('file', new Blob([makePdf('x')], { type: 'application/pdf' }), 'a.pdf');
  const res = await fetch(`${BASE}/records`, {
    method: 'POST', headers: { Authorization: `Bearer ${patientToken}` }, body: form,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
})();
check('a record without a title is rejected', noTitle.status === 400);

// ---- listing and scoping -------------------------------------------------
const mine = await call('/records', { token: patientToken });
check('a patient lists their own records', mine.status === 200 && mine.json.records.length === 2,
  `${mine.json.records?.length} records`);
check('every returned record belongs to the caller',
  mine.json.records.every((r) => String(r.patient) === String(patient._id)));

const filtered = await call('/records?category=scan', { token: patientToken });
check('records can be filtered by category',
  filtered.json.records.length === 1 && filtered.json.records[0].category === 'scan');

const othersRecords = await call('/records', { token: otherPatientToken });
check('another patient sees none of these records',
  othersRecords.json.records.every((r) => String(r.patient) !== String(patient._id)));

// ---- who may read a patient's records ------------------------------------
// Dr Nair has a completed consultation with this patient in the seed data.
const dermaView = await call(`/records/patient/${patient._id}`, { token: dermaToken });
check('a doctor with a consultation can list the patient\'s records',
  dermaView.status === 200 && dermaView.json.records.length === 2,
  `${dermaView.json.records?.length ?? 0} records`);
check('the doctor also receives the clinical profile',
  Array.isArray(dermaView.json.profile?.allergies));

// Dr Iyer has only a cancelled appointment with this patient.
const cardioView = await call(`/records/patient/${patient._id}`, { token: cardioToken });
check('a doctor without a confirmed consultation is refused', cardioView.status === 403,
  cardioView.json?.message);

const adminView = await call(`/records/patient/${patient._id}`, { token: adminToken });
check('an administrator cannot read clinical records', adminView.status === 403,
  adminView.json?.message);

const peerView = await call(`/records/patient/${patient._id}`, { token: otherPatientToken });
check('one patient cannot read another patient\'s records', peerView.status === 403);

// ---- expiring links ------------------------------------------------------
const urlRes = await call(`/records/${recordId}/url`, { token: patientToken });
check('the owner can mint a link', urlRes.status === 200 && !!urlRes.json.url);
check('the link carries an expiry', !!urlRes.json.expiresAt);
const ttlMinutes = (new Date(urlRes.json.expiresAt) - Date.now()) / 60000;
check('the link is short-lived', ttlMinutes > 0 && ttlMinutes <= 10, `${ttlMinutes.toFixed(1)} min`);

const urlAsStranger = await call(`/records/${recordId}/url`, { token: otherPatientToken });
check('a stranger cannot mint a link for it', urlAsStranger.status === 403);

const urlAsCardio = await call(`/records/${recordId}/url`, { token: cardioToken });
check('an unrelated doctor cannot mint a link either', urlAsCardio.status === 403);

const urlAsDerma = await call(`/records/${recordId}/url`, { token: dermaToken });
check('the consulting doctor can mint a link', urlAsDerma.status === 200);

if (!urlRes.json.external) {
  const rawPath = urlRes.json.url.replace('/api', '');
  const fetched = await call(rawPath);
  check('the signed link serves the file without an auth header',
    fetched.status === 200 && fetched.buffer?.subarray(0, 4).toString() === '%PDF',
    `${fetched.type}, ${fetched.buffer?.length} bytes`);

  const tampered = await call(rawPath.replace(/t=(\d+)\./, 't=$1x.'));
  check('a tampered signature is refused', tampered.status === 403);

  const noToken = await call(rawPath.split('?')[0]);
  check('the raw route refuses a request with no signature', noToken.status === 400 || noToken.status === 403,
    `HTTP ${noToken.status}`);

  const [expiry, sig] = new URL(`http://x${rawPath}`).searchParams.get('t').split('.');
  const expiredPath = `${rawPath.split('?')[0]}?t=${Number(expiry) - 100000}.${sig}`;
  const expired = await call(expiredPath);
  check('an expired signature is refused', expired.status === 403);
}

// ---- editing and deleting -------------------------------------------------
const renamed = await call(`/records/${recordId}`, {
  method: 'PATCH', token: patientToken, body: { title: 'Full blood count' },
});
check('the owner can rename a record', renamed.status === 200 &&
  renamed.json.record.title === 'Full blood count');

const renameByDoctor = await call(`/records/${recordId}`, {
  method: 'PATCH', token: dermaToken, body: { title: 'Doctor edit' },
});
check('a doctor cannot edit a patient\'s record', renameByDoctor.status === 403);

const deleteByDoctor = await call(`/records/${recordId}`, { method: 'DELETE', token: dermaToken });
check('a doctor cannot delete a patient\'s record', deleteByDoctor.status === 403);

const deleteByStranger = await call(`/records/${recordId}`, { method: 'DELETE', token: otherPatientToken });
check('another patient cannot delete it', deleteByStranger.status === 404);

// ---- prescriptions -------------------------------------------------------
const completed = await Appointment.findOne({
  patient: patient._id, doctor: derma._id, status: 'completed',
}).lean();
check('the seed provides a completed consultation to prescribe against', !!completed);

// The seed already attaches one, so remove it to exercise creation.
await Prescription.deleteMany({ appointment: completed._id });

const byWrongDoctor = await call('/prescriptions', {
  method: 'POST', token: cardioToken,
  body: { appointmentId: String(completed._id), advice: 'rest' },
});
check('only the consulting doctor can issue the prescription', byWrongDoctor.status === 403,
  byWrongDoctor.json?.message);

const byPatient = await call('/prescriptions', {
  method: 'POST', token: patientToken,
  body: { appointmentId: String(completed._id), advice: 'give me drugs' },
});
check('a patient cannot issue themselves a prescription', byPatient.status === 403);

const empty = await call('/prescriptions', {
  method: 'POST', token: dermaToken,
  body: { appointmentId: String(completed._id) },
});
check('an entirely empty prescription is refused', empty.status === 400, empty.json?.message);

// Must belong to THIS doctor, otherwise the ownership check fires first and
// the status rule never gets exercised.
const pendingStart = new Date(Date.now() + 3 * 24 * 3600 * 1000);
const ownPending = await Appointment.create({
  patient: patient._id, doctor: derma._id,
  startsAt: pendingStart, endsAt: new Date(pendingStart.getTime() + 30 * 60000),
  status: 'pending', reason: 'phase6 status-rule test',
});
const againstPending = await call('/prescriptions', {
  method: 'POST', token: dermaToken,
  body: { appointmentId: String(ownPending._id), advice: 'rest' },
});
check('a prescription cannot be issued against the doctor\'s own unconfirmed booking',
  againstPending.status === 400 && /confirmed or completed/i.test(againstPending.json?.message ?? ''),
  `HTTP ${againstPending.status}: ${againstPending.json?.message}`);
await Appointment.deleteOne({ _id: ownPending._id });

const issued = await call('/prescriptions', {
  method: 'POST', token: dermaToken,
  body: {
    appointmentId: String(completed._id),
    diagnosis: 'Allergic contact dermatitis of both forearms.',
    medicines: [
      { name: 'Cetirizine 10mg', dosage: '1 tablet', frequency: 'Once at night', duration: '7 days',
        notes: 'May cause drowsiness.' },
      { name: 'Mometasone 0.1% cream', dosage: 'Thin layer', frequency: 'Twice daily', duration: '10 days' },
    ],
    tests: ['Patch test if the rash returns'],
    advice: 'Switch to a fragrance-free detergent and moisturise after washing.',
  },
});
check('the consulting doctor can issue a prescription', issued.status === 201, issued.json?.message);
check('the PDF is generated at issue time', !!issued.json?.prescription?.pdfPublicId);
check('the PDF has real content', (issued.json?.prescription?.pdfBytes ?? 0) > 1000,
  `${issued.json?.prescription?.pdfBytes} bytes`);
const prescriptionId = issued.json.prescription._id;

const duplicate = await call('/prescriptions', {
  method: 'POST', token: dermaToken,
  body: { appointmentId: String(completed._id), advice: 'second attempt' },
});
check('a second prescription for the same consultation is refused', duplicate.status === 409,
  duplicate.json?.message);

// ---- reading prescriptions ------------------------------------------------
const patientList = await call('/prescriptions', { token: patientToken });
check('the patient sees the prescription', patientList.json.prescriptions.length >= 1);
check('the list carries the prescribing doctor\'s specialty',
  !!patientList.json.prescriptions[0].doctorProfile?.specialty?.name,
  patientList.json.prescriptions[0].doctorProfile?.specialty?.name);

const doctorList = await call('/prescriptions', { token: dermaToken });
check('the doctor sees the ones they issued', doctorList.json.prescriptions.length >= 1);

const strangerRead = await call(`/prescriptions/${prescriptionId}`, { token: otherPatientToken });
check('an unrelated patient cannot read it', strangerRead.status === 403);

const ownerRead = await call(`/prescriptions/${prescriptionId}`, { token: patientToken });
check('the patient can read the full prescription', ownerRead.status === 200 &&
  ownerRead.json.prescription.medicines.length === 2);

// ---- the PDF itself -------------------------------------------------------
const pdf = await call(`/prescriptions/${prescriptionId}/pdf`, { token: patientToken });
check('the patient can download the PDF', pdf.status === 200);
check('the response really is a PDF',
  pdf.buffer?.subarray(0, 5).toString() === '%PDF-', pdf.buffer?.subarray(0, 8).toString());
check('the PDF is a plausible size', (pdf.buffer?.length ?? 0) > 1500, `${pdf.buffer?.length} bytes`);

const pdfAsStranger = await call(`/prescriptions/${prescriptionId}/pdf`, { token: otherPatientToken });
check('a stranger cannot download the PDF', pdfAsStranger.status === 403);

// Deleting the stored file must not lose the prescription — it is rebuilt.
await Prescription.updateOne(
  { _id: prescriptionId },
  { $set: { pdfPublicId: '', pdfLocalPath: '' } }
);
const regenerated = await call(`/prescriptions/${prescriptionId}/pdf`, { token: patientToken });
check('a missing PDF is regenerated on demand', regenerated.status === 200 &&
  regenerated.buffer?.subarray(0, 5).toString() === '%PDF-');
const after = await Prescription.findById(prescriptionId).lean();
check('and the regenerated file is stored again', !!after.pdfPublicId);

// ---- cleanup --------------------------------------------------------------
const uploaded = await MedicalRecord.find({ patient: patient._id }).lean();
for (const record of uploaded) {
  await call(`/records/${record._id}`, { method: 'DELETE', token: patientToken });
}
const leftover = await MedicalRecord.countDocuments({ patient: patient._id });
check('the owner can delete their records', leftover === 0, `${leftover} left`);

await disconnectDB();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
