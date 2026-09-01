import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/doctor.controller.js';
import * as availabilityCtrl from '../controllers/availability.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { ROLES, SUPPORTED_LANGUAGES } from '../utils/constants.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();

const listQuery = z.object({
  specialty: objectId.optional(),
  q: z.string().trim().max(100).optional().default(''),
  language: z.enum(SUPPORTED_LANGUAGES).optional(),
  minExperience: z.coerce.number().min(0).max(70).optional(),
  maxFee: z.coerce.number().min(0).optional(),
  sort: z.enum(['rating', 'experience', 'feeAsc', 'feeDesc', 'name']).optional().default('rating'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),
});

const updateSchema = z.object({
  specialty: objectId.optional(),
  registrationNumber: z.string().trim().min(3).max(60).optional(),
  qualifications: z.array(z.string().trim().max(100)).max(10).optional(),
  experienceYears: z.coerce.number().int().min(0).max(70).optional(),
  bio: z.string().trim().max(2000).optional(),
  languages: z.array(z.enum(SUPPORTED_LANGUAGES)).min(1).optional(),
  consultationFee: z.coerce.number().min(0).max(100000).optional(),
  clinicAddress: z.string().trim().max(300).optional(),
});

// The doctor's own profile — must be declared before '/:id' so that "me"
// is not swallowed by the id parameter.
router.get('/me', protect, requireRole(ROLES.DOCTOR), ctrl.getMyDoctorProfile);
router.patch(
  '/me',
  protect,
  requireRole(ROLES.DOCTOR),
  validate({ body: updateSchema }),
  ctrl.updateMyDoctorProfile
);

router.get('/', validate({ query: listQuery }), ctrl.listDoctors);
router.get('/:id', validate({ params: z.object({ id: objectId }) }), ctrl.getDoctor);

// Bookable slots for one doctor. Public, so the patient can see availability
// on a doctor's profile before committing to an account.
router.get(
  '/:id/slots',
  validate({
    params: z.object({ id: objectId }),
    query: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD') }),
  }),
  availabilityCtrl.getDoctorSlots
);

router.get(
  '/:id/slot-summary',
  validate({
    params: z.object({ id: objectId }),
    query: z.object({ days: z.coerce.number().int().min(1).max(60).optional().default(14) }),
  }),
  availabilityCtrl.getDoctorSlotSummary
);

export default router;
