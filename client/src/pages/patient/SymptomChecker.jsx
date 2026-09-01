import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot, Siren, AlertTriangle, Stethoscope, Info, Phone, History, Sparkles, ListChecks,
} from 'lucide-react';

import { PageHeader } from '../../components/DashboardLayout.jsx';
import { Spinner } from '../../components/Spinner.jsx';
import { symptomApi } from '../../api/symptoms.js';
import { toApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDateTime } from '../../lib/datetime.js';

const URGENCY_STYLE = {
  emergency: { card: 'border-red-300 bg-red-50', badge: 'bg-red-600 text-white', icon: Siren },
  urgent: { card: 'border-amber-300 bg-amber-50', badge: 'bg-amber-500 text-white', icon: AlertTriangle },
  routine: { card: 'border-brand-200 bg-brand-50', badge: 'bg-brand-600 text-white', icon: Stethoscope },
  self_care: { card: 'border-slate-200 bg-slate-50', badge: 'bg-slate-600 text-white', icon: Info },
};

export default function SymptomChecker() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const { data: history } = useQuery({
    queryKey: ['symptom-checks'],
    queryFn: () => symptomApi.list(),
    enabled: showHistory,
  });

  const check = useMutation({
    mutationFn: () =>
      symptomApi.check({
        text,
        language: i18n.resolvedLanguage,
        ...(profile?.age != null ? { ageYears: profile.age } : {}),
        ...(profile?.gender ? { gender: profile.gender } : {}),
        ...(durationDays !== '' ? { durationDays: Number(durationDays) } : {}),
      }),
    onSuccess: (data) => {
      setResult(data.result);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['symptom-checks'] });
    },
    onError: (err) => {
      setError(toApiError(err).message);
      setResult(null);
    },
  });

  const style = result ? (URGENCY_STYLE[result.urgency] ?? URGENCY_STYLE.routine) : null;
  const UrgencyIcon = style?.icon ?? Info;

  return (
    <>
      <PageHeader
        title={t('nav.symptomChecker')}
        subtitle={t('symptoms.subtitle')}
        actions={
          <button type="button" className="btn-secondary" onClick={() => setShowHistory((v) => !v)}>
            <History className="h-4 w-4" aria-hidden="true" />
            {t('symptoms.history')}
          </button>
        }
      />

      {/* Present before any answer, and never removed. If the checker ever
          misjudges something, the way to get help is still on screen. */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <Siren className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-red-800">{t('symptoms.emergencyBanner')}</p>
        <Link to="/patient/emergency" className="btn-danger py-2">
          <Phone className="h-4 w-4" aria-hidden="true" />
          {t('nav.emergency')}
        </Link>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); check.mutate(); }}
        className="card p-5"
      >
        <label className="label" htmlFor="symptoms">{t('symptoms.describeLabel')}</label>
        <textarea
          id="symptoms"
          rows={5}
          className="input"
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('symptoms.placeholder')}
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>{t('symptoms.detailHint')}</span>
          <span>{text.length}/2000</span>
        </div>

        <div className="mt-4 max-w-xs">
          <label className="label" htmlFor="duration">
            {t('symptoms.duration')} <span className="font-normal text-slate-400">({t('common.optional')})</span>
          </label>
          <input
            id="duration"
            type="number"
            min="0"
            max="3650"
            className="input"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            placeholder={t('symptoms.durationPlaceholder')}
          />
        </div>

        <button
          type="submit"
          className="btn-primary mt-4"
          disabled={text.trim().length < 10 || check.isPending}
        >
          {check.isPending ? <Spinner className="h-4 w-4" /> : <Bot className="h-4 w-4" aria-hidden="true" />}
          {check.isPending ? t('symptoms.checking') : t('symptoms.check')}
        </button>
      </form>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <section className={`card mt-5 border-2 p-5 ${style.card}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className={`rounded-lg p-2.5 ${style.badge}`}>
                <UrgencyIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {t(`symptoms.urgency_${result.urgency}`)}
                </h2>
                <p className="text-sm text-slate-600">
                  {t(`symptoms.urgencyHint_${result.urgency}`)}
                </p>
              </div>
            </div>
          </div>

          {/* Red-flag instructions come from the rule layer verbatim, never
              paraphrased by the model. */}
          {result.redFlagActions?.length > 0 && (
            <div className="mt-4 rounded-lg border border-red-300 bg-white p-4">
              <h3 className="flex items-center gap-2 font-bold text-red-800">
                <Siren className="h-4.5 w-4.5" aria-hidden="true" />
                {t('symptoms.redFlagTitle')}
              </h3>
              <ul className="mt-3 space-y-3">
                {result.redFlagActions.map((flag) => (
                  <li key={flag.label}>
                    <p className="font-semibold text-slate-900">{flag.label}</p>
                    <p className="text-sm text-slate-700">{flag.advice}</p>
                  </li>
                ))}
              </ul>
              <Link to="/patient/emergency" className="btn-danger mt-4 w-full">
                <Siren className="h-4 w-4" aria-hidden="true" />
                {t('symptoms.goToEmergency')}
              </Link>
            </div>
          )}

          <div className="mt-4 rounded-lg bg-white p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Stethoscope className="h-4 w-4 text-slate-400" aria-hidden="true" />
              {t('symptoms.suggestedSpecialty')}
            </h3>
            <p className="mt-1 text-lg font-semibold text-brand-700">{result.suggestedSpecialty}</p>

            <Link
              to={result.specialtyId
                ? `/patient/doctors?specialty=${result.specialtyId}`
                : '/patient/doctors'}
              className="btn-primary mt-3"
            >
              {t('symptoms.bookSpecialist', { specialty: result.suggestedSpecialty })}
            </Link>
          </div>

          {result.advice && (
            <div className="mt-4 rounded-lg bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">{t('symptoms.advice')}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{result.advice}</p>
            </div>
          )}

          {result.possibleConditions?.length > 0 && (
            <div className="mt-4 rounded-lg bg-white p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ListChecks className="h-4 w-4 text-slate-400" aria-hidden="true" />
                {t('symptoms.possibleConditions')}
              </h3>
              {/* Gemini returns "Name — explanation"; the rule-engine fallback
                  returns a bare name with no dash. Splitting on the first
                  dash-like separator handles both without the two sources
                  needing a shared shape. */}
              <ul className="mt-2.5 space-y-2">
                {result.possibleConditions.map((c) => {
                  const [, name, explanation] = c.match(/^(.*?)\s[—–-]\s(.*)$/s) ?? [null, c, ''];
                  return (
                    <li key={c} className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-sm font-medium text-slate-900">{name}</p>
                      {explanation && (
                        <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{explanation}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-slate-500">{t('symptoms.conditionsHint')}</p>
            </div>
          )}

          {result.languageCoverageWarning && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              {t('symptoms.languageWarning')}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t(`symptoms.source_${result.source}`)}</span>
            {result.usedFallback && <span className="badge bg-slate-100 text-slate-600">{t('symptoms.fallbackUsed')}</span>}
          </div>

          <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-500">
            {result.disclaimer}
          </p>
        </section>
      )}

      {showHistory && (
        <section className="card mt-5 p-5">
          <h2 className="font-semibold text-slate-900">{t('symptoms.history')}</h2>
          {(history?.checks ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t('symptoms.historyEmpty')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {history.checks.map((c) => (
                <li key={c._id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${URGENCY_STYLE[c.urgency]?.badge ?? 'bg-slate-600 text-white'}`}>
                      {t(`symptoms.urgency_${c.urgency}`)}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{c.suggestedSpecialty}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.inputText}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
