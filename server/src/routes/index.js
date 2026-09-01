import { Router } from 'express';
import mongoose from 'mongoose';
import { env, features } from '../config/env.js';
import authRoutes from './auth.routes.js';
import specialtyRoutes from './specialty.routes.js';
import doctorRoutes from './doctor.routes.js';
import adminRoutes from './admin.routes.js';
import availabilityRoutes from './availability.routes.js';
import appointmentRoutes from './appointment.routes.js';
import notificationRoutes from './notification.routes.js';
import videoRoutes from './video.routes.js';
import recordRoutes from './record.routes.js';
import prescriptionRoutes from './prescription.routes.js';
import sosRoutes from './sos.routes.js';
import patientRoutes from './patient.routes.js';
import symptomRoutes from './symptom.routes.js';
import devRoutes from './dev.routes.js';
import { previewMode } from '../services/email.service.js';

const router = Router();

/**
 * Liveness probe. Also the endpoint the free-tier keep-alive cron pings
 * every 10 minutes so Render does not spin the instance down.
 */
router.get('/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    success: true,
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    database: states[mongoose.connection.readyState] ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Tells the client which optional integrations are actually configured, so
 * the UI can hide or degrade a feature instead of failing at the point of use.
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    videoProvider: features.agora && env.videoProvider === 'agora' ? 'agora' : 'jitsi',
    agoraAppId: features.agora ? env.agora.appId : '',
    features: {
      video: true,
      uploads: features.cloudinary,
      email: features.email,
      aiSymptomChecker: features.gemini,
      whatsappAlerts: features.whatsapp,
    },
    // Lets the profile screen show the right opt-in instructions.
    whatsappProvider: features.whatsappProvider,
  });
});

router.use('/auth', authRoutes);
router.use('/specialties', specialtyRoutes);
router.use('/doctors', doctorRoutes);
router.use('/availability', availabilityRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/video', videoRoutes);
router.use('/records', recordRoutes);
router.use('/prescriptions', prescriptionRoutes);
router.use('/sos', sosRoutes);
router.use('/patients', patientRoutes);
router.use('/symptoms', symptomRoutes);

// Lets a demo show the actual rendered email without a live mail account.
// Never mounted in production, and never when mail is really being sent.
if (previewMode && !env.isProd) {
  router.use('/dev', devRoutes);
  console.log('[routes] Development mail outbox available at /api/dev/outbox');
}
router.use('/admin', adminRoutes);

export default router;
