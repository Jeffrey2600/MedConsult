/**
 * Verifies real email delivery.
 *
 *   npm run mail:test you@example.com
 *
 * Checks the SMTP settings in .env, opens a connection, and sends one real
 * message. Prints a specific diagnosis for the failures that actually happen
 * rather than dumping a raw driver error.
 */
import nodemailer from 'nodemailer';
import { env, features } from '../src/config/env.js';

const recipient = process.argv[2] || env.mail.user;

const line = '-'.repeat(70);
console.log(`\n${line}\n  Email delivery check\n${line}`);
console.log(`  Host      ${env.mail.host || '(not set)'}`);
console.log(`  Port      ${env.mail.port}`);
console.log(`  User      ${env.mail.user || '(not set)'}`);
console.log(`  Password  ${env.mail.pass ? `set, ${env.mail.pass.length} characters` : '(not set)'}`);
console.log(`  From      ${env.mail.from}`);
console.log(`  Transport ${env.mail.transport || '(blank — real sending)'}`);
console.log(`  To        ${recipient}`);
console.log(line);

if (!features.email) {
  console.log('\nFAILED  SMTP is not fully configured.');
  console.log('        SMTP_HOST, SMTP_USER and SMTP_PASS must all be set in server/.env');
  process.exit(1);
}

if (env.mail.transport) {
  console.log(`\nNOTE    MAIL_TRANSPORT is "${env.mail.transport}", so the app itself will NOT`);
  console.log('        deliver to real addresses. Clear it to send for real.');
  console.log('        This script tests the SMTP credentials regardless.\n');
}

// Note: Gmail accepts an app password whether or not the display spaces are
// left in, so their presence is not worth warning about up front. It is only
// mentioned below if authentication actually fails.

const transporter = nodemailer.createTransport({
  host: env.mail.host,
  port: env.mail.port,
  secure: env.mail.port === 465,
  auth: { user: env.mail.user, pass: env.mail.pass },
});

function diagnose(err) {
  const text = `${err.code ?? ''} ${err.responseCode ?? ''} ${err.message ?? ''}`;

  if (/EAUTH|535|Username and Password not accepted/i.test(text)) {
    return [
      'The mail server rejected the username or password.',
      '',
      'For Gmail this almost always means one of:',
      '  1. You used your normal Google password instead of an App Password.',
      '  2. 2-Step Verification is not enabled, so App Passwords do not exist yet.',
      '  3. Something was mistyped — try regenerating the App Password.',
      '',
      '(Gmail accepts the 16 characters with or without the spaces it shows',
      ' them in, so that is not the cause.)',
      '',
      'Create one at: https://myaccount.google.com/apppasswords',
    ];
  }
  if (/ETIMEDOUT|ECONNREFUSED|ESOCKET|ECONNECTION/i.test(text)) {
    return [
      'Could not reach the mail server.',
      '',
      'Usually a firewall, antivirus or campus network blocking outbound port 587.',
      'Try a mobile hotspot, or port 465 with SMTP_PORT=465.',
    ];
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(text)) {
    return ['The mail server hostname could not be resolved. Check SMTP_HOST for typos.'];
  }
  if (/550|553|relay/i.test(text)) {
    return [
      'The server refused the sender address.',
      'MAIL_FROM must match the account in SMTP_USER.',
    ];
  }
  return [err.message];
}

try {
  process.stdout.write('\nConnecting and authenticating... ');
  await transporter.verify();
  console.log('OK');

  process.stdout.write('Sending the test message...     ');
  const info = await transporter.sendMail({
    from: env.mail.from,
    to: recipient,
    subject: 'MedConsult — email delivery is working',
    text:
      'This is a test message from MedConsult.\n\n'
      + 'If you are reading this, real email delivery is configured correctly and '
      + 'appointment notifications and emergency SOS alerts will now reach real inboxes.',
    html:
      '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px">'
      + '<div style="background:#0d9488;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">'
      + '<strong style="font-size:17px">MedConsult</strong></div>'
      + '<div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 10px 10px">'
      + '<h2 style="margin:0 0 10px;font-size:17px">Email delivery is working</h2>'
      + '<p style="color:#334155;line-height:1.6;margin:0">If you are reading this, real email '
      + 'delivery is configured correctly. Appointment notifications and emergency SOS alerts '
      + 'will now reach real inboxes.</p></div></div>',
  });
  console.log('OK');

  console.log(`\n${line}`);
  console.log('  SUCCESS');
  console.log(`  Message id : ${info.messageId}`);
  console.log(`  Accepted   : ${(info.accepted ?? []).join(', ') || 'none'}`);
  if ((info.rejected ?? []).length) console.log(`  Rejected   : ${info.rejected.join(', ')}`);
  console.log(`\n  Check the inbox for ${recipient} (look in spam too — a brand new`);
  console.log('  sender is often filtered the first time).');
  console.log(line);
  process.exit(0);
} catch (err) {
  console.log('FAILED');
  console.log(`\n${line}\n  COULD NOT SEND\n${line}`);
  for (const l of diagnose(err)) console.log(`  ${l}`);
  console.log(`\n  Raw error: ${err.code ?? ''} ${err.responseCode ?? ''} ${err.message}`);
  console.log(line);
  process.exit(1);
}
