/**
 * Decides, empirically, whether this Twilio account can send a free-form
 * WhatsApp message — and from which sender.
 *
 * The distinction that matters:
 *   +14155238886  the classic WhatsApp Sandbox. Free-form Body is allowed
 *                 inside the 24h window after the recipient sends "join <code>".
 *   anything else Twilio's newer "Tryout" sender, which demands a ContentSid
 *                 (an approved template) on every message. Template creation
 *                 needs the Content API, which trial accounts cannot use.
 *
 * Reads the error code rather than guessing:
 *   21608  sender works, recipient just has not joined  -> USABLE
 *   63016  sender works, 24h window closed              -> USABLE
 *   21654  sender demands a template                    -> DEAD ON TRIAL
 *   63007  that From is not a WhatsApp sender at all    -> NOT PROVISIONED
 *
 * Prints codes only. Never prints the auth token.
 */
import 'dotenv/config';
import axios from 'axios';

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TO = process.argv[2] || '919894705498';

const CLASSIC_SANDBOX = 'whatsapp:+14155238886';
const CONFIGURED = process.env.TWILIO_WHATSAPP_FROM;

const VERDICT = {
  21608: ['USABLE', 'Sender works. The recipient has not joined the sandbox yet.'],
  63016: ['USABLE', 'Sender works. The 24-hour free-form window is closed.'],
  63015: ['USABLE', 'Sender works, but cannot reach that particular number.'],
  21654: ['DEAD', 'Sender demands an approved template (ContentSid) on every message.'],
  63007: ['ABSENT', 'That From is not a WhatsApp sender on this account.'],
  20003: ['AUTH', 'Credentials rejected — check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN.'],
  21211: ['BAD_TO', 'The recipient number is not valid.'],
};

async function probe(label, from) {
  if (!from) {
    console.log(`\n${label}\n  (not configured — skipped)`);
    return null;
  }

  const body = new URLSearchParams({
    From: from,
    To: `whatsapp:+${String(TO).replace(/\D/g, '')}`,
    Body: 'MedConsult sender probe. If you received this, free-form sending works.',
  });

  const res = await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
    body.toString(),
    {
      auth: { username: SID, password: TOKEN },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 20000,
      validateStatus: () => true,
    }
  );

  console.log(`\n${label}\n  from   ${from}`);

  if (res.status >= 200 && res.status < 300) {
    console.log(`  HTTP   ${res.status}`);
    console.log(`  status ${res.data?.status}`);
    console.log('  ==> SENT. Free-form messaging works from this sender.');
    return 'SENT';
  }

  const code = res.data?.code;
  const [verdict, note] = VERDICT[code] ?? ['UNKNOWN', res.data?.message ?? `HTTP ${res.status}`];
  console.log(`  HTTP   ${res.status}`);
  console.log(`  code   ${code}`);
  console.log(`  ==> ${verdict}: ${note}`);
  return verdict;
}

if (!SID || !TOKEN) {
  console.error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set.');
  process.exit(1);
}

console.log(`Probing Twilio WhatsApp senders  (account ${SID.slice(0, 8)}…, to +${TO})`);

const classic = await probe('[1] Classic WhatsApp Sandbox', CLASSIC_SANDBOX);
const configured =
  CONFIGURED && CONFIGURED !== CLASSIC_SANDBOX
    ? await probe('[2] Currently configured sender', CONFIGURED)
    : null;

console.log('\n──────────────────────────────────────────────');
if (classic === 'SENT' || classic === 'USABLE') {
  console.log('The classic sandbox is available on this account.');
  console.log(`Set TWILIO_WHATSAPP_FROM=${CLASSIC_SANDBOX} and have the recipient`);
  console.log('send "join <your-code>" to +1 415 523 8886 once.');
} else if (configured === 'SENT') {
  console.log('The configured sender already sends free-form messages.');
} else {
  console.log('Neither Twilio sender can send free-form text on this account.');
  console.log('Use the Meta WhatsApp Cloud API path instead (WHATSAPP_PROVIDER=meta).');
}
