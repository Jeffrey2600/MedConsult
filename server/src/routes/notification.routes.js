import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/notification.controller.js';
import { validate } from '../middleware/validate.js';
import { protect } from '../middleware/auth.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();
router.use(protect);

router.get(
  '/',
  validate({
    query: z.object({
      unreadOnly: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
  }),
  ctrl.listNotifications
);

router.get('/unread-count', ctrl.getUnreadCount);
router.post('/read-all', ctrl.markAllRead);
router.post('/:id/read', validate({ params: z.object({ id: objectId }) }), ctrl.markRead);

export default router;
