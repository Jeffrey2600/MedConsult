import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Pill, FlaskConical, CalendarClock } from 'lucide-react';

import { PageHeader, EmptyState } from '../components/DashboardLayout.jsx';
import { SkeletonList, Spinner } from '../components/Spinner.jsx';
import { prescriptionApi, openPrescriptionPdf } from '../api/records.js';
import { qk } from '../lib/queryClient.js';
import { formatDate } from '../lib/datetime.js';

/**
 * Shared by both roles — a patient sees the prescriptions issued to them, a
 * doctor sees the ones they issued. The server scopes the query by role, so
 * the same component serves both without a flag.
 */
export default function PrescriptionList({ viewerRole }) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState('');

  const { data, isPending } = useQuery({
    queryKey: qk.prescriptions(viewerRole),
    queryFn: () => prescriptionApi.list(),
  });

  const download = async (id) => {
    setDownloading(id);
    setError('');
    try {
      await openPrescriptionPdf(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(null);
    }
  };

  const prescriptions = data?.prescriptions ?? [];

  return (
    <>
      <PageHeader
        title={t('nav.prescriptions')}
        subtitle={t(viewerRole === 'doctor' ? 'prescriptions.doctorSubtitle' : 'prescriptions.patientSubtitle')}
      />

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isPending && <SkeletonList rows={2} />}

      {!isPending && prescriptions.length === 0 && (
        <EmptyState
          icon={FileText}
          title={t('prescriptions.emptyTitle')}
          body={t(viewerRole === 'doctor' ? 'prescriptions.doctorEmptyBody' : 'prescriptions.patientEmptyBody')}
        />
      )}

      <div className="space-y-4">
        {prescriptions.map((p) => (
          <article key={p._id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {viewerRole === 'doctor' ? p.patient?.name : p.doctor?.name}
                </h3>
                {viewerRole !== 'doctor' && p.doctorProfile?.specialty?.name && (
                  <p className="text-sm text-brand-700">{p.doctorProfile.specialty.name}</p>
                )}
                <p className="mt-0.5 text-sm text-slate-500">
                  {t('prescriptions.issued')} {formatDate(p.issuedAt)}
                </p>
              </div>

              <button
                type="button"
                className="btn-secondary"
                disabled={downloading === p._id}
                onClick={() => download(p._id)}
              >
                {downloading === p._id
                  ? <Spinner className="h-4 w-4" />
                  : <Download className="h-4 w-4" aria-hidden="true" />}
                {t('prescriptions.downloadPdf')}
              </button>
            </div>

            {p.diagnosis && (
              <p className="mt-3.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-medium text-slate-500">{t('prescriptions.diagnosis')}: </span>
                {p.diagnosis}
              </p>
            )}

            {p.medicines?.length > 0 && (
              <div className="mt-4">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Pill className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('prescriptions.medicines')}
                </h4>
                <ul className="mt-2 space-y-2">
                  {p.medicines.map((m, index) => (
                    <li key={index} className="rounded-lg border border-slate-200 px-3 py-2">
                      <p className="text-sm font-medium text-slate-900">{m.name}</p>
                      <p className="text-xs text-slate-600">
                        {[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}
                      </p>
                      {m.notes && <p className="mt-0.5 text-xs text-slate-500">{m.notes}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {p.tests?.length > 0 && (
              <div className="mt-4">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('prescriptions.tests')}
                </h4>
                <ul className="mt-1.5 list-inside list-disc text-sm text-slate-700">
                  {p.tests.map((test) => <li key={test}>{test}</li>)}
                </ul>
              </div>
            )}

            {p.advice && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('prescriptions.advice')}
                </h4>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{p.advice}</p>
              </div>
            )}

            {p.followUpDate && (
              <p className="mt-4 flex items-center gap-1.5 text-sm text-slate-600">
                <CalendarClock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                {t('prescriptions.followUp')}: {formatDate(p.followUpDate)}
              </p>
            )}

            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
              {t('prescriptions.disclaimer')}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
