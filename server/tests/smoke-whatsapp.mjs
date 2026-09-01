/**
 * WhatsApp alert channel.
 *
 * Delivery itself cannot be asserted here — it depends on a third-party
 * relay and on a real person having joined a sandbox or opted in. What is
 * tested is everything around it: that each provider's readiness rules are
 * applied correctly, that every failure reports a specific reason rather
 * than a bare failure, and that a missing WhatsApp setup never blocks the
 * email channel or the SOS record.
 *
 * The suite adapts to whichever provider is configured, so it stays valid
 * whether the channel is off, on CallMeBot, or on Twilio.
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { PatientProfile, User } from '../src/models/index.js';
import { sendWhatsApp, contactCanReceiveWhatsApp } from '../src/services/whatsapp.service.js';
import { features } from '../src/config/env.js';

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
const patient = await User.findOne({ email: 'karthik@example.com' }).lean();

// The server decides the provider; this process must agree with it.
const serverProvider = (await call('/config')).json?.whatsappProvider ?? '';
const provider = features.whatsappProvider;

console.log(`[info] Provider in this process: '${provider || 'off'}'`);
console.log(`[info] Provider on the server  : '${serverProvider || 'off'}'\n`);

check('the server and this process agree on the provider', provider === serverProvider,
  `'${provider}' vs '${serverProvider}'`);

// ---- guards that hold for every provider ---------------------------------
const noPhone = await sendWhatsApp({ phone: '', message: 'test', apiKey: '123456' });
check('a missing number is refused with a reason',
  noPhone.sent === false && (noPhone.reason ?? '').length > 15, noPhone.reason);

const shortPhone = await sendWhatsApp({ phone: '12', message: 'test', apiKey: '123456' });
check('an implausibly short number is refused',
  shortPhone.sent === false && (shortPhone.reason ?? '').length > 15, shortPhone.reason);

check('no refusal is ever a bare failure',
  [noPhone, shortPhone].every((r) => (r.reason ?? '').length > 15));

// ---- the contact record --------------------------------------------------
const saved = await call('/patients/me', {
  method: 'PATCH', token: patientToken,
  body: { emergencyContact: { whatsappNumber: '919876543210', whatsappApiKey: '123456' } },
});
check('a WhatsApp number can be saved on the contact',
  saved.json.profile.emergencyContact.whatsappNumber === '919876543210');
check('saving WhatsApp details leaves the email address intact',
  !!saved.json.profile.emergencyContact.email,
  saved.json.profile.emergencyContact.email);

const badKey = await call('/patients/me', {
  method: 'PATCH', token: patientToken,
  body: { emergencyContact: { whatsappApiKey: 'not-a-number' } },
});
check('a malformed CallMeBot key is rejected with guidance', badKey.status === 400,
  JSON.stringify(badKey.json?.details));

// ---- readiness rules differ per provider ---------------------------------
const withKey = { whatsappNumber: '919876543210', whatsappApiKey: '123456' };
const withoutKey = { whatsappNumber: '919876543210', whatsappApiKey: '' };
const noNumber = { whatsappNumber: '', whatsappApiKey: '123456' };

check('a contact with no number is never considered reachable',
  contactCanReceiveWhatsApp(noNumber) === false);

if (provider === 'meta') {
  // Consent is the recipient sitting on the app's verified-numbers list,
  // which the server cannot observe, so a number alone is enough to try.
  check('meta: a number alone is enough', contactCanReceiveWhatsApp(withoutKey) === true);
  check('meta: a CallMeBot key is irrelevant', contactCanReceiveWhatsApp(withKey) === true);
} else if (provider === 'twilio') {
  // Consent is the sandbox join, which the server cannot observe, so a
  // number on its own is enough to attempt delivery.
  check('twilio: a number alone is enough', contactCanReceiveWhatsApp(withoutKey) === true);
  check('twilio: a CallMeBot key is irrelevant', contactCanReceiveWhatsApp(withKey) === true);
} else if (provider === 'callmebot') {
  check('callmebot: a number plus the contact key is reachable',
    contactCanReceiveWhatsApp(withKey) === true);
  check('callmebot: a number without the key is NOT reachable',
    contactCanReceiveWhatsApp(withoutKey) === false);
  const noKeyResult = await sendWhatsApp({ phone: '919876543210', message: 'x', apiKey: '' });
  check('callmebot: sending without a key explains the opt-in',
    noKeyResult.sent === false && /opt in|key/i.test(noKeyResult.reason), noKeyResult.reason);
} else {
  check('channel off: nobody is considered reachable',
    contactCanReceiveWhatsApp(withKey) === false);
  const offResult = await sendWhatsApp({ phone: '919876543210', message: 'x' });
  check('channel off: sending explains that it is switched off',
    offResult.sent === false && /switched off|WHATSAPP_PROVIDER/i.test(offResult.reason),
    offResult.reason);
}

// ---- what the SOS screen is told ----------------------------------------
// The contact in the database right now still holds whatever the readiness
// block above last saved (withKey, for every provider path), so the
// expectation is computed from that same fixture rather than a fresh one —
// comparing against the wrong contact state was a bug in this test, not in
// the app: it made a real mismatch (server vs. an unrelated fixture) look
// like a server defect.
const info = await call('/sos/info', { token: patientToken });
check('the SOS screen is told which provider is active',
  (info.json.emergencyContact.whatsappProvider ?? '') === provider,
  `'${info.json.emergencyContact.whatsappProvider}'`);
check('the SOS screen only advertises WhatsApp when it could actually work',
  info.json.emergencyContact.hasWhatsapp === contactCanReceiveWhatsApp(withKey),
  `hasWhatsapp=${info.json.emergencyContact.hasWhatsapp}, expected=${contactCanReceiveWhatsApp(withKey)}`);

// ---- the emergency flow must not depend on it ---------------------------
const triggered = await call('/sos', {
  method: 'POST', token: patientToken,
  body: { latitude: 13.08, longitude: 80.27, note: 'whatsapp channel test' },
});
check('an SOS succeeds regardless of the WhatsApp outcome', triggered.status === 201);
check('the emergency is still recorded', !!triggered.json.event.id);

// ---- the fallback that cannot fail for setup reasons ---------------------
// Whatever the provider did, the patient's own device must be able to reach
// the contact on WhatsApp. This is the guarantee that makes the feature
// dependable during a demo, so it is asserted rather than assumed.
const link = triggered.json.event.whatsappLink;
check('a one-tap WhatsApp link is always offered when a number is saved',
  typeof link === 'string' && link.startsWith('https://wa.me/'), String(link));
check('the link targets the saved contact number',
  typeof link === 'string' && link.includes('919876543210'), String(link));
check('the alert text is pre-filled and URL-encoded',
  typeof link === 'string' && /[?&]text=EMERGENCY%20ALERT/.test(link), String(link));
check('the live location travels in the pre-filled text',
  typeof link === 'string' && link.includes(encodeURIComponent('openstreetmap.org')),
  String(link));

const { whatsappDeepLink } = await import('../src/services/whatsapp.service.js');
check('a nonsense number produces no link rather than a broken one',
  whatsappDeepLink('12', 'x') === null && whatsappDeepLink(null, 'x') === null);
check('the WhatsApp outcome is reported consistently',
  triggered.json.event.whatsappSent === true
    ? true
    : (triggered.json.event.whatsappError ?? '').length > 15,
  `sent=${triggered.json.event.whatsappSent}, reason=${triggered.json.event.whatsappError}`);
check('and the email channel is unaffected by it',
  triggered.json.event.emailSent === true ||
  (triggered.json.event.emailError ?? '').length > 0,
  `emailSent=${triggered.json.event.emailSent}`);

// ---- restore ------------------------------------------------------------
await PatientProfile.updateOne(
  { user: patient._id },
  { $set: { 'emergencyContact.whatsappNumber': '919876543211', 'emergencyContact.whatsappApiKey': '' } }
);

await disconnectDB();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
