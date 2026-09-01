import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, X, CheckCircle2 } from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/DashboardLayout.jsx';
import { AppointmentCard } from '../../components/AppointmentCard.jsx';
import { SkeletonList, Spinner } from '../../components/Spinner.jsx';
import { appointmentApi } from '../../api/appointments.js';
import { qk } from '../../lib/queryClient.js';
import { toApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const SCOPES = ['upcoming', 'past', 'all'];

export default function DoctorAppointments() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState('upcoming');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const { data, isPending } = useQuery({
    queryKey: qk.appointments('doctor', { scope }),
    queryFn: () => appointmentApi.list({ scope }),
  });

  const act = useMutation({
    mutationFn: ({ id, action, reason: why }) => appointmentApi.updateStatus(id, action, why),
    onSuccess: () => {
      setError('');
      setRejecting(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['slots'] });
      queryClient.invalidateQueries({ queryKey: ['slot-summary'] });
    },
    onError: (err) => setError(toApiError(err).message),
  });

  const appointments = data?.appointments ?? [];
  const isApproved = profile?.verificationStatus === 'approved';

  return (
    <>
      <PageHeader title={t('nav.appointments')} subtitle={t('appointments.doctorSubtitle')} />

      {!isApproved && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
          {t('auth.doctorPendingBody')}
        </div>
      )}

      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {SCOPES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={scope === value}
            onClick={() => setScope(value)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              scope === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(`appointments.scope_${value}`)}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isPending && <SkeletonList rows={3} />}

      {!isPending && appointments.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title={t('appointments.emptyTitle')}
          body={t('appointments.doctorEmptyBody')}
        />
      )}

      <div className="space-y-4">
        {appointments.map((appointment) => (
          <div key={appointment._id}>
            <AppointmentCard
              appointment={appointment}
              viewerRole="doctor"
              actions={
                <>
                  {appointment.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ id: appointment._id, action: 'accept' })}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {t('appointments.accept')}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => { setRejecting(appointment._id); setReason(''); }}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        {t('appointments.decline')}
                      </button>
                    </>
                  )}

                  {appointment.status === 'accepted' && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={act.isPending}
                        onClick={() => {
                          const notes = window.prompt(t('appointments.completePrompt'));
                          if (notes !== null) {
                            act.mutate({ id: appointment._id, action: 'complete', reason: notes });
                          }
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {t('appointments.markComplete')}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={act.isPending}
                        onClick={() => {
                          const why = window.prompt(t('appointments.cancelPrompt'));
                          if (why !== null) {
                            act.mutate({ id: appointment._id, action: 'cancel', reason: why });
                          }
                        }}
                      >
                        {t('appointments.cancel')}
                      </button>
                    </>
                  )}
                </>
              }
            />

            {rejecting === appointment._id && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <label className="label" htmlFor={`why-${appointment._id}`}>
                  {t('appointments.declineReasonLabel')}
                </label>
                <textarea
                  id={`why-${appointment._id}`}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="input"
                  placeholder={t('appointments.declineReasonPlaceholder')}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={!reason.trim() || act.isPending}
                    onClick={() => act.mutate({ id: appointment._id, action: 'reject', reason })}
                  >
                    {act.isPending && <Spinner className="h-4 w-4" />}
                    {t('appointments.confirmDecline')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setRejecting(null)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
