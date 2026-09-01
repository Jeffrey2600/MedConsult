import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Siren } from 'lucide-react';

import { PageHeader } from '../../components/DashboardLayout.jsx';
import { SkeletonList, Spinner } from '../../components/Spinner.jsx';
import { adminApi } from '../../api/admin.js';
import { qk } from '../../lib/queryClient.js';
import { toApiError } from '../../api/client.js';

export default function Settings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState(null);

  const { data, isPending } = useQuery({
    queryKey: qk.settings,
    queryFn: () => adminApi.settings(),
  });

  // Seed the editable form once the stored values arrive.
  useEffect(() => {
    if (data?.settings && !form) setForm(data.settings);
  }, [data, form]);

  const save = useMutation({
    mutationFn: (payload) => adminApi.updateSettings(payload),
    onSuccess: (res) => {
      setForm(res.settings);
      setMessage({ tone: 'ok', text: t('settings.saved') });
      queryClient.invalidateQueries({ queryKey: qk.settings });
    },
    onError: (err) => setMessage({ tone: 'error', text: toApiError(err).message }),
  });

  if (isPending || !form) return <><PageHeader title={t('nav.settings')} /><SkeletonList rows={2} /></>;

  const field = (key, value) => setForm({ ...form, [key]: value });

  const submit = (event) => {
    event.preventDefault();
    save.mutate({
      siteName: form.siteName,
      ambulanceNumber: String(form.ambulanceNumber),
      emergencyHelpline: String(form.emergencyHelpline),
      defaultSlotMinutes: Number(form.defaultSlotMinutes),
      maxUploadMb: Number(form.maxUploadMb),
      hospitalSearchRadiusMeters: Number(form.hospitalSearchRadiusMeters),
      maintenanceMode: Boolean(form.maintenanceMode),
    });
  };

  return (
    <>
      <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} />

      {message && (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-3.5 py-3 text-sm ${
            message.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">{t('settings.general')}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="siteName">{t('settings.siteName')}</label>
              <input id="siteName" className="input" value={form.siteName}
                onChange={(e) => field('siteName', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="slot">{t('settings.defaultSlot')}</label>
              <input id="slot" type="number" min="5" max="240" step="5" className="input"
                value={form.defaultSlotMinutes}
                onChange={(e) => field('defaultSlotMinutes', e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">{t('settings.defaultSlotHint')}</p>
            </div>
            <div>
              <label className="label" htmlFor="upload">{t('settings.maxUpload')}</label>
              <input id="upload" type="number" min="1" max="25" className="input"
                value={form.maxUploadMb}
                onChange={(e) => field('maxUploadMb', e.target.value)} />
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Siren className="h-4.5 w-4.5 text-red-600" aria-hidden="true" />
            {t('settings.emergency')}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{t('settings.emergencyHint')}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="ambulance">{t('settings.ambulanceNumber')}</label>
              <input id="ambulance" className="input" value={form.ambulanceNumber}
                onChange={(e) => field('ambulanceNumber', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="helpline">{t('settings.helpline')}</label>
              <input id="helpline" className="input" value={form.emergencyHelpline}
                onChange={(e) => field('emergencyHelpline', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="radius">{t('settings.searchRadius')}</label>
              <input id="radius" type="number" min="500" max="50000" step="500" className="input"
                value={form.hospitalSearchRadiusMeters}
                onChange={(e) => field('hospitalSearchRadiusMeters', e.target.value)} />
            </div>
          </div>
        </section>

        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {save.isPending ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </>
  );
}
