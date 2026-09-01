import { api, unwrap } from './client.js';

export const notificationApi = {
  list: (params) => unwrap(api.get('/notifications', { params })),
  unreadCount: () => unwrap(api.get('/notifications/unread-count')),
  markRead: (id) => unwrap(api.post(`/notifications/${id}/read`)),
  markAllRead: () => unwrap(api.post('/notifications/read-all')),
  messages: (appointmentId) => unwrap(api.get(`/appointments/${appointmentId}/messages`)),
};

export const videoApi = {
  token: (appointmentId) => unwrap(api.get(`/video/token/${appointmentId}`)),
};
