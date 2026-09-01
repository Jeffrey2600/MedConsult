import { Appointment } from '../models/index.js';
import { APPOINTMENT_STATUS, NOTIFICATION_TYPES } from '../utils/constants.js';
import { sendAppointmentReminderEmail } from './email.service.js';
import { notify } from './notification.service.js';

/** How far ahead of an appointment the reminder goes out. */
export const REMINDER_LEAD_MINUTES = 60;

/** How often the sweep runs. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sends the one-hour reminder for confirmed appointments.
 *
 * `reminderSentAt` is written before the messages go out and is part of the
 * query filter, so a slow sweep overlapping the next one cannot send the same
 * reminder twice. Returns the number of appointments processed, which is what
 * makes the sweep testable without waiting for a timer.
 */
export async function sweepReminders(now = new Date()) {
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000);

  const due = await Appointment.find({
    status: APPOINTMENT_STATUS.ACCEPTED,
    reminderSentAt: null,
    startsAt: { $gt: now, $lte: windowEnd },
  })
    .populate('patient', 'name email preferredLanguage')
    .populate('doctor', 'name email preferredLanguage')
    .limit(100);

  if (!due.length) return { processed: 0, notified: 0 };

  let notified = 0;

  for (const appointment of due) {
    // Claim it first. If another sweep already did, skip rather than
    // sending a duplicate.
    const claimed = await Appointment.findOneAndUpdate(
      { _id: appointment._id, reminderSentAt: null },
      { $set: { reminderSentAt: new Date() } }
    );
    if (!claimed) continue;

    const doctorName = appointment.doctor?.name ?? 'your doctor';
    const patientName = appointment.patient?.name ?? 'your patient';

    await Promise.all([
      notify({
        user: appointment.patient._id,
        type: NOTIFICATION_TYPES.APPOINTMENT_ACCEPTED,
        title: 'Your consultation starts soon',
        body: `Your consultation with ${doctorName} begins within the hour.`,
        link: `/consult/${appointment._id}`,
      }),
      notify({
        user: appointment.doctor._id,
        type: NOTIFICATION_TYPES.APPOINTMENT_ACCEPTED,
        title: 'Consultation starting soon',
        body: `Your consultation with ${patientName} begins within the hour.`,
        link: `/consult/${appointment._id}`,
      }),
    ]);

    // Awaited, unlike the fire-and-forget sends elsewhere: this is a
    // background sweep, so nothing is waiting on it, and finishing the loop
    // should mean the work is genuinely done.
    await Promise.all([
      sendAppointmentReminderEmail(appointment.patient, appointment, doctorName).catch(
        (err) => console.error('[reminders] Patient email failed:', err.message)
      ),
      sendAppointmentReminderEmail(appointment.doctor, appointment, patientName).catch(
        (err) => console.error('[reminders] Doctor email failed:', err.message)
      ),
    ]);

    notified += 1;
  }

  if (notified) console.log(`[reminders] Sent ${notified} appointment reminder(s)`);
  return { processed: due.length, notified };
}

let timer = null;

export function startReminderScheduler() {
  if (timer) return timer;

  // A plain interval rather than a cron dependency: the sweep is idempotent
  // and the exact minute does not matter, only that it runs regularly.
  timer = setInterval(() => {
    sweepReminders().catch((err) =>
      console.error('[reminders] Sweep failed:', err.message)
    );
  }, SWEEP_INTERVAL_MS);

  // Must not hold the process open during a graceful shutdown.
  timer.unref();

  console.log(`[reminders] Scheduler started (every ${SWEEP_INTERVAL_MS / 60000} min)`);
  return timer;
}

export function stopReminderScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
