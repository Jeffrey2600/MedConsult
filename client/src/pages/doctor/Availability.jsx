import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, CalendarOff, Clock, Info, Globe } from 'lucide-react';

import { PageHeader } from '../../components/DashboardLayout.jsx';
import { SkeletonList, Spinner } from '../../components/Spinner.jsx';
import { availabilityApi } from '../../api/appointments.js';
import { toApiError } from '../../api/client.js';
import { dayjs, toDateKey, localTimezone } from '../../lib/datetime.js';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
const toTimeString = (minute) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export default function Availability() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    dayOfWeek: 1, start: '09:00', end: '13:00', slotMinutes: 30,
  });
  const [blockForm, setBlockForm] = useState({ date: '', reason: '' });

  const { data, isPending } = useQuery({
    queryKey: ['availability', 'me'],
    queryFn: () => availabilityApi.mine(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['availability'] });
    queryClient.invalidateQueries({ queryKey: ['slots'] });
    queryClient.invalidateQueries({ queryKey: ['slot-summary'] });
    setError('');
  };
  const onError = (err) => setError(toApiError(err).message);

  const addRule = useMutation({ mutationFn: availabilityApi.createRule, onSuccess: refresh, onError });
  const goAlwaysAvailable = useMutation({
    mutationFn: availabilityApi.setAlwaysAvailable,
    onSuccess: refresh,
    onError,
  });
  const removeRule = useMutation({ mutationFn: availabilityApi.deleteRule, onSuccess: refresh, onError });
  const block = useMutation({
    mutationFn: availabilityApi.blockDate,
    onSuccess: () => { refresh(); setBlockForm({ date: '', reason: '' }); },
    onError,
  });
  const unblock = useMutation({ mutationFn: availabilityApi.unblockDate, onSuccess: refresh, onError });

  const rules = data?.rules ?? [];
  const blockedDates = data?.blockedDates ?? [];
  const alwaysAvailable = data?.alwaysAvailable ?? false;
  const busy = addRule.isPending || removeRule.isPending || goAlwaysAvailable.isPending;

  // Clearing the seven full-day windows is just deleting them, so it reuses the
  // existing per-rule delete rather than needing an endpoint of its own.
  const clearAll = async () => {
    for (const rule of rules) {
      await removeRule.mutateAsync(rule._id);
    }
  };

  const byDay = DAY_KEYS.map((_, index) =>
    rules.filter((r) => r.dayOfWeek === index).sort((a, b) => a.startMinute - b.startMinute)
  );

  const submitRule = (event) => {
    event.preventDefault();
    addRule.mutate({
      dayOfWeek: Number(form.dayOfWeek),
      startMinute: toMinutes(form.start),
      endMinute: toMinutes(form.end),
      slotMinutes: Number(form.slotMinutes),
      timezone: localTimezone(),
    });
  };

  if (isPending) return <><PageHeader title={t('nav.availability')} /><SkeletonList rows={3} /></>;

  return (
    <>
      <PageHeader title={t('nav.availability')} subtitle={t('availability.subtitle')} />

      {/* Round-the-clock is its own panel rather than another row in the form,
          because it is a different decision: not "add a window" but "I take
          appointments at any hour". The per-day form below stays for doctors
          who want specific hours. */}
      <section
        className={`card mb-5 p-5 ${alwaysAvailable ? 'border-2 border-emerald-500 bg-emerald-50' : ''}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`mt-0.5 shrink-0 rounded-lg p-2.5 ${
                alwaysAvailable ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Globe className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-slate-900">
                {t('availability.alwaysTitle')}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
                {alwaysAvailable
                  ? t('availability.alwaysOnBody')
                  : t('availability.alwaysOffBody')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            {!alwaysAvailable && (
              <div>
                <label className="label" htmlFor="always-slot">
                  {t('availability.slotLength')}
                </label>
                <select
                  id="always-slot"
                  className="input"
                  value={form.slotMinutes}
                  onChange={(e) => setForm({ ...form, slotMinutes: e.target.value })}
                >
                  {[10, 15, 20, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>{t('availability.minutes', { count: m })}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              className={alwaysAvailable ? 'btn-secondary' : 'btn-primary'}
              disabled={busy}
              onClick={() =>
                alwaysAvailable
                  ? clearAll()
                  : goAlwaysAvailable.mutate({
                      slotMinutes: Number(form.slotMinutes),
                      timezone: localTimezone(),
                    })
              }
            >
              {busy ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Globe className="h-4 w-4" aria-hidden="true" />
              )}
              {alwaysAvailable ? t('availability.alwaysTurnOff') : t('availability.alwaysTurnOn')}
            </button>
          </div>
        </div>
      </section>

      <div className="mb-5 flex gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <p>{t('availability.overnightHint')}</p>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={submitRule} className="card mb-6 p-5">
        <h2 className="font-semibold text-slate-900">{t('availability.addWindow')}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="day">{t('availability.day')}</label>
            <select id="day" className="input" value={form.dayOfWeek}
              onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
              {DAY_KEYS.map((key, index) => (
                <option key={key} value={index}>{t(`datetime.day_${key}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="start">{t('availability.startTime')}</label>
            <input id="start" type="time" step="900" className="input" value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="end">{t('availability.endTime')}</label>
            <input id="end" type="time" step="900" className="input" value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="slot">{t('availability.slotLength')}</label>
            <select id="slot" className="input" value={form.slotMinutes}
              onChange={(e) => setForm({ ...form, slotMinutes: e.target.value })}>
              {[10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>{t('availability.minutes', { count: m })}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {addRule.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              {t('common.save')}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {t('availability.timezoneNote', { zone: localTimezone() })}
        </p>
      </form>

      <section className="card mb-6 p-5">
        <h2 className="font-semibold text-slate-900">{t('availability.weeklySchedule')}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DAY_KEYS.map((key, index) => (
            <div key={key} className="rounded-lg border border-slate-200 p-3">
              <h3 className="text-sm font-semibold text-slate-900">{t(`datetime.day_${key}`)}</h3>
              {byDay[index].length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">{t('availability.noWindows')}</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {byDay[index].map((rule) => (
                    <li key={rule._id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5">
                      <span className="flex items-center gap-1.5 text-xs text-slate-700">
                        <Clock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                        {toTimeString(rule.startMinute)}–{toTimeString(rule.endMinute)}
                        <span className="text-slate-400">({rule.slotMinutes}m)</span>
                      </span>
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-700"
                        disabled={busy}
                        title={t('common.delete')}
                        onClick={() => {
                          if (window.confirm(t('availability.confirmDeleteWindow'))) {
                            removeRule.mutate(rule._id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <CalendarOff className="h-4.5 w-4.5 text-slate-400" aria-hidden="true" />
          {t('availability.blockedDates')}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t('availability.blockedHint')}</p>

        <form
          onSubmit={(e) => { e.preventDefault(); block.mutate(blockForm); }}
          className="mt-4 flex flex-wrap gap-3"
        >
          <input
            type="date"
            required
            min={toDateKey(new Date())}
            className="input sm:w-48"
            value={blockForm.date}
            onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })}
            aria-label={t('availability.blockDate')}
          />
          <input
            type="text"
            className="input flex-1 sm:min-w-56"
            placeholder={t('availability.blockReasonPlaceholder')}
            value={blockForm.reason}
            onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
            aria-label={t('availability.blockReason')}
          />
          <button type="submit" className="btn-secondary" disabled={block.isPending || !blockForm.date}>
            {block.isPending && <Spinner className="h-4 w-4" />}
            {t('availability.blockDate')}
          </button>
        </form>

        {blockedDates.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">{t('availability.noBlockedDates')}</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {blockedDates.map((b) => (
              <li key={b._id} className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm">
                <span className="font-medium text-slate-800">{dayjs(b.date).format('D MMM YYYY')}</span>
                {b.reason && <span className="text-slate-500">— {b.reason}</span>}
                <button
                  type="button"
                  className="text-slate-500 hover:text-red-600"
                  onClick={() => unblock.mutate(b._id)}
                  aria-label={t('availability.unblock')}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
