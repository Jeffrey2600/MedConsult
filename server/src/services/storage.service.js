import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import { env, features } from '../config/env.js';

const LOCAL_DIR = path.resolve(process.cwd(), 'uploads');

if (features.cloudinary) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
  console.log(`[storage] Cloudinary configured (${env.cloudinary.cloudName})`);
} else {
  console.log('[storage] Cloudinary not configured — files are stored on local disk');
}

export const usingCloudinary = () => features.cloudinary;

/**
 * An unguessable id. Medical documents must never sit behind a URL anyone
 * could arrive at by incrementing a number or guessing a patient's name.
 */
const randomId = () => crypto.randomBytes(24).toString('hex');

/**
 * Stores a file and returns a reference, never a public URL.
 *
 * Cloudinary uploads use `type: 'authenticated'`, which means the asset is
 * not reachable at all without a signature, even by someone holding the
 * exact public id. Delivery URLs are minted per request in `signedUrl`
 * below, after the caller's permission has been checked.
 */
export async function uploadBuffer({ buffer, folder, mimeType, originalName }) {
  const publicId = `${folder}/${randomId()}`;

  if (!features.cloudinary) {
    // Local fallback keeps development working without a Cloudinary account.
    // The extension is derived from the sniffed mime type, never from the
    // user-supplied filename.
    const ext = extensionFor(mimeType);
    const filePath = path.join(LOCAL_DIR, `${publicId}${ext}`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    return {
      publicId,
      resourceType: 'local',
      format: ext.replace('.', ''),
      bytes: buffer.length,
      localPath: path.relative(process.cwd(), filePath),
    };
  }

  // Images keep resource_type 'image' so Cloudinary can transform them;
  // PDFs go up as 'raw' so they are served back byte-for-byte.
  const resourceType = mimeType === 'application/pdf' ? 'raw' : 'image';

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: env.cloudinary.folder,
        resource_type: resourceType,
        type: 'authenticated',
        // Filenames can carry a patient's name; keep them out of the asset id.
        use_filename: false,
        unique_filename: false,
        overwrite: false,
        context: originalName ? { original: path.basename(originalName) } : undefined,
      },
      (error, uploaded) => (error ? reject(error) : resolve(uploaded))
    );
    stream.end(buffer);
  });

  return {
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format ?? '',
    bytes: result.bytes ?? buffer.length,
    localPath: '',
  };
}

/**
 * Mints a short-lived delivery URL for a stored file. Only ever called after
 * the caller has been authorised, so the URL is the last step, not the gate.
 */
export function signedUrl({ publicId, resourceType = 'raw' }) {
  const ttl = env.cloudinary.signedUrlTtlSeconds;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  if (!features.cloudinary) {
    // The local equivalent: a self-signed, expiring token that our own
    // /raw route validates. Same guarantee, no third party.
    return { url: null, token: signLocalToken(publicId, expiresAt), expiresAt };
  }

  const url = cloudinary.url(publicId, {
    resource_type: resourceType === 'local' ? 'raw' : resourceType,
    type: 'authenticated',
    sign_url: true,
    secure: true,
    expires_at: Math.floor(expiresAt.getTime() / 1000),
  });

  return { url, token: null, expiresAt };
}

export async function destroyFile({ publicId, resourceType = 'raw', localPath }) {
  if (!features.cloudinary) {
    if (localPath) await fs.unlink(path.resolve(process.cwd(), localPath)).catch(() => {});
    return;
  }
  await cloudinary.uploader
    .destroy(publicId, { resource_type: resourceType, type: 'authenticated' })
    .catch((err) => console.error('[storage] Could not delete asset:', err.message));
}

export async function readLocalFile(localPath) {
  return fs.readFile(path.resolve(process.cwd(), localPath));
}

/** HMAC over the id and expiry, so a local link cannot be forged or extended. */
function signLocalToken(publicId, expiresAt) {
  const expiry = Math.floor(expiresAt.getTime() / 1000);
  const signature = crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`${publicId}:${expiry}`)
    .digest('hex');
  return `${expiry}.${signature}`;
}

export function verifyLocalToken(publicId, token) {
  if (!token || !token.includes('.')) return false;
  const [expiryRaw, signature] = token.split('.');
  const expiry = Number(expiryRaw);

  if (!Number.isFinite(expiry) || expiry * 1000 < Date.now()) return false;

  const expected = crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`${publicId}:${expiry}`)
    .digest('hex');

  // Constant-time compare so the signature cannot be guessed byte by byte.
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const extensionFor = (mimeType) =>
  ({
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
  })[mimeType] ?? '.bin';
