import { api, unwrap } from './client.js';

export const doctorApi = {
  list: (params) => unwrap(api.get('/doctors', { params })),
  get: (id) => unwrap(api.get(`/doctors/${id}`)),
  myProfile: () => unwrap(api.get('/doctors/me')),
  updateMyProfile: (payload) => unwrap(api.patch('/doctors/me', payload)),
};
