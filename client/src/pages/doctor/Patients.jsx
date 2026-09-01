import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Users as UsersIcon, Droplet, AlertTriangle } from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/DashboardLayout.jsx';
import { SkeletonList } from '../../components/Spinner.jsx';
import { appointmentApi } from '../../api/appointments.js';
import { formatDate, fromNow } from '../../lib/datetime.js';

export default function Patients() {
  const { t } = useTranslation();

  const { data, isPending } = useQuery({
    queryKey: ['my-patients'],
    queryFn: () => appointmentApi.myPatients(),
  });

  const patients = data?.patients ?? [];

  if (isPending) return <><PageHeader title={t('nav.patients')} /><SkeletonList rows={3} /></>;

  return (
    <>
      <PageHeader title={t('nav.patients')} subtitle={t('patients.subtitle')} />

      {patients.length === 0 && (
        <EmptyState icon={UsersIcon} title={t('patients.emptyTitle')} body={t('patients.emptyBody')} />
      )}

      <div className="space-y-4">
        {patients.map((row) => (
          <article key={row._id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">{row.user?.name}</h3>
                <p className="text-sm text-slate-600">
                  {t('patients.lastVisit')}: {formatDate(row.lastVisit)}
                  <span className="text-slate-400"> ({fromNow(row.lastVisit)})</span>
                </p>
              </div>
              <div className="flex gap-2">
                <span className="badge bg-slate-100 text-slate-700">
                  {t('patients.visits', { count: row.totalAppointments })}
                </span>
                <span className="badge bg-brand-50 text-brand-700">
                  {t('patients.completed', { count: row.completed })}
                </span>
              </div>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {row.profile?.bloodGroup && (
                <div className="flex items-center gap-2">
                  <Droplet className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                  <dt className="text-slate-500">{t('patient.bloodGroup')}:</dt>
                  <dd className="font-medium text-slate-900">{row.profile.bloodGroup}</dd>
                </div>
              )}
              {row.profile?.gender && (
                <div className="flex items-center gap-2">
                  <dt className="text-slate-500">{t('auth.gender')}:</dt>
                  <dd className="text-slate-900">{t(`auth.gender${row.profile.gender.charAt(0).toUpperCase()}${row.profile.gender.slice(1)}`)}</dd>
                </div>
              )}
              {row.profile?.allergies?.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="flex items-center gap-1.5 text-slate-500">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                    {t('patient.allergies')}:
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {row.profile.allergies.map((a) => (
                      <span key={a} className="badge bg-red-50 text-red-700">{a}</span>
                    ))}
                  </dd>
                </div>
              )}
              {row.profile?.chronicConditions?.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-slate-500">{t('patient.conditions')}:</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {row.profile.chronicConditions.map((c) => (
                      <span key={c} className="badge bg-slate-100 text-slate-700">{c}</span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
