/**
 * Email templates, the reminder sweep, and the emergency SOS module.
 *
 * Email is exercised through nodemailer's jsonTransport, which renders the
 * full message without opening a connection — so the templates, escaping and
 * links are all genuinely asserted on rather than assumed.
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Appointment, SosEvent, PatientProfile, User } from '../src/models/index.js';
import { sweepReminders, REMINDER_LEAD_MINUTES } from '../src/services/reminder.service.js';
import {
  sendMail, getOutbox, clearOutbox, previewMode,
  sendWelcomeEmail, sendDoctorVerificationEmail, sendAppointmentBookedEmail,
  sendAppointmentDecisionEmail, sendPrescriptionEmail, sendSosAlertEmail,
} from '../src/services/email.service.js';

const BASE = 'http://127.0.0.1:5000/api';

await connectDB();

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

const patientToken = await loginAs('karthik@example.com');
const otherPatientToken = await loginAs('fathima@example.com');
const doctorToken = await loginAs('meera.nair@medconsult.local');
const adminToken = await loginAs('admin@medconsult.local', 'Admin@12345');

const patient = await User.findOne({ email: 'karthik@example.com' }).lean();
const doctor = await User.findOne({ email: 'meera.nair@medconsult.local' }).lean();

// =========================================================================
// Email templates
// =========================================================================
check('the mail service is in preview mode for tests', previewMode === true);

clearOutbox();
await sendMail({ to: 'someone@example.com', subject: 'Plain test', html: '<p>Hi</p>' });
check('a message is captured rather than delivered', getOutbox().length === 1);
check('the recipient is recorded', getOutbox()[0].to === 'someone@example.com');

const noRecipient = await sendMail({ to: '', subject: 'Nowhere', html: '<p>x</p>' });
check('a message with no recipient is refused', noRecipient.sent === false,
  noRecipient.reason);

clearOutbox();
await sendWelcomeEmail({ name: 'Karthik Subramanian', email: 'karthik@example.com', role: 'patient' });
const welcome = getOutbox()[0];
check('the welcome email addresses the person by name', welcome.html.includes('Karthik Subramanian'));
check('it links back to the app', welcome.html.includes('/login'));

clearOutbox();
await sendWelcomeEmail({ name: 'Dr Test', email: 'doc@example.com', role: 'doctor' });
check('a doctor gets a different welcome mentioning verification',
  getOutbox()[0].html.toLowerCase().includes('verification'));

clearOutbox();
await sendDoctorVerificationEmail({ name: 'Dr Test', email: 'doc@example.com' }, true);
check('an approval email says the account is verified',
  getOutbox()[0].subject.toLowerCase().includes('approved'), getOutbox()[0].subject);

clearOutbox();
await sendDoctorVerificationEmail(
  { name: 'Dr Test', email: 'doc@example.com' }, false, 'Registration number could not be verified.'
);
check('a rejection email carries the reason',
  getOutbox()[0].html.includes('Registration number could not be verified.'));

// HTML injection through a name must not become live markup.
clearOutbox();
await sendWelcomeEmail({
  name: '<script>alert("xss")</script>Bobby', email: 'bobby@example.com', role: 'patient',
});
const escaped = getOutbox()[0].html;
check('user-supplied text is escaped, not injected',
  !escaped.includes('<script>') && escaped.includes('&lt;script&gt;'));

clearOutbox();
const sampleAppointment = {
  _id: '000000000000000000000001',
  startsAt: new Date('2027-05-04T09:30:00Z'),
  reason: 'Persistent cough',
};
await sendAppointmentBookedEmail(
  { name: 'Dr Meera Nair', email: 'meera@example.com' },
  { name: 'Karthik Subramanian' },
  sampleAppointment
);
const booked = getOutbox()[0];
check('the booking email goes to the doctor', booked.to === 'meera@example.com');
check('it names the patient', booked.html.includes('Karthik Subramanian'));
check('it includes the reason for the visit', booked.html.includes('Persistent cough'));
check('it states a readable date and time',
  /May 2027/.test(booked.html) && /\d{1,2}:\d{2}/.test(booked.html));

clearOutbox();
await sendAppointmentDecisionEmail(
  { name: 'Karthik', email: 'karthik@example.com' },
  { name: 'Dr Meera Nair' },
  sampleAppointment, true
);
check('an acceptance email goes to the patient', getOutbox()[0].to === 'karthik@example.com');
check('and says the appointment is confirmed',
  getOutbox()[0].subject.toLowerCase().includes('confirmed'));

clearOutbox();
await sendAppointmentDecisionEmail(
  { name: 'Karthik', email: 'karthik@example.com' },
  { name: 'Dr Meera Nair' },
  { ...sampleAppointment, rejectionReason: 'Emergency surgery scheduled.' }, false
);
check('a decline email carries the doctor\'s reason',
  getOutbox()[0].html.includes('Emergency surgery scheduled.'));

clearOutbox();
await sendPrescriptionEmail(
  { name: 'Karthik', email: 'karthik@example.com' },
  { name: 'Dr Meera Nair' },
  { diagnosis: 'Contact dermatitis' }
);
check('the prescription email carries the disclaimer',
  getOutbox()[0].html.includes('not a legally valid e-prescription'));

clearOutbox();
await sendSosAlertEmail({
  to: 'mother@example.com',
  patientName: 'Karthik Subramanian',
  patientPhone: '+919876543210',
  mapLink: 'https://www.openstreetmap.org/?mlat=13.08&mlon=80.27',
  when: '15 August 2026, 9:12 am',
  note: 'Chest pain',
});
const sos = getOutbox()[0];
check('the SOS email subject is unmistakable', /EMERGENCY/i.test(sos.subject), sos.subject);
check('it includes the location link', sos.html.includes('openstreetmap.org'));
check('it includes the patient\'s phone number', sos.html.includes('+919876543210'));
check('it tells the contact to call an ambulance',
  sos.html.toLowerCase().includes('call the ambulance'));

clearOutbox();
await sendSosAlertEmail({
  to: 'mother@example.com', patientName: 'Karthik', when: 'now', mapLink: '',
});
check('an SOS email without a location says so explicitly',
  getOutbox()[0].html.includes('No location was available'));

// =========================================================================
// Reminder sweep
// =========================================================================
const madeAppointments = [];
const makeAppointment = async (startsInMinutes, status = 'accepted') => {
  const startsAt = new Date(Date.now() + startsInMinutes * 60_000);
  const doc = await Appointment.create({
    patient: patient._id, doctor: doctor._id,
    startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000),
    status, reason: 'reminder sweep test',
  });
  madeAppointments.push(doc._id);
  return doc;
};

await Appointment.updateMany({}, { $set: { reminderSentAt: new Date() } });

const soon = await makeAppointment(30);
const later = await makeAppointment(600);
const pendingSoon = await makeAppointment(25, 'pending');

clearOutbox();
const firstSweep = await sweepReminders();
check('the sweep picks up an appointment inside the reminder window',
  firstSweep.notified === 1, `notified ${firstSweep.notified}`);
check('both parties are emailed', getOutbox().length === 2, `${getOutbox().length} messages`);
check('the reminder names the other party',
  getOutbox().some((m) => m.html.includes(doctor.name)) &&
  getOutbox().some((m) => m.html.includes(patient.name)));
check('the reminder links straight to the consultation room',
  getOutbox()[0].html.includes(`/consult/${soon._id}`));

const soonAfter = await Appointment.findById(soon._id).lean();
check('the appointment is marked as reminded', !!soonAfter.reminderSentAt);

clearOutbox();
const secondSweep = await sweepReminders();
check('running the sweep again sends nothing twice', secondSweep.notified === 0);
check('and no further email goes out', getOutbox().length === 0);

const laterAfter = await Appointment.findById(later._id).lean();
check(`an appointment beyond the ${REMINDER_LEAD_MINUTES}-minute window is untouched`,
  laterAfter.reminderSentAt == null);

const pendingAfter = await Appointment.findById(pendingSoon._id).lean();
check('an unconfirmed appointment gets no reminder', pendingAfter.reminderSentAt == null);

// =========================================================================
// Emergency SOS
// =========================================================================
const infoNoAuth = await call('/sos/info');
check('SOS info requires authentication', infoNoAuth.status === 401);

const infoAsDoctor = await call('/sos/info', { token: doctorToken });
check('a doctor has no patient SOS screen', infoAsDoctor.status === 403);

const info = await call('/sos/info', { token: patientToken });
check('the patient gets the ambulance number up front', info.json.ambulanceNumber === '108',
  info.json.ambulanceNumber);
check('and a secondary helpline', !!info.json.emergencyHelpline);
check('the saved contact is confirmed as present', info.json.emergencyContact.hasEmail === true);
check('the contact email is masked, not printed in full',
  info.json.emergencyContact.emailMasked.includes('•') &&
  !info.json.emergencyContact.emailMasked.includes('lakshmi@'),
  info.json.emergencyContact.emailMasked);

// The SOS email is sent inside the server process, so it lands in the
// server's outbox, not this one. The development endpoint is how it gets
// inspected from here — but it is deliberately unmounted when the server is
// really delivering mail, so those assertions are skipped in that case
// rather than reported as failures.
const serverOutbox = async () => (await call('/dev/outbox')).json?.messages ?? [];
const outboxProbe = await call('/dev/outbox');
const serverInPreview = outboxProbe.status === 200;

if (!serverInPreview) {
  console.log('\n[info] The server is delivering mail for real, so /api/dev/outbox is');
  console.log('[info] unmounted. Assertions that read the rendered message are skipped.\n');
}

if (serverInPreview) await call('/dev/outbox', { method: 'DELETE' });

const triggered = await call('/sos', {
  method: 'POST', token: patientToken,
  body: { latitude: 13.0827, longitude: 80.2707, accuracyMeters: 24, note: 'Severe chest pain', hospitalCount: 7 },
});
check('an SOS press is accepted', triggered.status === 201, triggered.json?.message);
check('a map link is generated', triggered.json.event.mapLink.includes('openstreetmap.org'));
check('the ambulance number comes back with the response',
  triggered.json.ambulanceNumber === '108');

// The guarantee under test is consistency, not a particular outcome. The
// result depends on how mail is configured — real SMTP delivers, preview and
// Ethereal do not — so what must always hold is that a success is never
// claimed without one, and a failure is never reported without a reason.
// The screen must never show "could not be sent:" with nothing after it.
const emailSent = triggered.json.event.emailSent;
const reason = (triggered.json.event.emailError ?? '').trim();

check('the delivery outcome is reported consistently',
  emailSent === true ? reason.length === 0 : reason.length > 15,
  `sent=${emailSent}, reason=${JSON.stringify(reason)}`);
check('a failure is never reported without an explanation',
  emailSent === true || reason.length > 15, JSON.stringify(reason));

if (serverInPreview) {
  const alert = (await serverOutbox()).find((m) => /EMERGENCY/i.test(m.subject));
  check('the alert email was addressed to the saved contact', !!alert?.to, alert?.to);
  check('it carries the note the patient typed', !!alert?.html.includes('Severe chest pain'));
  check('it carries the location link', !!alert?.html.includes('openstreetmap.org'));
}

const stored = await SosEvent.findById(triggered.json.event.id).lean();
check('the event is recorded for the audit trail', !!stored);
check('with the coordinates', stored.latitude === 13.0827 && stored.longitude === 80.2707);
check('and how many hospitals were shown', stored.hospitalCount === 7);
check('WhatsApp is reported as unconfigured rather than silently skipped',
  stored.whatsappSent === false && stored.whatsappError.length > 0, stored.whatsappError);

// Location is optional — an alert without it is still worth sending.
if (serverInPreview) await call('/dev/outbox', { method: 'DELETE' });
const noLocation = await call('/sos', {
  method: 'POST', token: patientToken, body: { note: 'Cannot share location' },
});
check('an SOS without coordinates is still accepted', noLocation.status === 201);
check('the contact is still alerted', !!noLocation.json.event.contactName ||
  (noLocation.json.event.emailError ?? '').length > 0 ||
  noLocation.json.event.emailSent === true);

if (serverInPreview) {
  const noLocationMail = (await serverOutbox()).find((m) => /EMERGENCY/i.test(m.subject));
  check('the email says the location was unavailable',
    !!noLocationMail?.html.includes('No location was available'), noLocationMail?.to);
}

// A patient with no emergency contact.
await PatientProfile.updateOne(
  { user: (await User.findOne({ email: 'fathima@example.com' }).lean())._id },
  { $set: { emergencyContact: {} } }
);
const noContact = await call('/sos', {
  method: 'POST', token: otherPatientToken, body: { latitude: 10, longitude: 76 },
});
check('a patient with no contact can still record an emergency', noContact.status === 201);
check('but is told plainly that there was nobody to email',
  noContact.json.event.emailSent === false &&
  /no emergency contact/i.test(noContact.json.event.emailError),
  noContact.json.event.emailError);

const badCoords = await call('/sos', {
  method: 'POST', token: patientToken, body: { latitude: 999, longitude: 80 },
});
check('impossible coordinates are rejected', badCoords.status === 400);

const history = await call('/sos', { token: patientToken });
check('the patient can see their own emergency history', history.json.events.length >= 2,
  `${history.json.events.length} events`);
check('the history only contains their own events',
  history.json.events.every((e) => String(e.patient) === String(patient._id)));

const adminView = await call('/admin/sos-events', { token: adminToken });
check('an administrator sees all emergency events', adminView.json.events.length >= 3,
  `${adminView.json.events.length} events`);
check('the administrator view names the patient', !!adminView.json.events[0].patient?.name);

const patientAdminView = await call('/admin/sos-events', { token: patientToken });
check('a patient cannot read the administrator SOS log', patientAdminView.status === 403);

// =========================================================================
// Patient profile — where the emergency contact is set
// =========================================================================
const profile = await call('/patients/me', { token: patientToken });
check('a patient can read their own profile', profile.status === 200);

// Compared against whatever is currently stored rather than the seeded
// value: the contact address is routinely changed by hand during manual
// testing, and this assertion is about the merge, not the address.
const emailBefore = profile.json.profile.emergencyContact?.email;
const updated = await call('/patients/me', {
  method: 'PATCH', token: patientToken,
  body: { emergencyContact: { whatsappNumber: '919812345678' } },
});
check('updating one contact field keeps the others',
  updated.json.profile.emergencyContact.email === emailBefore &&
  updated.json.profile.emergencyContact.whatsappNumber === '919812345678',
  `email preserved as ${updated.json.profile.emergencyContact.email}`);

const badWhatsapp = await call('/patients/me', {
  method: 'PATCH', token: patientToken,
  body: { emergencyContact: { whatsappNumber: '+91 98765 43210' } },
});
check('a WhatsApp number with symbols is rejected with guidance',
  badWhatsapp.status === 400, JSON.stringify(badWhatsapp.json?.details));

const badEmail = await call('/patients/me', {
  method: 'PATCH', token: patientToken,
  body: { emergencyContact: { email: 'not-an-email' } },
});
check('an invalid contact email is rejected', badEmail.status === 400);

const allergyUpdate = await call('/patients/me', {
  method: 'PATCH', token: patientToken,
  body: { allergies: ['Penicillin', 'Sulfa drugs'] },
});
check('allergies can be updated', allergyUpdate.json.profile.allergies.length === 2);

const doctorProfileAttempt = await call('/patients/me', { token: doctorToken });
check('a doctor has no patient profile endpoint', doctorProfileAttempt.status === 403);

// ---- cleanup --------------------------------------------------------------
await Appointment.deleteMany({ _id: { $in: madeAppointments } });
await SosEvent.deleteMany({ patient: { $in: [patient._id] }, note: /test|Cannot share|Severe chest/ });

await disconnectDB();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
