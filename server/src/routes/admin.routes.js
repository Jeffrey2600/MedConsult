import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/admin.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import {
  ROLES,
  VERIFICATION_STATUS,
  APPOINTMENT_STATUS,
} from '../utils/constants.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();

// Every route in this file is administrator-only.
router.use(protect, requireRole(ROLES.ADMIN));

const idParam = z.object({ id: objectId });

const boolFromQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

router.get('/stats', ctrl.getStats);

router.get(
  '/doctors',
  validate({
    query: z.object({
      status: z.enum(Object.values(VERIFICATION_STATUS)).optional().default('pending'),
    }),
  }),
  ctrl.listDoctorsForVerification
);

router.post(
  '/doctors/:id/verify',
  validate({
    params: idParam,
    body: z.object({
      approve: z.boolean(),
      reason: z.string().trim().max(500).optional().default(''),
    }),
  }),
  ctrl.verifyDoctor
);

router.get(
  '/users',
  validate({
    query: z.object({
      role: z.enum(Object.values(ROLES)).optional(),
      q: z.string().trim().max(100).optional().default(''),
      isActive: boolFromQuery,
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
  }),
  ctrl.listUsers
);

router.get('/users/:id', validate({ params: idParam }), ctrl.getUser);

router.patch(
  '/users/:id/active',
  validate({ params: idParam, body: z.object({ isActive: z.boolean() }) }),
  ctrl.setUserActive
);

router.get(
  '/appointments',
  validate({
    query: z.object({
      status: z.enum(Object.values(APPOINTMENT_STATUS)).optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
  }),
  ctrl.listAllAppointments
);

router.get('/sos-events', ctrl.listSosEvents);

router.get('/settings', ctrl.getSystemSettings);
router.patch(
  '/settings',
  validate({
    body: z.object({
      siteName: z.string().trim().min(1).max(60).optional(),
      ambulanceNumber: z.string().trim().min(2).max(20).optional(),
      emergencyHelpline: z.string().trim().min(2).max(20).optional(),
      defaultSlotMinutes: z.coerce.number().int().min(5).max(240).optional(),
      maxUploadMb: z.coerce.number().int().min(1).max(25).optional(),
      hospitalSearchRadiusMeters: z.coerce.number().int().min(500).max(50000).optional(),
      maintenanceMode: z.boolean().optional(),
    }),
  }),
  ctrl.updateSystemSettings
);

export default router;
