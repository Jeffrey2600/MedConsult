import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Siren, MapPin, Mail, MessageCircle, ShieldOff } from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/DashboardLayout.jsx';
import { SkeletonList } from '../../components/Spinner.jsx';
import { adminApi } from '../../api/admin.js';
import { qk } from '../../lib/queryClient.js';
import { formatDateTime, fromNow } from '../../lib/datetime.js';
import { useSocketEvent } from '../../hooks/useSocket.js';

export default function SosEvents() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: qk.sosEvents,
    queryFn: () => adminApi.sosEvents(),
  });

  // An emergency should appear without anyone pressing refresh.
  useSocketEvent('sos:triggered', () => {
    queryClient.invalidateQueries({ queryKey: qk.sosEvents });
  });

  const events = data?.events ?? [];

  return (
    <>
      <PageHeader title={t('adminSos.title')} subtitle={t('adminSos.subtitle')} />

      {isPending && <SkeletonList rows={3} />}

      {!isPending && events.length === 0 && (
        <EmptyState icon={ShieldOff} title={t('adminSos.emptyTitle')} body={t('adminSos.emptyBody')} />
      )}

      <div className="space-y-3">
        {events.map((event) => (
          <article key={event._id} className="card border-l-4 border-l-red-500 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-red-50 p-2 text-red-600">
                  <Siren className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">{event.patient?.name}</h3>
                  <p className="text-sm text-slate-500">
                    {formatDateTime(event.createdAt)} · {fromNow(event.createdAt)}
                  </p>
                  {event.patient?.phone && (
                    <p className="text-sm text-slate-600">{event.patient.phone}</p>
                  )}
                </div>
              </div>

              {event.resolvedAt && (
                <span className="badge bg-emerald-50 text-emerald-700">{t('adminSos.resolved')}</span>
              )}
            </div>

            {event.note && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{event.note}</p>
            )}

            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <dd className={event.emailSent ? 'text-emerald-700' : 'text-amber-700'}>
                  {event.emailSent ? t('adminSos.emailSent') : t('adminSos.emailFailed')}
                </dd>
              </div>
              {(event.whatsappSent || event.whatsappError) && (
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  <dd className={event.whatsappSent ? 'text-emerald-700' : 'text-slate-500'}>
                    {event.whatsappSent ? t('adminSos.whatsappSent') : t('adminSos.whatsappFailed')}
                  </dd>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <dd className="text-slate-600">
                  {event.mapLink ? (
                    <a href={event.mapLink} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                      {event.latitude?.toFixed(4)}, {event.longitude?.toFixed(4)}
                    </a>
                  ) : (
                    t('adminSos.noLocation')
                  )}
                </dd>
              </div>
              <div className="text-slate-500">
                {t('adminSos.hospitalsShown', { count: event.hospitalCount ?? 0 })}
              </div>
            </dl>

            {event.emailError && (
              <p className="mt-2 text-xs text-amber-700">{event.emailError}</p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
