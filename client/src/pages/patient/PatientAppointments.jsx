import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, X, CheckCircle2 } from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/DashboardLayout.jsx';
import { AppointmentCard } from '../../components/AppointmentCard.jsx';
import { SkeletonList } from '../../components/Spinner.jsx';
import { appointmentApi } from '../../api/appointments.js';
import { qk } from '../../lib/queryClient.js';
import { toApiError } from '../../api/client.js';

const SCOPES = ['upcoming', 'past', 'all'];

export default function PatientAppointments() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useState('upcoming');
  const [error, setError] = useState('');
  const justBooked = params.get('booked') === '1';

  const { data, isPending } = useQuery({
    queryKey: qk.appointments('patient', { scope }),
    queryFn: () => appointmentApi.list({ scope }),
  });

  const cancel = useMutation({
    mutationFn: ({ id, reason }) => appointmentApi.updateStatus(id, 'cancel', reason),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      // The freed slot must reappear in any open calendar.
      queryClient.invalidateQueries({ queryKey: ['slots'] });
      queryClient.invalidateQueries({ queryKey: ['slot-summary'] });
    },
    onError: (err) => setError(toApiError(err).message),
  });

  const appointments = data?.appointments ?? [];

  return (
    <>
      <PageHeader
        title={t('nav.appointments')}
        subtitle={t('appointments.patientSubtitle')}
        actions={
          <Link to="/patient/doctors" className="btn-primary">
            {t('appointments.bookNew')}
          </Link>
        }
      />

      {justBooked && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">{t('appointments.bookedTitle')}</p>
            <p className="mt-0.5">{t('appointments.bookedBody')}</p>
          </div>
          <button
            type="button"
            onClick={() => { params.delete('booked'); setParams(params, { replace: true }); }}
            className="text-emerald-700"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
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
          body={t(`appointments.empty_${scope}`)}
          action={<Link to="/patient/doctors" className="btn-primary">{t('appointments.bookNew')}</Link>}
        />
      )}

      <div className="space-y-4">
        {appointments.map((appointment) => (
          <AppointmentCard
            key={appointment._id}
            appointment={appointment}
            viewerRole="patient"
            actions={
              ['pending', 'accepted'].includes(appointment.status) && (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={cancel.isPending}
                  onClick={() => {
                    const why = window.prompt(t('appointments.cancelPrompt'));
                    // A null return means the patient dismissed the dialog.
                    if (why !== null) cancel.mutate({ id: appointment._id, reason: why });
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  {t('appointments.cancel')}
                </button>
              )
            }
          />
        ))}
      </div>
    </>
  );
}
