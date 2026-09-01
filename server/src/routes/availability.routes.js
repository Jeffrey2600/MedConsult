import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/availability.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/constants.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();

// Everything here is the signed-in doctor managing their own schedule.
router.use(protect, requireRole(ROLES.DOCTOR));

const ruleShape = {
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startMinute: z.coerce.number().int().min(0).max(1439),
  endMinute: z.coerce.number().int().min(1).max(1440),
  slotMinutes: z.coerce.number().int().min(5).max(240).optional().default(30),
  timezone: z.string().trim().max(64).optional().default('Asia/Kolkata'),
};

/**
 * Shape checks that need more than one field. The model enforces these too,
 * but catching them here turns what would surface as a 500 from a Mongoose
 * hook into a 400 with a message pointing at the offending field.
 */
const withRangeChecks = (schema) =>
  schema
    .refine((v) => v.endMinute === undefined || v.startMinute === undefined || v.endMinute > v.startMinute, {
      message: 'The end time must be after the start time',
      path: ['endMinute'],
    })
    .refine(
      (v) =>
        v.endMinute === undefined ||
        v.startMinute === undefined ||
        (v.endMinute - v.startMinute) % (v.slotMinutes ?? 30) === 0,
      {
        message: 'The window length must be an exact multiple of the slot duration',
        path: ['slotMinutes'],
      }
    );

const ruleBody = withRangeChecks(z.object(ruleShape));

router.get('/me', ctrl.getMyAvailability);

router.post('/rules', validate({ body: ruleBody }), ctrl.createRule);

// Declared before '/rules/:id' would ever be considered, so 'always-available'
// can never be read as an id.
router.post(
  '/rules/always-available',
  validate({
    body: z.object({
      slotMinutes: z.coerce.number().int().min(5).max(240).optional().default(30),
      timezone: z.string().trim().max(64).optional().default('Asia/Kolkata'),
    }),
  }),
  ctrl.setAlwaysAvailable
);

router.patch(
  '/rules/:id',
  validate({
    params: z.object({ id: objectId }),
    body: withRangeChecks(
      z.object(ruleShape).partial().extend({ isActive: z.boolean().optional() })
    ),
  }),
  ctrl.updateRule
);

router.delete(
  '/rules/:id',
  validate({ params: z.object({ id: objectId }) }),
  ctrl.deleteRule
);

router.post(
  '/blocked',
  validate({
    body: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
      reason: z.string().trim().max(200).optional().default(''),
    }),
  }),
  ctrl.blockDate
);

router.delete(
  '/blocked/:id',
  validate({ params: z.object({ id: objectId }) }),
  ctrl.unblockDate
);

export default router;
