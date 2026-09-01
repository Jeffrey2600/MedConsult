import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, SUPPORTED_LANGUAGES } from '../utils/constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
      index: true,
    },
    phone: { type: String, trim: true, default: '' },
    avatarUrl: { type: String, default: '' },
    preferredLanguage: {
      type: String,
      enum: SUPPORTED_LANGUAGES,
      default: 'en',
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

/** Hash on save so callers can just assign a plaintext `password` virtual. */
userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    phone: this.phone,
    avatarUrl: this.avatarUrl,
    preferredLanguage: this.preferredLanguage,
    isActive: this.isActive,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
