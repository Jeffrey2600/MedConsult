/**
 * Asks Twilio what it actually knows, instead of guessing from error codes.
 *
 *   node tests/twilio-diagnose.mjs 919894705498
 *
 * Lists recent messages — the inbound ones reveal the real sandbox number,
 * which is the value TWILIO_WHATSAPP_FROM must match — then performs one send
 * and prints the complete response body.
 */
import axios from 'axios';
import { env } from '../src/config/env.js';

const recipient = (process.argv[2] || '').replace(/[^0-9]/g, '');
const { accountSid, authToken, from } = env.whatsapp.twilio;
const auth = { username: accountSid, password: authToken };

if (!accountSid || !authToken) {
  console.log('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set in server/.env');
  process.exit(1);
}

console.log(`\nConfigured sender : ${from}`);
console.log(`Account           : ${accountSid.slice(0, 10)}…\n`);

// ---- recent messages, both directions ------------------------------------
try {
  const res = await axios.get(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    { auth, params: { PageSize: 20 }, timeout: 20000, validateStatus: () => true }
  );

  if (res.status !== 200) {
    console.log(`Could not list messages: HTTP ${res.status}`);
    console.log(JSON.stringify(res.data).slice(0, 300));
  } else {
    const msgs = res.data.messages ?? [];
    console.log(`--- last ${msgs.length} messages on this account ---`);
    for (const m of msgs) {
      console.log(
        `  ${String(m.direction).padEnd(17)} from=${String(m.from).padEnd(22)} ` +
        `to=${String(m.to).padEnd(22)} ${m.status}${m.error_code ? ` err=${m.error_code}` : ''}`
      );
    }

    const inbound = msgs.filter((m) => String(m.direction).startsWith('inbound'));
    console.log('');
    if (inbound.length) {
      const numbers = [...new Set(inbound.map((m) => m.to))];
      console.log('--- the phone messaged these Twilio numbers ---');
      for (const n of numbers) console.log(`  ${n}`);
      console.log('\nTWILIO_WHATSAPP_FROM must be one of the above.');
      if (!numbers.includes(from)) {
        console.log(`\n  MISMATCH: currently set to ${from}`);
        console.log(`  Change it to:            ${numbers[0]}`);
      } else {
        console.log('\n  The configured sender matches. The failure is the 24-hour window.');
      }
    } else {
      console.log('No inbound messages on this account at all.');
      console.log('The join message reached a different Twilio account, or never arrived.');
    }
  }
} catch (err) {
  console.log(`Listing failed: ${err.message}`);
}

// ---- the full body for one send ------------------------------------------
if (recipient) {
  console.log('\n--- full response for one test send ---');
  const body = new URLSearchParams({
    From: from,
    To: `whatsapp:+${recipient}`,
    Body: 'MedConsult diagnostic message',
  });
  const res = await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    body.toString(),
    {
      auth,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000,
      validateStatus: () => true,
    }
  );
  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(res.data, null, 2).slice(0, 1000));
}
