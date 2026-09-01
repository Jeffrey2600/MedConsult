import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Most screens here show data that changes on the scale of minutes,
      // not seconds, so a short stale window avoids a refetch storm while
      // still keeping dashboards current.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        // Never retry a request the server has definitively rejected.
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

/** Central place for cache keys so invalidation never guesses a string. */
export const qk = {
  config: ['config'],
  me: ['me'],
  specialties: ['specialties'],
  doctors: (filters) => ['doctors', filters],
  doctor: (id) => ['doctor', id],
  slots: (doctorId, date) => ['slots', doctorId, date],
  availability: (doctorId) => ['availability', doctorId],
  appointments: (scope, filters) => ['appointments', scope, filters],
  appointment: (id) => ['appointment', id],
  messages: (appointmentId) => ['messages', appointmentId],
  prescriptions: (scope) => ['prescriptions', scope],
  prescription: (id) => ['prescription', id],
  records: (patientId) => ['records', patientId],
  notifications: ['notifications'],
  unreadCount: ['notifications', 'unread'],
  symptomChecks: ['symptomChecks'],
  sosEvents: ['sosEvents'],
  adminStats: ['admin', 'stats'],
  adminUsers: (filters) => ['admin', 'users', filters],
  adminPendingDoctors: ['admin', 'pendingDoctors'],
  settings: ['settings'],
};
