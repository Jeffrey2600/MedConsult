import dotenv from 'dotenv';

dotenv.config();

/**
 * Central place for every environment variable the server reads.
 * Anything the app cannot start without is listed in REQUIRED and checked
 * on boot, so a missing value fails loudly at startup instead of producing
 * a confusing runtime error later.
 */
const REQUIRED = ['MONGO_URI', 'JWT_SECRET'];

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[env] Missing required variables: ${missing.join(', ')}`);
  console.error('[env] Copy .env.example to .env and fill these in.');
  process.exit(1);
}

const bool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Comma-separated list of origins allowed to call the API. On Render the
  // service's own public URL is always allowed, because the client is served
  // from that same origin and the browser still sends an Origin header.
  corsOrigins: [
    ...(process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
    process.env.RENDER_EXTERNAL_URL || '',
  ]
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),

  // Video: 'agora' uses the Agora SDK + server-minted tokens,
  // 'jitsi' swaps in a meet.jit.si iframe with no keys at all.
  videoProvider: (process.env.VIDEO_PROVIDER || 'agora').toLowerCase(),
  agora: {
    appId: process.env.AGORA_APP_ID || '',
    appCertificate: process.env.AGORA_APP_CERTIFICATE || '',
    tokenTtlSeconds: Number(process.env.AGORA_TOKEN_TTL) || 3600,
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'medconsult',
    signedUrlTtlSeconds: Number(process.env.CLOUDINARY_SIGNED_URL_TTL) || 300,
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'MedConsult <no-reply@medconsult.local>',
    // 'smtp'    — really send (requires the credentials above)
    // 'preview' — render and keep in an in-memory outbox, send nothing
    // Anything else falls back to 'preview' when SMTP is unconfigured, so
    // the app never silently appears to email people when it cannot.
    transport: (process.env.MAIL_TRANSPORT || '').toLowerCase(),
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 8000,
  },

  whatsapp: {
    // 'meta'      — WhatsApp Cloud API, Meta's own. Free, no card, and the
    //               test number reaches up to five verified recipients. This
    //               is the one that actually works on a student budget.
    // 'twilio'    — Twilio WhatsApp Sandbox. Blocked in practice on a trial
    //               account: the destination must be a verified caller ID and
    //               the newer sender demands an approved template per message.
    // 'callmebot' — free community relay (unofficial, recipient opts in and
    //               is issued their own key)
    // ''          — channel off; SOS still alerts by email and the patient's
    //               own device can still hand off to WhatsApp via a deep link
    provider: (process.env.WHATSAPP_PROVIDER || '').toLowerCase(),

    meta: {
      // Graph API version. Pinned rather than floating: Meta ships breaking
      // changes between versions and a demo should not move under you.
      apiVersion: process.env.META_WHATSAPP_API_VERSION || 'v23.0',
      phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
      accessToken: process.env.META_WHATSAPP_TOKEN || '',
      // A business-initiated message (which an SOS alert always is — the
      // contact has not messaged us) may only be a pre-approved template.
      // Leave the name empty to send plain text, which only succeeds inside
      // an open 24-hour service window.
      templateName: process.env.META_WHATSAPP_TEMPLATE || '',
      templateLanguage: process.env.META_WHATSAPP_TEMPLATE_LANG || 'en',
    },

    // CallMeBot. The key here is only a fallback for a single-contact demo —
    // normally each emergency contact stores their own.
    callmebotEnabled: bool(process.env.CALLMEBOT_ENABLED, false),
    apiKey: process.env.CALLMEBOT_API_KEY || '',

    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      // The shared sandbox sender. A paid number replaces this later.
      from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
    },
  },

  clientUrl: process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',

  // Per-window caps. Demo accounts are shared by everyone at a showcase, so
  // a deployment can raise these without a code change.
  limits: {
    apiPer15Min: Number(process.env.API_REQUESTS_PER_15MIN) || 300,
    authPer15Min: Number(process.env.AUTH_ATTEMPTS_PER_15MIN) || 10,
    symptomChecksPerHour: Number(process.env.SYMPTOM_CHECKS_PER_HOUR) || 10,
  },
  isProd: (process.env.NODE_ENV || 'development') === 'production',

  // Escape hatch for automated tests, which log in far more often than a
  // real user. Ignored in production so the limits can never be turned off
  // on a deployed instance by an environment mistake.
  disableRateLimits:
    bool(process.env.DISABLE_RATE_LIMITS, false) &&
    (process.env.NODE_ENV || 'development') !== 'production',
};

/**
 * Feature flags derived from which credentials are actually present.
 * Every optional integration degrades to a no-op instead of crashing, so
 * the app still runs end-to-end with only MONGO_URI and JWT_SECRET set.
 */
export const features = {
  agora: Boolean(env.agora.appId && env.agora.appCertificate),
  // Only the switch matters here: the CallMeBot key belongs to each
  // emergency contact, not to the server, so its absence must not disable
  // the channel for everyone.
  cloudinary: Boolean(
    env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret
  ),
  email: Boolean(env.mail.host && env.mail.user && env.mail.pass),
  gemini: Boolean(env.gemini.apiKey),

  /**
   * Which WhatsApp provider is actually usable, or '' for none.
   *
   * Twilio needs its own credentials. CallMeBot needs only the switch,
   * because the key belongs to each emergency contact rather than to the
   * server, so its absence must not disable the channel for everyone.
   */
  whatsappProvider: (() => {
    const { provider, twilio, meta, callmebotEnabled } = env.whatsapp;
    if (provider === 'meta') {
      return meta.phoneNumberId && meta.accessToken ? 'meta' : '';
    }
    if (provider === 'twilio') {
      return twilio.accountSid && twilio.authToken ? 'twilio' : '';
    }
    // No explicit provider falls back to CallMeBot for older configurations.
    if (provider === 'callmebot' || !provider) {
      return callmebotEnabled ? 'callmebot' : '';
    }
    return '';
  })(),
};

features.whatsapp = Boolean(features.whatsappProvider);

const TRYCLOUDFLARE_ORIGIN = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

/**
 * Shared by the REST CORS middleware and the Socket.io server. A quick
 * Cloudflare Tunnel gets a random *.trycloudflare.com subdomain every time
 * it starts, purely to demo the local dev server from another device —
 * mirrors the allowedHosts entry in client/vite.config.js for the same
 * purpose. Never relaxed in production, where CORS_ORIGINS is authoritative.
 */
export function isOriginAllowed(origin) {
  if (!origin) return true;
  if (env.corsOrigins.includes(origin)) return true;
  return !env.isProd && TRYCLOUDFLARE_ORIGIN.test(origin);
}
