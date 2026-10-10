import nodemailer from 'nodemailer';
import { env, features } from '../config/env.js';

let transporter = null;

/**
 * Ethereal is nodemailer's own throwaway mail service. It needs no signup:
 * credentials are generated on demand, the message is accepted and stored
 * but never delivered to the real recipient, and every send comes back with
 * a public URL showing the rendered email.
 *
 * That makes it the least painful way to demonstrate the email flow — the
 * actual message can be put on screen without owning a mail domain or
 * waiting for a provider to approve an account.
 */
export const etherealMode = env.mail.transport === 'ethereal';

/** True when messages are rendered but not delivered to the real recipient. */
export const previewMode = etherealMode || !features.email || env.mail.transport === 'preview';

/**
 * The most recent rendered messages, kept in memory when nothing is really
 * being sent. This is what lets the email templates be tested, and lets a
 * demo show exactly what would have gone out without a live mail account.
 */
const OUTBOX_LIMIT = 50;
const outbox = [];

export const getOutbox = () => [...outbox];
export const clearOutbox = () => outbox.splice(0, outbox.length);

/** Resolves once a transport is ready. Ethereal needs a network round trip. */
let transporterReady = null;

async function buildTransporter() {
  if (etherealMode) {
    try {
      const account = await nodemailer.createTestAccount();
      console.log('[mail] Ethereal test inbox created — nothing reaches real recipients');
      console.log(`[mail] Inbox login: ${account.user} / ${account.pass}`);
      console.log('[mail] View sent messages at https://ethereal.email/login');
      return nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
    } catch (err) {
      // Ethereal needs internet access to mint an account; without it, fall
      // back to rendering locally rather than failing every send.
      console.error('[mail] Could not reach Ethereal, falling back to preview:', err.message);
      return nodemailer.createTransport({ jsonTransport: true });
    }
  }

  if (previewMode) {
    // jsonTransport renders the full message and returns it instead of
    // opening a connection.
    console.log(
      features.email
        ? '[mail] MAIL_TRANSPORT=preview — messages are rendered but not sent'
        : '[mail] SMTP not configured — messages are rendered but not sent'
    );
    return nodemailer.createTransport({ jsonTransport: true });
  }

  console.log(`[mail] SMTP configured via ${env.mail.host}`);
  return nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465,
    auth: { user: env.mail.user, pass: env.mail.pass },
    // nodemailer's defaults wait up to two minutes for a connection. Some
    // hosts block outbound SMTP outright, and the SOS endpoint awaits its
    // email, so fail fast rather than leave an emergency alert spinning.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function getTransporter() {
  if (transporter) return transporter;
  if (!transporterReady) {
    transporterReady = buildTransporter().then((t) => {
      transporter = t;
      return t;
    });
  }
  return transporterReady;
}

// Warm it up at boot so the first real send is not delayed by setup.
getTransporter().catch(() => {});

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Shared shell so every message looks like it came from the same product.
 *
 * `title` and `ctaLabel` are escaped here, so callers must pass them raw —
 * escaping them again turns a name like `O'Brien` into `O&amp;#39;Brien`.
 * `body` is deliberately raw HTML, so anything user-supplied inside it must
 * be passed through `escapeHtml` by the caller.
 */
function layout({ title, body, ctaLabel, ctaUrl, accent = '#0d9488' }) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:${accent};padding:18px 24px;color:#fff;font-size:18px;font-weight:600">MedConsult</div>
    <div style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:19px">${escapeHtml(title)}</h1>
      <div style="font-size:14px;line-height:1.6;color:#334155">${body}</div>
      ${
        ctaUrl
          ? `<p style="margin:24px 0 0"><a href="${ctaUrl}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(
              ctaLabel
            )}</a></p>`
          : ''
      }
    </div>
    <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b">
      This is an automated message from MedConsult, an academic telemedicine project.
      Please do not reply to this address.
    </div>
  </div>
