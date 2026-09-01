import { api, unwrap } from './client.js';

export const symptomApi = {
  check: (payload) => unwrap(api.post('/symptoms/check', payload)),
  list: () => unwrap(api.get('/symptoms')),
  get: (id) => unwrap(api.get(`/symptoms/${id}`)),
};
