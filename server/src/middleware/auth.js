import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ROLES, VERIFICATION_STATUS } from '../utils/constants.js';

export function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Requires a valid token and an active user; attaches req.user. */
export const protect = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('No token provided');

  const payload = verifyToken(token);
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated');
  }

  req.user = user;
  next();
});

/** Attaches req.user when a token is present, but never rejects. */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (user?.isActive) req.user = user;
  } catch {
    // An invalid token on an optional route is simply treated as anonymous.
  }
  next();
});

/** Restricts a route to one or more roles. Use after `protect`. */
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`This action requires the ${roles.join(' or ')} role`)
      );
    }
    next();
  };

/**
 * For doctor-only actions that should stay locked until an admin has
 * approved the account. A pending doctor can log in and edit their profile,
 * but cannot take appointments or consult.
 */
export const requireApprovedDoctor = asyncHandler(async (req, res, next) => {
  if (!req.user || req.user.role !== ROLES.DOCTOR) {
    throw ApiError.forbidden('This action requires the doctor role');
  }
  const profile = await DoctorProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.badRequest('Complete your doctor profile first');
  if (profile.verificationStatus !== VERIFICATION_STATUS.APPROVED) {
    throw ApiError.forbidden(
      'Your account is awaiting administrator verification'
    );
  }
  req.doctorProfile = profile;
  next();
});
