import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/**
 * Leading bytes that identify each format we accept.
 *
 * The browser-supplied `mimetype` and the filename extension are both just
 * strings the client chose, so neither is evidence of anything. Checking the
 * actual file signature is what stops an executable arriving named
 * "report.pdf" with a Content-Type to match.
 */
const MAGIC_NUMBERS = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** Returns the real mime type of a buffer, or null if it is not one we allow. */
export function sniffMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  for (const { mime, bytes } of MAGIC_NUMBERS) {
    if (bytes.every((byte, index) => buffer[index] === byte)) return mime;
  }
  return null;
}

// Files are held in memory and streamed straight to storage, so nothing
// untrusted is ever written to the server's own disk under a client-chosen
// name.
const storage = multer.memoryStorage();

export const uploadSingle = (field) =>
  multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter(req, file, cb) {
      // A cheap first pass on the declared type; the real check happens
      // after the bytes have arrived.
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(
          ApiError.badRequest('Only PDF, JPEG and PNG files can be uploaded')
        );
      }
      cb(null, true);
    },
  }).single(field);

/** Translates multer's own errors into the API's error shape. */
export function handleUploadErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        ApiError.badRequest(
          `That file is too large. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`
        )
      );
    }
    return next(ApiError.badRequest(err.message));
  }
  next(err);
}
