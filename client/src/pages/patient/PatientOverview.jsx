import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Bot, Siren, CalendarDays, Droplet, AlertTriangle } from 'lucide-react';

import { PageHeader } from '../../components/DashboardLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const QUICK_ACTIONS = [
  { to: '/patient/doctors', icon: Search, labelKey: 'nav.findDoctors', tone: 'brand' },
  { to: '/patient/symptom-checker', icon: Bot, labelKey: 'nav.symptomChecker', tone: 'indigo' },
  { to: '/patient/appointments', icon: CalendarDays, labelKey: 'nav.appointments', tone: 'slate' },
  { to: '/patient/emergency', icon: Siren, labelKey: 'nav.emergency', tone: 'red' },
];

const TONE = {
  brand: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  indigo: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  slate: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  red: 'bg-red-50 text-red-700 hover:bg-red-100',
};

export default function PatientOverview() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();

  const hasEmergencyContact = Boolean(profile?.emergencyContact?.email);

  return (
    <>
      <PageHeader
        title={t('patient.welcome', { name: user?.name?.split(' ')[0] ?? '' })}
        subtitle={t('patient.welcomeSubtitle')}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_ACTIONS.map(({ to, icon: Icon, labelKey, tone }) => (
          <Link
            key={to}
            to={to}
            className={`flex items-center gap-3 rounded-xl px-4 py-4 text-sm font-semibold transition-colors ${TONE[tone]}`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {t(labelKey)}
          </Link>
        ))}
      </div>

      {!hasEmergencyContact && (
        <div className="mt-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('patient.noEmergencyContactTitle')}</p>
            <p className="mt-1">{t('patient.noEmergencyContactBody')}</p>
            <Link to="/patient/profile" className="mt-2 inline-block font-semibold underline">
              {t('patient.addEmergencyContact')}
            </Link>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">{t('patient.healthSummary')}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">{t('patient.bloodGroup')}</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-semibold text-slate-900">
                <Droplet className="h-4 w-4 text-red-500" aria-hidden="true" />
                {profile?.bloodGroup || t('common.notSpecified')}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('patient.age')}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {profile?.age ?? t('common.notSpecified')}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">{t('patient.allergies')}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {profile?.allergies?.length ? (
                  profile.allergies.map((a) => (
                    <span key={a} className="badge bg-red-50 text-red-700">{a}</span>
                  ))
                ) : (
                  <span className="text-slate-500">{t('common.none')}</span>
                )}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">{t('patient.conditions')}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {profile?.chronicConditions?.length ? (
                  profile.chronicConditions.map((c) => (
                    <span key={c} className="badge bg-slate-100 text-slate-700">{c}</span>
                  ))
                ) : (
                  <span className="text-slate-500">{t('common.none')}</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">{t('patient.upcoming')}</h2>
          <p className="mt-4 text-sm text-slate-500">{t('common.comingSoonBody')}</p>
        </section>
      </div>
    </>
  );
}
