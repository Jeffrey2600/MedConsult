/**
 * Sends a real WhatsApp message through Meta's Cloud API and reports exactly
 * what happened.
 *
 * Usage:  npm run whatsapp:meta -- 919894705498
 *
 * Checks configuration before spending a call, then tries the template path
 * if META_WHATSAPP_TEMPLATE is set, and plain text otherwise. Every failure is
 * reported with Meta's own error code so the fix is obvious rather than
 * guessed at.
 *
 * Never prints the access token.
 */
import 'dotenv/config';
import { env, features } from '../src/config/env.js';
import { sendWhatsApp, whatsappDeepLink } from '../src/services/whatsapp.service.js';

const to = (process.argv[2] || '').replace(/\D/g, '');

const line = (s = '') => console.log(s);
const ok = (s) => console.log(`  \x1b[32mok\x1b[0m    ${s}`);
const bad = (s) => console.log(`  \x1b[31mFAIL\x1b[0m  ${s}`);
const info = (s) => console.log(`  ·     ${s}`);

line('\nMeta WhatsApp Cloud API — live send test');
line('────────────────────────────────────────');

/* ---------------------------------------------------------- configuration */

const { apiVersion, phoneNumberId, accessToken, templateName, templateLanguage } =
  env.whatsapp.meta;

let fatal = false;

if (env.whatsapp.provider !== 'meta') {
  bad(`WHATSAPP_PROVIDER is "${env.whatsapp.provider || '(unset)'}" — set it to "meta"`);
  fatal = true;
} else {
  ok('WHATSAPP_PROVIDER=meta');
}

if (!phoneNumberId) {
  bad('META_WHATSAPP_PHONE_NUMBER_ID is not set (Meta dashboard → WhatsApp → API Setup)');
  fatal = true;
} else {
  ok(`Phone number id ${phoneNumberId}`);
}

if (!accessToken) {
  bad('META_WHATSAPP_TOKEN is not set');
  fatal = true;
} else {
  ok(`Access token present (${accessToken.length} chars, not shown)`);
}

if (!to || to.length < 8) {
  bad('Pass the recipient number with a country code, digits only.');
  info('e.g.  npm run whatsapp:meta -- 919894705498');
  fatal = true;
} else {
  ok(`Recipient +${to}`);
}

info(`Graph API ${apiVersion}`);

if (templateName) {
  ok(`Template "${templateName}" (${templateLanguage}) — business-initiated send`);
} else {
  info('No META_WHATSAPP_TEMPLATE set — sending plain text.');
  info('That only works if the recipient messaged the test number in the last 24h.');
}

if (!features.whatsappProvider) {
  bad('The provider resolved to "off" — credentials are incomplete.');
  fatal = true;
}

if (fatal) {
  line('\nFix the items above and run again.\n');
  process.exit(1);
}

/* -------------------------------------------------------------- live send */

line('\nSending…');

const when = new Date().toLocaleString('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

const mapLink = 'https://www.openstreetmap.org/?mlat=13.0827&mlon=80.2707';
const params = ['MedConsult Test', when, mapLink, 'This is a test, not a real emergency'];

const result = await sendWhatsApp({
  phone: to,
  message:
    `MedConsult test alert. Time: ${when}. Location: ${mapLink}. `
    + 'This is a test, not a real emergency.',
  templateParams: params,
});

line();
if (result.sent) {
  ok(`SENT as ${result.mode ?? 'message'}`);
  if (result.id) info(`Message id ${result.id}`);
  line('\nCheck the recipient handset. If nothing arrives within a minute:');
  line('  · confirm the number is on the app\'s verified recipient list (max 5)');
  line('  · confirm the template is APPROVED, not "In review"');
} else {
  bad(result.reason);
}

/* ------------------------------------------------------ zero-setup fallback */

line('\nDeep-link fallback (always works, no credentials needed):');
line(`  ${whatsappDeepLink(to, `MedConsult test alert. ${when}. ${mapLink}`)}`);
line();

process.exit(result.sent ? 0 : 1);
