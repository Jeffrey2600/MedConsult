import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

if (env.disableRateLimits) {
  console.warn('[rate-limit] DISABLED via DISABLE_RATE_LIMITS — development only');
}

const makeLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Authenticated users are limited per account; anonymous ones per IP.
    keyGenerator: (req) => (req.user ? `u:${req.user._id}` : `ip:${req.ip}`),
    // Cannot be switched off in production — see config/env.js.
    skip: () => env.disableRateLimits,
    message: { success: false, message },
  });

/** Broad safety net across the whole API. */
export const globalLimiter = makeLimiter(
  15 * 60 * 1000,
  300,
  'Too many requests. Please slow down and try again shortly.'
);

/** Login/register — the endpoints worth brute-forcing. */
export const authLimiter = makeLimiter(
  15 * 60 * 1000,
  10,
  'Too many authentication attempts. Please try again in 15 minutes.'
);

/** SOS sends real emails to a third party, so it is tightly capped. */
export const sosLimiter = makeLimiter(
  60 * 60 * 1000,
  5,
  'Emergency alert limit reached for this hour. Please call the ambulance number directly.'
);

/** Protects the shared Gemini free-tier quota from a single user. */
export const symptomLimiter = makeLimiter(
  60 * 60 * 1000,
  10,
  'Symptom checker limit reached for this hour. Please try again later.'
);

/** Uploads are bandwidth- and storage-expensive. */
export const uploadLimiter = makeLimiter(
  60 * 60 * 1000,
  30,
  'Upload limit reached for this hour.'
);
