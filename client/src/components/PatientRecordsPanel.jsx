import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FolderHeart, FileText, Image as ImageIcon, ExternalLink, Droplet, AlertTriangle } from 'lucide-react';

import { recordApi, openStoredFile } from '../api/records.js';
import { toApiError } from '../api/client.js';
import { formatDate } from '../lib/datetime.js';

/**
 * The patient's records as seen by the consulting doctor, shown beside the
 * video call. Access is decided by the server on every request — the doctor
 * only reaches this while they have a confirmed or completed consultation.
 */
export function PatientRecordsPanel({ patientId }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');

  const { data, isPending, isError } = useQuery({
    queryKey: ['records', 'patient', patientId],
    queryFn: () => recordApi.forPatient(patientId),
    enabled: Boolean(patientId),
  });

  const open = async (record) => {
    setError('');
    try {
      const { url, external } = await recordApi.url(record._id);
      await openStoredFile(url, external);
    } catch (err) {
      setError(toApiError(err).message);
    }
  };

  const records = data?.records ?? [];
  const profile = data?.profile;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
        <FolderHeart className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {t('records.patientPanelTitle')}
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isPending && <p className="text-sm text-slate-500">{t('common.loading')}</p>}

        {isError && (
          <p className="text-sm text-slate-500">{t('records.noAccess')}</p>
        )}

        {error && (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {profile && (
          <dl className="mb-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {profile.bloodGroup && (
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Droplet className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                  {profile.bloodGroup}
                </span>
              )}
              {profile.age != null && (
                <span className="text-slate-700">{t('patients.ageValue', { count: profile.age })}</span>
              )}
              {profile.gender && <span className="text-slate-700 capitalize">{profile.gender}</span>}
            </div>

            {profile.allergies?.length > 0 && (
              <div className="flex items-start gap-1.5 rounded bg-red-50 px-2 py-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />
                <span className="text-xs text-red-700">
                  <span className="font-semibold">{t('patient.allergies')}: </span>
                  {profile.allergies.join(', ')}
                </span>
              </div>
            )}

            {profile.chronicConditions?.length > 0 && (
              <p className="text-xs text-slate-600">
                <span className="font-medium">{t('patient.conditions')}: </span>
                {profile.chronicConditions.join(', ')}
              </p>
            )}

            {profile.currentMedications?.length > 0 && (
              <p className="text-xs text-slate-600">
                <span className="font-medium">{t('records.currentMedications')}: </span>
                {profile.currentMedications.join(', ')}
              </p>
            )}
          </dl>
        )}

        {!isPending && records.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">{t('records.patientNoRecords')}</p>
        )}

        <ul className="space-y-2">
          {records.map((record) => (
            <li key={record._id}>
              <button
                type="button"
                onClick={() => open(record)}
                className="flex w-full items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
              >
                <span className="mt-0.5 text-slate-400">
                  {record.mimeType?.startsWith('image/')
                    ? <ImageIcon className="h-4 w-4" aria-hidden="true" />
                    : <FileText className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{record.title}</span>
                  <span className="block text-xs text-slate-500">
                    {t(`records.cat_${record.category}`)} · {formatDate(record.recordDate)}
                  </span>
                </span>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
