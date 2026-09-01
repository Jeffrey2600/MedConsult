import { api, unwrap } from './client.js';

export const adminApi = {
  stats: () => unwrap(api.get('/admin/stats')),
  doctorsForVerification: (status) =>
    unwrap(api.get('/admin/doctors', { params: { status } })),
  verifyDoctor: (profileId, payload) =>
    unwrap(api.post(`/admin/doctors/${profileId}/verify`, payload)),
  users: (params) => unwrap(api.get('/admin/users', { params })),
  user: (id) => unwrap(api.get(`/admin/users/${id}`)),
  setUserActive: (id, isActive) =>
    unwrap(api.patch(`/admin/users/${id}/active`, { isActive })),
  appointments: (params) => unwrap(api.get('/admin/appointments', { params })),
  sosEvents: () => unwrap(api.get('/admin/sos-events')),
  settings: () => unwrap(api.get('/admin/settings')),
  updateSettings: (payload) => unwrap(api.patch('/admin/settings', payload)),
};
