import mongoose from 'mongoose';
import { DEFAULT_SETTINGS } from '../utils/constants.js';

/** Simple key/value store for admin-editable system settings. */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const Setting = mongoose.model('Setting', settingSchema);

/** Reads all settings, falling back to defaults for any key not yet stored. */
export async function getSettings() {
  const rows = await Setting.find().lean();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function getSetting(key) {
  const row = await Setting.findOne({ key }).lean();
  return row ? row.value : DEFAULT_SETTINGS[key];
}

export async function setSettings(patch) {
  const ops = Object.entries(patch).map(([key, value]) => ({
    updateOne: {
      filter: { key },
      update: { $set: { key, value } },
      upsert: true,
    },
  }));
  if (ops.length) await Setting.bulkWrite(ops);
  return getSettings();
}
