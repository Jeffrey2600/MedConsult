import { api, unwrap } from './client.js';

export const sosApi = {
  info: () => unwrap(api.get('/sos/info')),
  trigger: (payload) => unwrap(api.post('/sos', payload)),
  history: () => unwrap(api.get('/sos')),
  resolve: (id) => unwrap(api.post(`/sos/${id}/resolve`)),
};

export const patientApi = {
  profile: () => unwrap(api.get('/patients/me')),
  updateProfile: (payload) => unwrap(api.patch('/patients/me', payload)),
};
