import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/prescription.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/constants.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();
router.use(protect);

const medicineSchema = z.object({
  name: z.string().trim().min(1, 'Every medicine needs a name').max(200),
  dosage: z.string().trim().max(100).optional().default(''),
  frequency: z.string().trim().max(100).optional().default(''),
  duration: z.string().trim().max(100).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
});

router.post(
  '/',
  requireRole(ROLES.DOCTOR),
  validate({
    body: z.object({
      appointmentId: objectId,
      diagnosis: z.string().trim().max(2000).optional().default(''),
      medicines: z.array(medicineSchema).max(20).optional().default([]),
      tests: z.array(z.string().trim().max(200)).max(20).optional().default([]),
      advice: z.string().trim().max(2000).optional().default(''),
      followUpDate: z.coerce.date().optional(),
    }),
  }),
  ctrl.createPrescription
);

router.get(
  '/',
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
  }),
  ctrl.listPrescriptions
);

router.get('/:id', validate({ params: z.object({ id: objectId }) }), ctrl.getPrescription);
router.get('/:id/pdf', validate({ params: z.object({ id: objectId }) }), ctrl.getPrescriptionPdf);

export default router;
