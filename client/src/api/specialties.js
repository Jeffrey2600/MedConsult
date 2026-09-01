import { api, unwrap } from './client.js';

export const specialtyApi = {
  list: (params) => unwrap(api.get('/specialties', { params })),
  create: (payload) => unwrap(api.post('/specialties', payload)),
  update: (id, payload) => unwrap(api.patch(`/specialties/${id}`, payload)),
  remove: (id) => unwrap(api.delete(`/specialties/${id}`)),
};
