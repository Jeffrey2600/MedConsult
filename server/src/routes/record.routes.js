import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/record.controller.js';
import { validate } from '../middleware/validate.js';
import { protect, requireRole } from '../middleware/auth.js';
import { uploadSingle, handleUploadErrors } from '../middleware/upload.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { ROLES, RECORD_CATEGORIES } from '../utils/constants.js';
import { objectId } from '../validators/auth.validators.js';

const router = Router();

const metadata = {
  title: z.string().trim().min(1, 'Give the record a title').max(200),
  category: z.enum(RECORD_CATEGORIES).optional().default('other'),
  notes: z.string().trim().max(1000).optional().default(''),
  recordDate: z.coerce.date().optional(),
};

/**
 * Serving a locally-stored file. Declared before `protect` because the
 * expiring signature in the query string is the authorisation here — that is
 * what lets the URL be used directly in an <img> or a download link.
 */
router.get(
  '/:id/raw',
  validate({
    params: z.object({ id: objectId }),
    query: z.object({ t: z.string().min(10) }),
  }),
  ctrl.streamLocalRecord
);

router.use(protect);

router.post(
  '/',
  requireRole(ROLES.PATIENT),
  uploadLimiter,
  uploadSingle('file'),
  handleUploadErrors,
  validate({ body: z.object(metadata) }),
  ctrl.uploadRecord
);

router.get(
  '/',
  requireRole(ROLES.PATIENT),
  validate({ query: z.object({ category: z.enum(RECORD_CATEGORIES).optional() }) }),
  ctrl.listMyRecords
);

router.get(
  '/patient/:patientId',
  requireRole(ROLES.DOCTOR, ROLES.PATIENT),
  validate({ params: z.object({ patientId: objectId }) }),
  ctrl.listPatientRecords
);

router.get('/:id/url', validate({ params: z.object({ id: objectId }) }), ctrl.getRecordUrl);

router.patch(
  '/:id',
  requireRole(ROLES.PATIENT),
  validate({
    params: z.object({ id: objectId }),
    body: z.object(metadata).partial(),
  }),
  ctrl.updateRecord
);

router.delete(
  '/:id',
  requireRole(ROLES.PATIENT),
  validate({ params: z.object({ id: objectId }) }),
  ctrl.deleteRecord
);

export default router;
