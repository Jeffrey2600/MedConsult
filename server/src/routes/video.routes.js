import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/video.controller.js';
import { validate } from '../middleware/validate.js';
import { protect } from '../middleware/auth.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();

router.get(
  '/token/:appointmentId',
  protect,
  validate({ params: z.object({ appointmentId: objectId }) }),
  ctrl.getVideoToken
);

export default router;
