import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Check, X, Inbox, Mail, Phone, Calendar } from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/DashboardLayout.jsx';
import { SkeletonList, Spinner } from '../../components/Spinner.jsx';
import { adminApi } from '../../api/admin.js';
import { qk } from '../../lib/queryClient.js';
import { toApiError } from '../../api/client.js';

const TABS = ['pending', 'approved', 'rejected'];

export default function Verification() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const { data, isPending } = useQuery({
    queryKey: [...qk.adminPendingDoctors, tab],
    queryFn: () => adminApi.doctorsForVerification(tab),
  });

  const verify = useMutation({
    mutationFn: ({ profileId, approve, reason: why }) =>
      adminApi.verifyDoctor(profileId, { approve, reason: why }),
    onSuccess: () => {
      // Approving changes who appears in patient search and the dashboard
      // counts, so those caches are invalidated too.
      queryClient.invalidateQueries({ queryKey: qk.adminPendingDoctors });
      queryClient.invalidateQueries({ queryKey: qk.adminStats });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: qk.specialties });
      setRejecting(null);
      setReason('');
      setError('');
    },
    onError: (err) => setError(toApiError(err).message),
  });

  const doctors = data?.doctors ?? [];

  return (
    <>
      <PageHeader title={t('nav.verification')} subtitle={t('verification.subtitle')} />

      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(`status.${value}`)}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isPending && <SkeletonList rows={2} />}

      {!isPending && doctors.length === 0 && (
        <EmptyState
          icon={Inbox}
          title={t('verification.emptyTitle')}
          body={tab === 'pending' ? t('verification.emptyPendingBody') : t('verification.emptyBody')}
        />
      )}

      <div className="space-y-4">
        {doctors.map((profile) => (
          <article key={profile._id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{profile.user?.name}</h3>
                <p className="text-sm text-brand-700">{profile.specialty?.name}</p>
              </div>
              <span
                className={`badge ${
                  profile.verificationStatus === 'approved'
                    ? 'bg-emerald-50 text-emerald-700'
                    : profile.verificationStatus === 'rejected'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-amber-50 text-amber-700'
                }`}
              >
                {t(`status.${profile.verificationStatus}`)}
              </span>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <dt className="text-slate-500">{t('auth.registrationNumber')}:</dt>
                <dd className="font-medium text-slate-900">{profile.registrationNumber}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <dd className="truncate text-slate-700">{profile.user?.email}</dd>
              </div>
              {profile.user?.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <dd className="text-slate-700">{profile.user.phone}</dd>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <dt className="text-slate-500">{t('verification.registered')}:</dt>
                <dd className="text-slate-700">
                  {new Date(profile.user?.createdAt).toLocaleDateString()}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">{t('auth.qualifications')}:</dt>
                <dd className="text-slate-900">
                  {profile.qualifications?.join(', ') || t('common.notSpecified')}
                  {' · '}
                  {t('doctor.yearsShort', { count: profile.experienceYears })}
                </dd>
              </div>
              {profile.bio && (
                <div className="sm:col-span-2">
                  <dd className="leading-relaxed text-slate-600">{profile.bio}</dd>
                </div>
              )}
              {profile.rejectionReason && (
                <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2">
                  <dt className="text-xs font-semibold text-red-800">{t('verification.rejectionReason')}</dt>
                  <dd className="text-sm text-red-700">{profile.rejectionReason}</dd>
                </div>
              )}
            </dl>

            {rejecting === profile._id ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <label className="label" htmlFor={`reason-${profile._id}`}>
                  {t('verification.reasonLabel')}
                </label>
                <textarea
                  id={`reason-${profile._id}`}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="input"
                  placeholder={t('verification.reasonPlaceholder')}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={!reason.trim() || verify.isPending}
                    onClick={() =>
                      verify.mutate({ profileId: profile._id, approve: false, reason })
                    }
                  >
                    {verify.isPending && <Spinner className="h-4 w-4" />}
                    {t('verification.confirmReject')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { setRejecting(null); setReason(''); }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.verificationStatus !== 'approved' && (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={verify.isPending}
                    onClick={() => verify.mutate({ profileId: profile._id, approve: true })}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {t('verification.approve')}
                  </button>
                )}
                {profile.verificationStatus !== 'rejected' && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => { setRejecting(profile._id); setReason(''); }}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    {t('verification.reject')}
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
