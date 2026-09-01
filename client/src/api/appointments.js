import { api, unwrap } from './client.js';

export const appointmentApi = {
  create: (payload) => unwrap(api.post('/appointments', payload)),
  list: (params) => unwrap(api.get('/appointments', { params })),
  get: (id) => unwrap(api.get(`/appointments/${id}`)),
  updateStatus: (id, action, reason = '') =>
    unwrap(api.patch(`/appointments/${id}/status`, { action, reason })),
  myPatients: () => unwrap(api.get('/appointments/my-patients')),
};

export const availabilityApi = {
  mine: () => unwrap(api.get('/availability/me')),
  createRule: (payload) => unwrap(api.post('/availability/rules', payload)),
  setAlwaysAvailable: (payload) =>
    unwrap(api.post('/availability/rules/always-available', payload)),
  updateRule: (id, payload) => unwrap(api.patch(`/availability/rules/${id}`, payload)),
  deleteRule: (id) => unwrap(api.delete(`/availability/rules/${id}`)),
  blockDate: (payload) => unwrap(api.post('/availability/blocked', payload)),
  unblockDate: (id) => unwrap(api.delete(`/availability/blocked/${id}`)),
  slots: (doctorId, date) => unwrap(api.get(`/doctors/${doctorId}/slots`, { params: { date } })),
  slotSummary: (doctorId, days = 14) =>
    unwrap(api.get(`/doctors/${doctorId}/slot-summary`, { params: { days } })),
};