</body></html>`;
}

/**
 * Sends one email. Never throws — callers are notification side-effects and
 * must not fail a user's request because SMTP was slow or misconfigured.
 */
export async function sendMail({ to, subject, html, text }) {
  if (!to) return { sent: false, reason: 'no recipient' };

  try {
    const mailer = await getTransporter();
    const info = await mailer.sendMail({
      from: env.mail.from,
      to,
      subject,
      html,
      text: text || subject,
    });

    if (previewMode) {
      // Ethereal returns a public URL where the delivered message can be
      // read; jsonTransport has no such thing.
      const previewUrl = nodemailer.getTestMessageUrl(info) || null;

      outbox.push({ to, subject, html, text, at: new Date(), previewUrl });
      if (outbox.length > OUTBOX_LIMIT) outbox.shift();

      console.log(
        `[mail:preview] to=${to} subject="${subject}"` +
        (previewUrl ? `\n[mail:preview] view it at ${previewUrl}` : '')
      );

      // Reported as not delivered to the real recipient, because it was not.
      // A reason is always supplied so the UI never shows a bare
      // "could not be sent:".
      return {
        sent: false,
        previewed: true,
        previewUrl,
        reason: previewUrl
          ? 'Sent to an Ethereal test inbox rather than the real address — open the preview link to read it'
          : 'Email is in preview mode — the message was rendered but not delivered',
        messageId: info.messageId,
      };
    }

    return { sent: true, messageId: info.messageId };
  } catch (err) {
    // Callers are notification side effects — they must never fail a user's
    // request because the mail server was slow or misconfigured.
    console.error(`[mail] Failed to send "${subject}" to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

const appUrl = (path = '') => `${env.clientUrl.replace(/\/$/, '')}${path}`;

const formatWhen = (date) =>
  new Date(date).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

export function sendWelcomeEmail(user) {
  const isDoctor = user.role === 'doctor';
  return sendMail({
    to: user.email,
    subject: 'Welcome to MedConsult',
    html: layout({
      // Raw — layout() escapes the title.
      title: `Welcome, ${user.name}`,
      body: isDoctor
        ? `<p>Your doctor account has been created and is now <strong>awaiting administrator verification</strong>.</p>
           <p>You can sign in and complete your profile and availability in the meantime. Once an administrator approves your registration, your profile becomes visible to patients and you can start accepting appointments.</p>`
        : `<p>Your patient account is ready. You can now search for doctors by specialisation, book an appointment, consult over video, and keep your medical records in one place.</p>`,
      ctaLabel: 'Open MedConsult',
      ctaUrl: appUrl('/login'),
    }),
  });
}

export function sendDoctorVerificationEmail(user, approved, reason = '') {
  return sendMail({
    to: user.email,
    subject: approved
      ? 'Your MedConsult doctor account has been approved'
      : 'Update on your MedConsult doctor registration',
    html: layout({
      accent: approved ? '#0d9488' : '#b91c1c',
      title: approved ? 'Your account is verified' : 'Registration not approved',
      body: approved
        ? `<p>An administrator has verified your credentials. Your profile is now listed for patients and you can accept appointment requests.</p>
           <p>Set your weekly availability so patients can see bookable slots.</p>`
        : `<p>Your doctor registration was not approved at this time.</p>
           ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
           <p>You may update your profile details and contact the administrator to request another review.</p>`,
      ctaLabel: approved ? 'Set your availability' : 'Review your profile',
      ctaUrl: appUrl('/doctor/profile'),
    }),
  });
}

export function sendAppointmentBookedEmail(doctorUser, patientUser, appointment) {
  return sendMail({
    to: doctorUser.email,
    subject: `New appointment request — ${formatWhen(appointment.startsAt)}`,
    html: layout({
      title: 'New appointment request',
      body: `<p><strong>${escapeHtml(patientUser.name)}</strong> has requested an appointment.</p>
             <p><strong>When:</strong> ${formatWhen(appointment.startsAt)}<br/>
             <strong>Reason:</strong> ${escapeHtml(appointment.reason || 'Not specified')}</p>
             <p>Please accept or decline the request from your dashboard.</p>`,
      ctaLabel: 'Review request',
      ctaUrl: appUrl('/doctor/appointments'),
    }),
  });
}

