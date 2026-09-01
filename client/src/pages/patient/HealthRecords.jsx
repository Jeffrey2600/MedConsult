import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, FileText, Image as ImageIcon, Trash2, ExternalLink, FolderHeart, X,
} from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/DashboardLayout.jsx';
import { SkeletonList, Spinner } from '../../components/Spinner.jsx';
import { recordApi, openStoredFile } from '../../api/records.js';
import { qk } from '../../lib/queryClient.js';
import { toApiError } from '../../api/client.js';
import { formatDate } from '../../lib/datetime.js';
import { useAuth } from '../../context/AuthContext.jsx';

const CATEGORIES = ['lab_report', 'scan', 'prescription', 'discharge_summary', 'vaccination', 'other'];
const MAX_MB = 5;

const prettySize = (bytes) =>
  bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function HealthRecords() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({ title: '', category: 'lab_report', notes: '' });
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const { data, isPending } = useQuery({
    queryKey: qk.records(user?.id, filter),
    queryFn: () => recordApi.list(filter ? { category: filter } : undefined),
  });

  const resetForm = () => {
    setForm({ title: '', category: 'lab_report', notes: '' });
    setFile(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const upload = useMutation({
    mutationFn: () => recordApi.upload(file, form, setProgress),
    onSuccess: () => {
      setError('');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['records'] });
    },
    onError: (err) => {
      setProgress(0);
      setError(toApiError(err).message);
    },
  });

  const remove = useMutation({
    mutationFn: (id) => recordApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['records'] }),
    onError: (err) => setError(toApiError(err).message),
  });

  const openRecord = async (record) => {
    setError('');
    try {
      const { url, external } = await recordApi.url(record._id);
      await openStoredFile(url, external);
    } catch (err) {
      setError(toApiError(err).message);
    }
  };

  const pickFile = (event) => {
    const chosen = event.target.files?.[0];
    setError('');
    if (!chosen) return;

    if (chosen.size > MAX_MB * 1024 * 1024) {
      setError(t('records.tooLarge', { max: MAX_MB }));
      event.target.value = '';
      return;
    }
    setFile(chosen);
    // Offer the filename as a starting title so the field is rarely empty.
    if (!form.title) {
      setForm((f) => ({ ...f, title: chosen.name.replace(/\.[^.]+$/, '').slice(0, 200) }));
    }
  };

  const records = data?.records ?? [];

  return (
    <>
      <PageHeader title={t('nav.records')} subtitle={t('records.subtitle')} />

      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
        {t('records.privacyNote')}
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label={t('common.close')}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); upload.mutate(); }}
        className="card mb-6 p-5"
      >
        <h2 className="font-semibold text-slate-900">{t('records.uploadTitle')}</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="file">{t('records.file')}</label>
            <input
              id="file"
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={pickFile}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0
                         file:bg-brand-50 file:px-4 file:py-2.5 file:text-sm file:font-semibold
                         file:text-brand-700 hover:file:bg-brand-100"
            />
            <p className="mt-1 text-xs text-slate-500">{t('records.fileHint', { max: MAX_MB })}</p>
          </div>

          <div>
            <label className="label" htmlFor="title">{t('records.title')}</label>
            <input
              id="title"
              className="input"
              required
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="category">{t('records.category')}</label>
            <select
              id="category"
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`records.cat_${c}`)}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">
              {t('records.notes')} <span className="font-normal text-slate-400">({t('common.optional')})</span>
            </label>
            <input
              id="notes"
              className="input"
              maxLength={1000}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        {upload.isPending && progress > 0 && (
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <button
          type="submit"
          className="btn-primary mt-4"
          disabled={!file || !form.title.trim() || upload.isPending}
        >
          {upload.isPending ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          {upload.isPending ? t('records.uploading') : t('records.upload')}
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter('')}
          className={`badge ${filter === '' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          {t('records.allCategories')}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`badge ${filter === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {t(`records.cat_${c}`)}
          </button>
        ))}
      </div>

      {isPending && <SkeletonList rows={3} />}

      {!isPending && records.length === 0 && (
        <EmptyState icon={FolderHeart} title={t('records.emptyTitle')} body={t('records.emptyBody')} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {records.map((record) => {
          const isImage = record.mimeType?.startsWith('image/');
          return (
            <article key={record._id} className="card flex items-start gap-3.5 p-4">
              <span className="rounded-lg bg-slate-100 p-2.5 text-slate-500">
                {isImage ? <ImageIcon className="h-5 w-5" aria-hidden="true" />
                         : <FileText className="h-5 w-5" aria-hidden="true" />}
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium text-slate-900">{record.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t(`records.cat_${record.category}`)} · {formatDate(record.recordDate)} · {prettySize(record.sizeBytes)}
                </p>
                {record.notes && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{record.notes}</p>
                )}

                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => openRecord(record)} className="btn-secondary py-1.5 text-xs">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('common.view')}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost py-1.5 text-xs text-red-600"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(t('records.confirmDelete', { title: record.title }))) {
                        remove.mutate(record._id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
