import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, CheckCircle2, FileSignature } from 'lucide-react';

import { prescriptionApi } from '../api/records.js';
import { toApiError } from '../api/client.js';
import { Spinner } from './Spinner.jsx';

const emptyMedicine = () => ({ name: '', dosage: '', frequency: '', duration: '', notes: '' });

/** Doctor-side prescription form, used from inside the consultation room. */
export function PrescriptionForm({ appointmentId, existing, onIssued }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [diagnosis, setDiagnosis] = useState('');
  const [medicines, setMedicines] = useState([emptyMedicine()]);
  const [tests, setTests] = useState('');
  const [advice, setAdvice] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [error, setError] = useState('');

  const issue = useMutation({
    mutationFn: () =>
      prescriptionApi.create({
        appointmentId,
        diagnosis,
        // Blank rows are scaffolding, not data — drop them before sending.
        medicines: medicines.filter((m) => m.name.trim()),
        tests: tests.split('\n').map((s) => s.trim()).filter(Boolean),
        advice,
        ...(followUpDate ? { followUpDate } : {}),
      }),
    onSuccess: (data) => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      onIssued?.(data.prescription);
    },
    onError: (err) => setError(toApiError(err).message),
  });

  if (existing) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" aria-hidden="true" />
        <h3 className="mt-3 font-semibold text-slate-900">{t('prescriptions.alreadyIssuedTitle')}</h3>
        <p className="mt-1.5 text-sm text-slate-600">{t('prescriptions.alreadyIssuedBody')}</p>
      </div>
    );
  }

  const updateMedicine = (index, field, value) => {
    setMedicines((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const hasContent =
    medicines.some((m) => m.name.trim()) || advice.trim() || tests.trim();

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); issue.mutate(); }}
      className="flex h-full min-h-0 flex-col"
    >
      <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
        <FileSignature className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {t('prescriptions.formTitle')}
      </h2>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="label" htmlFor="diagnosis">{t('prescriptions.diagnosis')}</label>
          <textarea
            id="diagnosis"
            rows={2}
            className="input"
            maxLength={2000}
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder={t('prescriptions.diagnosisPlaceholder')}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">{t('prescriptions.medicines')}</span>
            <button
              type="button"
              onClick={() => setMedicines((prev) => [...prev, emptyMedicine()])}
              className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {t('prescriptions.addMedicine')}
            </button>
          </div>

          <div className="space-y-3">
            {medicines.map((med, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3">
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder={t('prescriptions.medicineName')}
                    maxLength={200}
                    value={med.name}
                    onChange={(e) => updateMedicine(index, 'name', e.target.value)}
                    aria-label={t('prescriptions.medicineName')}
                  />
                  {medicines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMedicines((prev) => prev.filter((_, i) => i !== index))}
                      className="shrink-0 px-2 text-red-600 hover:text-red-700"
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input
                    className="input text-xs" placeholder={t('prescriptions.dosage')} maxLength={100}
                    value={med.dosage} onChange={(e) => updateMedicine(index, 'dosage', e.target.value)}
                    aria-label={t('prescriptions.dosage')}
                  />
                  <input
                    className="input text-xs" placeholder={t('prescriptions.frequency')} maxLength={100}
                    value={med.frequency} onChange={(e) => updateMedicine(index, 'frequency', e.target.value)}
                    aria-label={t('prescriptions.frequency')}
                  />
                  <input
                    className="input text-xs" placeholder={t('prescriptions.duration')} maxLength={100}
                    value={med.duration} onChange={(e) => updateMedicine(index, 'duration', e.target.value)}
                    aria-label={t('prescriptions.duration')}
                  />
                </div>

                <input
                  className="input mt-2 text-xs" placeholder={t('prescriptions.medicineNotes')} maxLength={300}
                  value={med.notes} onChange={(e) => updateMedicine(index, 'notes', e.target.value)}
                  aria-label={t('prescriptions.medicineNotes')}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="tests">{t('prescriptions.tests')}</label>
          <textarea
            id="tests"
            rows={2}
            className="input"
            value={tests}
            onChange={(e) => setTests(e.target.value)}
            placeholder={t('prescriptions.testsPlaceholder')}
          />
        </div>

        <div>
          <label className="label" htmlFor="advice">{t('prescriptions.advice')}</label>
          <textarea
            id="advice"
            rows={3}
            className="input"
            maxLength={2000}
            value={advice}
            onChange={(e) => setAdvice(e.target.value)}
            placeholder={t('prescriptions.advicePlaceholder')}
          />
        </div>

        <div>
          <label className="label" htmlFor="followUp">
            {t('prescriptions.followUp')} <span className="font-normal text-slate-400">({t('common.optional')})</span>
          </label>
          <input
            id="followUp"
            type="date"
            className="input"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
          />
        </div>

        <p className="text-xs text-slate-400">{t('prescriptions.disclaimer')}</p>
      </div>

      <div className="border-t border-slate-100 p-3">
        <button type="submit" className="btn-primary w-full" disabled={!hasContent || issue.isPending}>
          {issue.isPending && <Spinner className="h-4 w-4" />}
          {issue.isPending ? t('prescriptions.issuing') : t('prescriptions.issue')}
        </button>
      </div>
    </form>
  );
}
