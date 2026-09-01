/**
 * Verifies real WhatsApp delivery.
 *
 *   npm run whatsapp:test 919876543210
 *
 * Sends one real message through whichever provider is configured, and
 * explains the failure in terms of what to actually do about it.
 */
import { env, features } from '../src/config/env.js';
import { sendWhatsApp } from '../src/services/whatsapp.service.js';

const recipient = process.argv[2];
const line = '-'.repeat(70);

console.log(`\n${line}\n  WhatsApp delivery check\n${line}`);
console.log(`  Provider   ${features.whatsappProvider || '(none — channel is off)'}`);

if (features.whatsappProvider === 'twilio') {
  const { accountSid, authToken, from } = env.whatsapp.twilio;
  console.log(`  Account    ${accountSid ? `${accountSid.slice(0, 8)}… (${accountSid.length} chars)` : '(not set)'}`);
  console.log(`  Auth token ${authToken ? `set, ${authToken.length} characters` : '(not set)'}`);
  console.log(`  From       ${from}`);
}
console.log(`  To         ${recipient || '(not given)'}`);
console.log(line);

if (!recipient) {
  console.log('\nFAILED  Give a recipient number, digits only with country code:');
  console.log('        npm run whatsapp:test 919876543210\n');
  process.exit(1);
}

if (!features.whatsappProvider) {
  console.log('\nFAILED  No WhatsApp provider is configured.');
  console.log('        Set WHATSAPP_PROVIDER=twilio in server/.env, along with');
  console.log('        TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.\n');
  process.exit(1);
}

if (features.whatsappProvider === 'twilio' && !env.whatsapp.twilio.accountSid.startsWith('AC')) {
  console.log('\nWARNING  A Twilio Account SID normally begins with "AC". Check you copied');
  console.log('         the Account SID and not the API Key SID.\n');
}

process.stdout.write('\nSending... ');

const result = await sendWhatsApp({
  phone: recipient,
  message:
    'MedConsult test message. If you are reading this, WhatsApp emergency alerts '
    + 'are working and will reach this number.',
});

if (result.sent) {
  console.log('OK');
  console.log(`\n${line}`);
  console.log('  SUCCESS');
  if (result.sid) console.log(`  Message SID : ${result.sid}`);
  if (result.status) console.log(`  Status      : ${result.status}`);
  console.log(`\n  Check WhatsApp on +${recipient.replace(/[^0-9]/g, '')}.`);
  console.log('  A "queued" or "accepted" status means Twilio took it; delivery');
  console.log('  follows within a few seconds.');
  console.log(line);
  process.exit(0);
}

console.log('FAILED');
console.log(`\n${line}\n  COULD NOT SEND\n${line}`);
console.log(`  ${result.reason}`);

if (features.whatsappProvider === 'twilio') {
  console.log('\n  Two causes account for almost every failure here:');
  console.log('');
  console.log('  1. The number never joined the sandbox. In the Twilio console open');
  console.log('     Messaging -> Try it out -> Send a WhatsApp message and send the');
  console.log('     "join <code>" message shown there from this phone.');
  console.log('');
  console.log('  2. The 24-hour window has closed. WhatsApp only permits free text');
  console.log('     within 24 hours of the recipient last messaging you. Send any');
  console.log('     message from that phone to the sandbox number, then retry within');
  console.log('     a minute.');
}
console.log(line);
process.exit(1);
