/**
 * Lists the WhatsApp content templates available on this Twilio account.
 *
 *   node tests/twilio-templates.mjs
 *
 * Newer Twilio WhatsApp senders reject freeform Body and require a ContentSid
 * on every outbound message, so knowing which templates exist — and what
 * variables they take — decides what the app can actually send.
 */
import axios from 'axios';
import { env } from '../src/config/env.js';

const { accountSid, authToken } = env.whatsapp.twilio;
const auth = { username: accountSid, password: authToken };

const res = await axios.get('https://content.twilio.com/v1/Content', {
  auth,
  params: { PageSize: 50 },
  timeout: 20000,
  validateStatus: () => true,
});

if (res.status !== 200) {
  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(res.data, null, 2).slice(0, 600));
  process.exit(1);
}

const items = res.data.contents ?? [];
console.log(`\n${items.length} content template(s) on this account\n`);

for (const c of items) {
  console.log(`  sid       : ${c.sid}`);
  console.log(`  name      : ${c.friendly_name}`);
  console.log(`  language  : ${c.language}`);
  const types = Object.keys(c.types ?? {});
  console.log(`  types     : ${types.join(', ')}`);
  for (const type of types) {
    const body = c.types[type]?.body;
    if (body) console.log(`  body      : ${String(body).replace(/\n/g, ' ').slice(0, 160)}`);
  }
  const vars = c.variables ?? {};
  const varKeys = Object.keys(vars);
  console.log(`  variables : ${varKeys.length ? varKeys.join(', ') : '(none)'}`);
  console.log('');
}

if (!items.length) {
  console.log('  No templates exist yet. One must be created before this sender');
  console.log('  can deliver anything.\n');
}
