import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, ShieldCheck, ShieldX, Stethoscope, Award, IdCard } from 'lucide-react';

import { PageHeader } from '../../components/DashboardLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

/** Banner shown until an administrator verifies the account. */
function VerificationBanner({ status, reason }) {
  const { t } = useTranslation();

  if (status === 'approved') {
    return (
      <div className="mb-6 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-semibold">{t('status.approved')}.</span>{' '}
          {t('doctor.welcomeSubtitle')}
        </p>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <ShieldX className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{t('auth.doctorRejectedTitle')}</p>
          {reason && <p className="mt-1">{reason}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{t('auth.doctorPendingTitle')}</p>
        <p className="mt-1">{t('auth.doctorPendingBody')}</p>
      </div>
    </div>
  );
}

export default function DoctorOverview() {
  const { t } = useTranslation();
  const { user, profile } = useAuth();

  return (
    <>
      <PageHeader
        title={t('doctor.welcome', { name: user?.name?.replace(/^Dr\.?\s*/i, '') ?? '' })}
        subtitle={t('doctor.welcomeSubtitle')}
      />

      <VerificationBanner
        status={profile?.verificationStatus}
        reason={profile?.rejectionReason}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">{t('nav.profile')}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-2.5">
              <Stethoscope className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <dt className="text-slate-500">{t('doctor.specialisation')}:</dt>
              <dd className="font-medium text-slate-900">
                {profile?.specialty?.name ?? t('common.notSpecified')}
              </dd>
            </div>
            <div className="flex items-center gap-2.5">
              <Award className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <dt className="text-slate-500">{t('doctor.experience')}:</dt>
              <dd className="font-medium text-slate-900">
                {t('doctor.yearsShort', { count: profile?.experienceYears ?? 0 })}
              </dd>
            </div>
            <div className="flex items-center gap-2.5">
              <IdCard className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <dt className="text-slate-500">{t('doctor.registration')}:</dt>
              <dd className="font-medium text-slate-900">
                {profile?.registrationNumber ?? t('common.notSpecified')}
              </dd>
            </div>
          </dl>
          <Link to="/doctor/profile" className="btn-secondary mt-5">
            {t('common.edit')}
          </Link>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">{t('nav.availability')}</h2>
          <p className="mt-3 text-sm text-slate-600">{t('doctor.noAvailabilityBody')}</p>
          <Link to="/doctor/availability" className="btn-primary mt-5">
            {t('doctor.setAvailability')}
          </Link>
        </section>
      </div>
    </>
  );
}
