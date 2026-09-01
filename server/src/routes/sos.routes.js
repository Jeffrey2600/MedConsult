import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/sos.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { sosLimiter } from '../middleware/rateLimit.js';
import { ROLES } from '../utils/constants.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();
router.use(protect);

router.get('/info', requireRole(ROLES.PATIENT), ctrl.getSosInfo);

router.post(
  '/',
  requireRole(ROLES.PATIENT),
  // Each press emails a third party, so this is capped tightly.
  sosLimiter,
  validate({
    body: z.object({
      // Location is optional: an alert with no coordinates is still far
      // better than no alert at all if the device refuses geolocation.
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      accuracyMeters: z.coerce.number().min(0).max(100000).optional(),
      note: z.string().trim().max(500).optional().default(''),
      hospitalCount: z.coerce.number().int().min(0).max(500).optional().default(0),
    }),
  }),
  ctrl.triggerSos
);

router.get('/', requireRole(ROLES.PATIENT), ctrl.listMySosEvents);

router.post(
  '/:id/resolve',
  validate({ params: z.object({ id: objectId }) }),
  ctrl.resolveSosEvent
);

export default router;
