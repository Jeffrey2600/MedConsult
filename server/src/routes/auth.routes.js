import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  registerPatientSchema,
  registerDoctorSchema,
  loginSchema,
  changePasswordSchema,
  updateMeSchema,
} from '../validators/auth.validators.js';

const router = Router();

router.post(
  '/register/patient',
  authLimiter,
  validate({ body: registerPatientSchema }),
  ctrl.registerPatient
);

router.post(
  '/register/doctor',
  authLimiter,
  validate({ body: registerDoctorSchema }),
  ctrl.registerDoctor
);

router.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);

router.get('/me', protect, ctrl.getMe);
router.patch('/me', protect, validate({ body: updateMeSchema }), ctrl.updateMe);
router.post(
  '/change-password',
  protect,
  validate({ body: changePasswordSchema }),
  ctrl.changePassword
);

export default router;
