/**
 * Runs every smoke suite in order and prints a summary.
 *
 *   npm test
 *
 * The API server must already be running, and it should be started with
 * DISABLE_RATE_LIMITS=true — these suites log in far more often than a real
 * user would and would otherwise trip the auth limiter. The limiter itself
 * is covered separately by `npm run test:ratelimit`, which expects the
 * limits to be ACTIVE.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ['smoke-slots', 'Slot generation (pure functions, no server needed)'],
  ['smoke-index', 'Double-booking database guarantee'],
  ['smoke-auth', 'Registration, login, tokens, validation'],
  ['smoke-phase2', 'Doctor discovery, admin verification, settings'],
  ['smoke-phase3', 'Availability, slots, booking lifecycle'],
  ['smoke-phase45', 'Notifications, chat sockets, video tokens'],
  ['smoke-phase6', 'Uploads, record access rules, prescriptions'],
  ['smoke-pdf', 'Prescription PDF content and pagination'],
  ['smoke-phase78', 'Email templates, reminders, emergency SOS'],
  ['smoke-phase9', 'Symptom checker red flags, urgency floor, fallback'],
  ['smoke-whatsapp', 'WhatsApp channel guards and failure reporting'],
];

const run = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, `${file}.mjs`)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Forced, not inherited. Once real SMTP credentials are configured
        // the suite would otherwise send genuine email to the fictional
        // addresses in the template tests every time it runs.
        MAIL_TRANSPORT: 'preview',
      },
    });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => resolve({ code, output }));
  });

let totalPass = 0;
let totalFail = 0;
const failedSuites = [];

for (const [file, description] of SUITES) {
  const { code, output } = await run(file);
  const summary = output.match(/(\d+) passed, (\d+) failed/);
  const passed = summary ? Number(summary[1]) : 0;
  const failed = summary ? Number(summary[2]) : 0;

  totalPass += passed;
  totalFail += failed;

  const mark = code === 0 && failed === 0 ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${description.padEnd(52)} ${passed} passed, ${failed} failed`);

  if (code !== 0 || failed > 0) {
    failedSuites.push(file);
    for (const line of output.split('\n')) {
      if (line.startsWith('FAIL') || /Error|error/.test(line)) console.log(`       ${line.trim()}`);
    }
  }
}

console.log(`\n${'-'.repeat(74)}`);
console.log(`  ${totalPass} passed, ${totalFail} failed across ${SUITES.length} suites`);
if (failedSuites.length) console.log(`  Failing suites: ${failedSuites.join(', ')}`);
console.log('-'.repeat(74));

process.exit(totalFail || failedSuites.length ? 1 : 0);
