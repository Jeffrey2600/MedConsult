export const ROLES = {
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  ADMIN: 'admin',
};

export const VERIFICATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export const APPOINTMENT_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

/** Statuses that occupy a doctor's slot — used by the double-booking index. */
export const ACTIVE_APPOINTMENT_STATUSES = [
  APPOINTMENT_STATUS.PENDING,
  APPOINTMENT_STATUS.ACCEPTED,
];

/** Statuses that entitle a doctor to read the patient's medical records. */
export const RECORD_ACCESS_STATUSES = [
  APPOINTMENT_STATUS.ACCEPTED,
  APPOINTMENT_STATUS.COMPLETED,
];

export const URGENCY = {
  SELF_CARE: 'self_care',
  ROUTINE: 'routine',
  URGENT: 'urgent',
  EMERGENCY: 'emergency',
};

export const SUPPORTED_LANGUAGES = ['en', 'ta', 'hi', 'te', 'ml'];

export const LANGUAGE_NAMES = {
  en: 'English',
  ta: 'Tamil',
  hi: 'Hindi',
  te: 'Telugu',
  ml: 'Malayalam',
};

export const NOTIFICATION_TYPES = {
  APPOINTMENT_BOOKED: 'appointment_booked',
  APPOINTMENT_ACCEPTED: 'appointment_accepted',
  APPOINTMENT_REJECTED: 'appointment_rejected',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  APPOINTMENT_COMPLETED: 'appointment_completed',
  PRESCRIPTION_ISSUED: 'prescription_issued',
  DOCTOR_APPROVED: 'doctor_approved',
  DOCTOR_REJECTED: 'doctor_rejected',
  SOS_TRIGGERED: 'sos_triggered',
  MESSAGE: 'message',
};

export const RECORD_CATEGORIES = [
  'lab_report',
  'scan',
  'prescription',
  'discharge_summary',
  'vaccination',
  'other',
];

/** Default system settings, seeded on first boot and editable by the admin. */
export const DEFAULT_SETTINGS = {
  siteName: 'MedConsult',
  ambulanceNumber: '108',
  emergencyHelpline: '112',
  defaultSlotMinutes: 30,
  maxUploadMb: 5,
  hospitalSearchRadiusMeters: 5000,
  maintenanceMode: false,
};
