import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Power, Trash2 } from 'lucide-react';

import { PageHeader } from '../../components/DashboardLayout.jsx';
import { SkeletonList, Spinner } from '../../components/Spinner.jsx';
import { specialtyApi } from '../../api/specialties.js';
import { qk } from '../../lib/queryClient.js';
import { toApiError } from '../../api/client.js';

export default function Specialties() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState({ name: '', description: '' });
  const [message, setMessage] = useState(null);

  const { data, isPending } = useQuery({
    queryKey: [...qk.specialties, 'admin'],
    queryFn: () => specialtyApi.list({ includeInactive: 'true' }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.specialties });
    setEditing(null);
    setForm({ name: '', description: '' });
  };

  const onError = (err) => setMessage({ tone: 'error', text: toApiError(err).message });

  const create = useMutation({
    mutationFn: (payload) => specialtyApi.create(payload),
    onSuccess: () => { setMessage(null); refresh(); },
    onError,
  });

  const update = useMutation({
    mutationFn: ({ id, payload }) => specialtyApi.update(id, payload),
    onSuccess: () => { setMessage(null); refresh(); },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id) => specialtyApi.remove(id),
    onSuccess: (res) => {
      // A specialty still used by doctors is deactivated, not deleted — the
      // server says which happened, so the message reflects reality.
      setMessage({ tone: res.deactivated ? 'warn' : 'ok', text: res.message });
      refresh();
    },
    onError,
  });

  const specialties = data?.specialties ?? [];
  const busy = create.isPending || update.isPending || remove.isPending;

  const submit = (event) => {
    event.preventDefault();
    if (editing === 'new') create.mutate(form);
    else update.mutate({ id: editing, payload: form });
  };

  return (
    <>
      <PageHeader
        title={t('nav.specialties')}
        subtitle={t('specialties.subtitle')}
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => { setEditing('new'); setForm({ name: '', description: '' }); }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('specialties.add')}
          </button>
        }
      />

      {message && (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-3.5 py-3 text-sm ${
            message.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : message.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {editing && (
        <form onSubmit={submit} className="card mb-5 p-5">
          <h2 className="font-semibold text-slate-900">
            {editing === 'new' ? t('specialties.add') : t('specialties.edit')}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="sp-name">{t('specialties.name')}</label>
              <input
                id="sp-name"
                className="input"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="sp-desc">{t('specialties.description')}</label>
              <input
                id="sp-desc"
                className="input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy || !form.name.trim()}>
              {busy && <Spinner className="h-4 w-4" />}
              {t('common.save')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {isPending && <SkeletonList rows={3} />}

      <div className="card divide-y divide-slate-100">
        {specialties.map((s) => (
          <div key={s._id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className={`font-medium ${s.isActive ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                {s.name}
              </p>
              {s.description && <p className="truncate text-sm text-slate-600">{s.description}</p>}
            </div>

            <span className="badge bg-slate-100 text-slate-700">
              {t('specialties.doctorCount', { count: s.doctorCount })}
            </span>

            <div className="flex gap-1">
              <button
                type="button"
                className="btn-ghost p-2"
                title={t('common.edit')}
                onClick={() => {
                  setEditing(s._id);
                  setForm({ name: s.name, description: s.description ?? '' });
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn-ghost p-2"
                title={s.isActive ? t('specialties.deactivate') : t('specialties.activate')}
                disabled={busy}
                onClick={() => update.mutate({ id: s._id, payload: { isActive: !s.isActive } })}
              >
                <Power className={`h-4 w-4 ${s.isActive ? 'text-emerald-600' : 'text-slate-400'}`} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn-ghost p-2 text-red-600"
                title={t('common.delete')}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t('specialties.confirmDelete', { name: s.name }))) {
                    remove.mutate(s._id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
