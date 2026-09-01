import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/specialty.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { ROLES } from '../utils/constants.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();

const listQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  description: z.string().trim().max(500).optional().default(''),
  icon: z.string().trim().max(40).optional().default('stethoscope'),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(40).optional(),
  isActive: z.boolean().optional(),
});

const idParam = z.object({ id: objectId });

// Public — needed by the doctor registration form and patient browse screen.
router.get('/', validate({ query: listQuery }), ctrl.listSpecialties);

router.post(
  '/',
  protect,
  requireRole(ROLES.ADMIN),
  validate({ body: createSchema }),
  ctrl.createSpecialty
);

router.patch(
  '/:id',
  protect,
  requireRole(ROLES.ADMIN),
  validate({ params: idParam, body: updateSchema }),
  ctrl.updateSpecialty
);

router.delete(
  '/:id',
  protect,
  requireRole(ROLES.ADMIN),
  validate({ params: idParam }),
  ctrl.deleteSpecialty
);

export default router;
