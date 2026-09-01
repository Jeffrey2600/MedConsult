import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/patient.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/constants.js';

const router = Router();
router.use(protect, requireRole(ROLES.PATIENT));

const stringList = z.array(z.string().trim().min(1).max(100)).max(30);

const updateSchema = z.object({
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '']).optional(),
  heightCm: z.coerce.number().min(0).max(300).optional(),
  weightKg: z.coerce.number().min(0).max(500).optional(),
  allergies: stringList.optional(),
  chronicConditions: stringList.optional(),
  currentMedications: stringList.optional(),
  address: z.string().trim().max(300).optional(),
  emergencyContact: z
    .object({
      name: z.string().trim().max(100).optional(),
      relation: z.string().trim().max(60).optional(),
      email: z.union([z.string().trim().toLowerCase().email(), z.literal('')]).optional(),
      // International format without '+' or separators, as CallMeBot expects.
      whatsappNumber: z
        .union([z.string().trim().regex(/^[0-9]{8,15}$/, 'Use digits only, including the country code'), z.literal('')])
        .optional(),
      // Issued to the contact by CallMeBot when they opt in.
      whatsappApiKey: z
        .union([z.string().trim().regex(/^[0-9]{4,12}$/, 'The CallMeBot key is a short number'), z.literal('')])
        .optional(),
    })
    .optional(),
});

router.get('/me', ctrl.getMyPatientProfile);
router.patch('/me', validate({ body: updateSchema }), ctrl.updateMyPatientProfile);

export default router;
