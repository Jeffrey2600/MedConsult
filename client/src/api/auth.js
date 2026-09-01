import { api, unwrap } from './client.js';

export const authApi = {
  login: (payload) => unwrap(api.post('/auth/login', payload)),
  registerPatient: (payload) => unwrap(api.post('/auth/register/patient', payload)),
  registerDoctor: (payload) => unwrap(api.post('/auth/register/doctor', payload)),
  me: () => unwrap(api.get('/auth/me')),
  updateMe: (payload) => unwrap(api.patch('/auth/me', payload)),
  changePassword: (payload) => unwrap(api.post('/auth/change-password', payload)),
};

export const configApi = {
  get: () => unwrap(api.get('/config')),
};
