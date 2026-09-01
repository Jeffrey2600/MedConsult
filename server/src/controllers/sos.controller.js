import { SosEvent, PatientProfile, getSettings } from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { NOTIFICATION_TYPES, ROLES } from '../utils/constants.js';
import { sendSosAlertEmail } from '../services/email.service.js';
import {
  sendWhatsApp,
  contactCanReceiveWhatsApp,
  whatsappProvider,
  whatsappDeepLink,
} from '../services/whatsapp.service.js';
import { notifyAdmins } from '../services/notification.service.js';
import { emitToRole } from '../sockets/index.js';

/** A plain OpenStreetMap link — no API key, no billing account, just a URL. */
const mapLinkFor = (lat, lng) =>
  lat != null && lng != null
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
    : '';

/**
 * Everything the SOS screen needs before the button is even pressed, so the
 * ambulance number and the emergency contact are on screen instantly rather
 * than after a round trip.
 */
export const getSosInfo = asyncHandler(async (req, res) => {
  const [settings, profile] = await Promise.all([
    getSettings(),
    PatientProfile.findOne({ user: req.user._id }).lean(),
  ]);

  const contact = profile?.emergencyContact ?? {};

  res.json({
    success: true,
    ambulanceNumber: settings.ambulanceNumber,
    emergencyHelpline: settings.emergencyHelpline,
    searchRadiusMeters: settings.hospitalSearchRadiusMeters,
    emergencyContact: {
      name: contact.name || '',
      relation: contact.relation || '',
      // Enough to confirm the right person is on file, without printing a
      // full address on a screen that may be shown to a bystander.
      hasEmail: Boolean(contact.email),
      // What "ready" means depends on the provider: Twilio's consent is the
      // sandbox join, which we cannot see, whereas CallMeBot issues a key we
      // can check for. The screen must not promise a message it cannot send.
      hasWhatsapp: contactCanReceiveWhatsApp(contact),
      whatsappNeedsOptIn: Boolean(
        contact.whatsappNumber && !contactCanReceiveWhatsApp(contact)
      ),
      whatsappProvider: whatsappProvider(),
      emailMasked: contact.email ? maskEmail(contact.email) : '',
    },
  });
});

const maskEmail = (email) => {
  const [name, domain] = email.split('@');
  if (!domain) return '';
  const head = name.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(2, name.length - 2))}@${domain}`;
};

/**
 * Records an emergency and alerts the patient's contact.
 *
 * The event is saved before any notification is attempted, so an SOS press is
 * never lost because an email server was unreachable. Delivery outcomes are
 * written back onto the event and returned, so the patient can see on screen
 * whether their contact was actually reached rather than assuming they were.
 */
export const triggerSos = asyncHandler(async (req, res) => {
  const { latitude, longitude, accuracyMeters, note = '', hospitalCount = 0 } = req.body;

  const profile = await PatientProfile.findOne({ user: req.user._id }).lean();
  const contact = profile?.emergencyContact ?? {};
  const mapLink = mapLinkFor(latitude, longitude);

  const event = await SosEvent.create({
    patient: req.user._id,
    latitude,
    longitude,
    accuracyMeters,
    mapLink,
    note,
    hospitalCount,
    contactEmail: contact.email || '',
  });

  const when = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  const alertText =
    `EMERGENCY ALERT from ${req.user.name}. Time: ${when}.` +
    (mapLink ? ` Location: ${mapLink}` : ' Location unavailable.') +
    (note ? ` Note: ${note}` : '');

  // Both channels are attempted; neither failing stops the other.
  const [emailResult, whatsappResult] = await Promise.all([
    contact.email
      ? sendSosAlertEmail({
          to: contact.email,
          patientName: req.user.name,
          patientPhone: req.user.phone,
          mapLink,
          when,
          note,
        })
      : Promise.resolve({ sent: false, reason: 'No emergency contact email saved' }),

    contact.whatsappNumber
      ? sendWhatsApp({
          phone: contact.whatsappNumber,
          apiKey: contact.whatsappApiKey,
          message: alertText,
          // Positional {{1}}..{{4}} for the approved template. Kept as
          // separate fields rather than one blob so the contact sees a
          // properly laid out alert rather than a run-on sentence.
          templateParams: [
            req.user.name,
            when,
            mapLink || 'Location unavailable',
            note || 'No additional details',
          ],
        })
      : Promise.resolve({ sent: false, reason: 'No WhatsApp number saved' }),
  ]);

  event.emailSent = Boolean(emailResult?.sent);
  event.emailError = emailResult?.sent ? '' : (emailResult?.reason ?? '');
  event.whatsappSent = Boolean(whatsappResult?.sent);
  event.whatsappError = whatsappResult?.sent ? '' : (whatsappResult?.reason ?? '');
  await event.save();

  // Surface it on the administrator's dashboard for the demonstration.
  notifyAdmins({
    type: NOTIFICATION_TYPES.SOS_TRIGGERED,
    title: 'Emergency alert triggered',
    body: `${req.user.name} pressed the emergency button.`,
    link: '/admin/sos',
  }).catch(() => {});

  emitToRole(ROLES.ADMIN, 'sos:triggered', {
    id: String(event._id),
    patientName: req.user.name,
    mapLink,
    at: event.createdAt,
  });

  const settings = await getSettings();

  res.status(201).json({
    success: true,
    event: {
      id: event._id,
      mapLink,
      createdAt: event.createdAt,
      emailSent: event.emailSent,
      emailError: event.emailError,
      // Present only when a test inbox was used, so the demo can open the
      // real rendered message instead of taking the outcome on trust.
      emailPreviewUrl: emailResult?.previewUrl ?? null,
      whatsappSent: event.whatsappSent,
      whatsappError: event.whatsappError,
      // Always present when a number is saved, whatever the provider did.
      // If the automated send failed — no credentials, expired token, closed
      // window — the patient can still reach the contact on WhatsApp in one
      // tap from their own device, which is the outcome that actually matters
      // while an emergency is happening.
      whatsappLink: contact.whatsappNumber
        ? whatsappDeepLink(contact.whatsappNumber, alertText)
        : null,
      contactName: contact.name || '',
    },
    ambulanceNumber: settings.ambulanceNumber,
  });
});

/** The patient's own audit trail of emergency presses. */
export const listMySosEvents = asyncHandler(async (req, res) => {
  const events = await SosEvent.find({ patient: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ success: true, events });
});

export const resolveSosEvent = asyncHandler(async (req, res) => {
  const event = await SosEvent.findById(req.params.id);
  if (!event) throw ApiError.notFound('Emergency event not found');

  const isOwner = String(event.patient) === String(req.user._id);
  if (!isOwner && req.user.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('This is not your emergency event');
  }

  event.resolvedAt = new Date();
  await event.save();

  res.json({ success: true, event: event.toJSON() });
});
