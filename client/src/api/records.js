import { api, unwrap, API_BASE, getToken } from './client.js';

export const recordApi = {
  list: (params) => unwrap(api.get('/records', { params })),
  forPatient: (patientId) => unwrap(api.get(`/records/patient/${patientId}`)),
  url: (id) => unwrap(api.get(`/records/${id}/url`)),
  update: (id, payload) => unwrap(api.patch(`/records/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/records/${id}`)),

  upload: (file, metadata, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined && value !== '') form.append(key, value);
    });

    return unwrap(
      api.post('/records', form, {
        // Let the browser set the multipart boundary itself.
        headers: { 'Content-Type': undefined },
        onUploadProgress: (event) => {
          if (onProgress && event.total) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      })
    );
  },
};

export const prescriptionApi = {
  list: (params) => unwrap(api.get('/prescriptions', { params })),
  get: (id) => unwrap(api.get(`/prescriptions/${id}`)),
  create: (payload) => unwrap(api.post('/prescriptions', payload)),
};

/**
 * Opens a stored file in a new tab.
 *
 * Cloudinary returns a signed CDN URL that can be opened directly. The local
 * fallback returns a path back into this API, which is fetched with the auth
 * header and turned into a blob URL — the signature in the query string is
 * what authorises it, but going through fetch keeps the behaviour identical
 * for the caller either way.
 */
export async function openStoredFile(url, external) {
  if (external) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const absolute = url.startsWith('http')
    ? url
    : `${API_BASE.replace(/\/api\/?$/, '')}${url}`;

  const res = await fetch(absolute, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('The file could not be opened');

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  // Give the new tab time to load before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Fetches a prescription PDF and opens it. */
export async function openPrescriptionPdf(prescriptionId) {
  const res = await fetch(`${API_BASE}/prescriptions/${prescriptionId}/pdf`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const problem = await res.json().catch(() => null);
    throw new Error(problem?.message || 'The prescription could not be opened');
  }

  // With Cloudinary the endpoint returns JSON holding a signed URL; without
  // it, the PDF bytes come straight back.
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const { url } = await res.json();
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
