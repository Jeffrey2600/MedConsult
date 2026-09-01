import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Users, Stethoscope, ShieldAlert, CalendarDays } from 'lucide-react';

import { PageHeader } from '../../components/DashboardLayout.jsx';
import { specialtyApi } from '../../api/specialties.js';
import { qk } from '../../lib/queryClient.js';

function StatCard({ icon: Icon, label, value, tone = 'slate', to }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  };

  const content = (
    <div className="card flex items-center gap-4 p-5">
      <span className={`rounded-lg p-2.5 ${tones[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-600">{label}</p>
      </div>
    </div>
  );

  return to ? <Link to={to} className="block transition-transform hover:-translate-y-0.5">{content}</Link> : content;
}

export default function AdminOverview() {
  const { t } = useTranslation();

  // Until the admin statistics endpoint lands, the specialty list already
  // carries per-specialty doctor counts, which gives a real total to show.
  const { data } = useQuery({
    queryKey: qk.specialties,
    queryFn: () => specialtyApi.list({ includeInactive: 'true' }),
  });

  const specialties = data?.specialties ?? [];
  const approvedDoctors = specialties.reduce((sum, s) => sum + (s.doctorCount || 0), 0);

  return (
    <>
      <PageHeader title={t('admin.welcome')} subtitle={t('admin.welcomeSubtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Stethoscope} tone="brand" label={t('admin.totalDoctors')} value={approvedDoctors} to="/admin/users" />
        <StatCard icon={ShieldAlert} tone="amber" label={t('admin.pendingVerification')} value="—" to="/admin/verification" />
        <StatCard icon={Users} label={t('admin.totalPatients')} value="—" to="/admin/users" />
        <StatCard icon={CalendarDays} tone="indigo" label={t('admin.totalAppointments')} value="—" to="/admin/appointments" />
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold text-slate-900">{t('nav.specialties')}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {specialties.map((s) => (
            <span
              key={s._id}
              className={`badge ${s.isActive ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400 line-through'}`}
            >
              {s.name}
              <span className="text-slate-400">{s.doctorCount}</span>
            </span>
          ))}
        </div>
        <Link to="/admin/specialties" className="btn-secondary mt-5">
          {t('common.edit')}
        </Link>
      </section>
    </>
  );
}
