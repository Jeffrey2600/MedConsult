import { Router } from 'express';
import { getOutbox, clearOutbox } from '../services/email.service.js';

/**
 * Development-only inspection of what the app would have emailed.
 *
 * This route is mounted only when the mail service is in preview mode AND the
 * server is not running in production — see routes/index.js. Rendered emails
 * contain names and appointment details, so this must never be reachable on a
 * deployed instance.
 *
 * Useful in a demonstration: it lets the actual email be shown without
 * needing a live mail account.
 */
const router = Router();

router.get('/outbox', (req, res) => {
  const messages = getOutbox()
    .slice()
    .reverse()
    .map((m, index) => ({
      index,
      to: m.to,
      subject: m.subject,
      at: m.at,
      previewUrl: m.previewUrl ?? null,
      html: m.html,
    }));

  res.json({ success: true, previewMode: true, count: messages.length, messages });
});

router.delete('/outbox', (req, res) => {
  clearOutbox();
  res.json({ success: true, message: 'Outbox cleared' });
});

export default router;
