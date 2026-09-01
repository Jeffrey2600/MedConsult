import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '../utils/constants.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const registerPatientSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: passwordSchema,
  phone: z.string().trim().max(20).optional().default(''),
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES).optional().default('en'),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional().default(''),
});

export const registerDoctorSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: passwordSchema,
  phone: z.string().trim().max(20).optional().default(''),
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES).optional().default('en'),
  specialty: objectId,
  registrationNumber: z.string().trim().min(3, 'Registration number is required').max(60),
  qualifications: z.array(z.string().trim().max(100)).max(10).optional().default([]),
  experienceYears: z.coerce.number().int().min(0).max(70).optional().default(0),
  bio: z.string().trim().max(2000).optional().default(''),
  languages: z.array(z.enum(SUPPORTED_LANGUAGES)).min(1).optional().default(['en']),
  consultationFee: z.coerce.number().min(0).max(100000).optional().default(0),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  preferredLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
});

export { objectId };
