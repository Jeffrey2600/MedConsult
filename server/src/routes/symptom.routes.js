import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/symptom.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { symptomLimiter } from '../middleware/rateLimit.js';
import { ROLES, SUPPORTED_LANGUAGES } from '../utils/constants.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();
router.use(protect, requireRole(ROLES.PATIENT));

router.post(
  '/check',
  // Protects the shared free-tier Gemini quota from a single account.
  symptomLimiter,
  validate({
    body: z.object({
      text: z
        .string()
        .trim()
        .min(10, 'Describe your symptoms in a little more detail')
        .max(2000),
      ageYears: z.coerce.number().int().min(0).max(120).optional(),
      gender: z.enum(['male', 'female', 'other', '']).optional().default(''),
      durationDays: z.coerce.number().int().min(0).max(3650).optional(),
      language: z.enum(SUPPORTED_LANGUAGES).optional().default('en'),
    }),
  }),
  ctrl.checkSymptoms
);

router.get('/', ctrl.listMyChecks);
router.get('/:id', validate({ params: z.object({ id: objectId }) }), ctrl.getCheck);

export default router;
