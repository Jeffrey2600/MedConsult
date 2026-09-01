import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/appointment.controller.js';
import { listMessages } from '../controllers/notification.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { ROLES, APPOINTMENT_STATUS } from '../utils/constants.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();
router.use(protect);

const idParam = z.object({ id: objectId });

router.post(
  '/',
  requireRole(ROLES.PATIENT),
  validate({
    body: z.object({
      doctorId: objectId,
      startsAt: z.coerce.date(),
      reason: z.string().trim().max(1000).optional().default(''),
      symptomCheckId: objectId.optional(),
    }),
  }),
  ctrl.createAppointment
);

router.get(
  '/',
  validate({
    query: z.object({
      scope: z.enum(['all', 'upcoming', 'past']).optional().default('all'),
      status: z.enum(Object.values(APPOINTMENT_STATUS)).optional(),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }),
  }),
  ctrl.listAppointments
);

router.get('/my-patients', requireRole(ROLES.DOCTOR), ctrl.listMyPatients);

router.get('/:id', validate({ params: idParam }), ctrl.getAppointment);

// Chat history — messages arrive live over the socket, this is what makes
// them survive a page refresh.
router.get(
  '/:appointmentId/messages',
  validate({ params: z.object({ appointmentId: objectId }) }),
  listMessages
);

router.patch(
  '/:id/status',
  validate({
    params: idParam,
    body: z.object({
      action: z.enum(['accept', 'reject', 'cancel', 'complete']),
      reason: z.string().trim().max(1000).optional().default(''),
    }),
  }),
  ctrl.updateAppointmentStatus
);

export default router;