export function sendAppointmentDecisionEmail(patientUser, doctorUser, appointment, accepted) {
  return sendMail({
    to: patientUser.email,
    subject: accepted
      ? `Appointment confirmed — ${formatWhen(appointment.startsAt)}`
      : 'Your appointment request was declined',
    html: layout({
      accent: accepted ? '#0d9488' : '#b91c1c',
      title: accepted ? 'Your appointment is confirmed' : 'Appointment declined',
      body: accepted
        ? `<p>Dr. ${escapeHtml(doctorUser.name)} has confirmed your appointment.</p>
           <p><strong>When:</strong> ${formatWhen(appointment.startsAt)}</p>
           <p>The video consultation room opens 10 minutes before the scheduled time.</p>`
        : `<p>Dr. ${escapeHtml(doctorUser.name)} is unable to take your appointment at ${formatWhen(
            appointment.startsAt
          )}.</p>
           ${
             appointment.rejectionReason
               ? `<p><strong>Reason:</strong> ${escapeHtml(appointment.rejectionReason)}</p>`
               : ''
           }
           <p>You can book another slot or choose a different doctor.</p>`,
      ctaLabel: accepted ? 'View appointment' : 'Find another slot',
      ctaUrl: appUrl('/patient/appointments'),
    }),
  });
}

export function sendAppointmentReminderEmail(user, appointment, otherPartyName) {
  return sendMail({
    to: user.email,
    subject: `Reminder: consultation at ${formatWhen(appointment.startsAt)}`,
    html: layout({
      title: 'Your consultation starts soon',
      body: `<p>Your consultation with <strong>${escapeHtml(otherPartyName)}</strong> is scheduled for <strong>${formatWhen(
        appointment.startsAt
      )}</strong>.</p>
             <p>Join from the appointment page a few minutes early and check your camera and microphone.</p>`,
      ctaLabel: 'Join consultation',
      ctaUrl: appUrl(`/consult/${appointment._id}`),
    }),
  });
}

export function sendPrescriptionEmail(patientUser, doctorUser, prescription) {
  return sendMail({
    to: patientUser.email,
    subject: 'Your prescription is ready',
    html: layout({
      title: 'Prescription issued',
      body: `<p>Dr. ${escapeHtml(doctorUser.name)} has issued a prescription following your consultation.</p>
             ${
               prescription.diagnosis
                 ? `<p><strong>Diagnosis:</strong> ${escapeHtml(prescription.diagnosis)}</p>`
                 : ''
             }
             <p>Open MedConsult to view and download the prescription PDF.</p>
             <p style="color:#64748b;font-size:12px">This prescription is generated by an academic demonstration system and is not a legally valid e-prescription.</p>`,
      ctaLabel: 'View prescription',
      ctaUrl: appUrl('/patient/prescriptions'),
    }),
  });
}

export function sendSosAlertEmail({ to, patientName, patientPhone, mapLink, when, note }) {
  return sendMail({
    to,
    subject: `EMERGENCY ALERT from ${patientName}`,
    html: layout({
      accent: '#b91c1c',
      title: `${patientName} has triggered an emergency alert`,
      body: `<p>You are listed as their emergency contact.</p>
             <p><strong>Time:</strong> ${escapeHtml(when)}<br/>
             ${patientPhone ? `<strong>Phone:</strong> ${escapeHtml(patientPhone)}<br/>` : ''}
             ${note ? `<strong>Note:</strong> ${escapeHtml(note)}<br/>` : ''}</p>
             ${
               mapLink
                 ? `<p><strong>Last known location:</strong><br/><a href="${mapLink}">${escapeHtml(mapLink)}</a></p>`
                 : '<p>No location was available — the device did not share GPS coordinates.</p>'
             }
             <p style="color:#b91c1c"><strong>If this is a medical emergency, call the ambulance service immediately.</strong></p>`,
      ctaLabel: mapLink ? 'Open location on map' : '',
      ctaUrl: mapLink,
    }),
  });
}
