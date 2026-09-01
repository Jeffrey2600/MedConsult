import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { HeartPulse, Siren, FolderLock, Languages, ArrowRight, Phone } from 'lucide-react';

import { LanguageSwitcher } from '../components/LanguageSwitcher.jsx';
import { OnCallBoard } from '../components/OnCallBoard.jsx';
import { specialtyApi } from '../api/specialties.js';
import { qk } from '../lib/queryClient.js';

/* A consultation really is a sequence, so it is numbered. The capabilities
   below it are not, so they are not — the numbering has to mean something. */
const STEPS = ['1', '2', '3', '4'];

const CAPABILITIES = [
  { icon: Siren, key: 'sos' },
  { icon: FolderLock, key: 'records' },
  { icon: Languages, key: 'lang' },
];

/* Proof rather than a claim: the interface says it runs in five languages, so
   the word each of them uses for "health" is set in its own script. These
   render from the locally bundled Noto faces, which is also a live check that
   the fonts loaded. */
const HEALTH_IN = ['Health', 'நலம்', 'स्वास्थ्य', 'ఆరోగ్యం', 'ആരോഗ്യം'];

const AMBULANCE = '108';

export default function Landing() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: qk.specialties,
    queryFn: () => specialtyApi.list(),
    staleTime: 10 * 60_000,
  });
  const specialties = data?.specialties ?? [];

  return (
    <div className="min-h-screen bg-paper">
      {/*
        The header and the hero are one continuous ink slab — the board the
        service reports its state on. Everything below the slab is paper,
        where the visitor reads and acts. The seam between them is the only
        hard edge on the page, and it is deliberate.
      */}
      <div className="relative overflow-hidden bg-ink-900 text-white">
        {/* A single soft monitor glow behind the board. The page's only
            decorative gradient, and it is doing atmospheric work. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 right-0 h-[38rem] w-[38rem] rounded-full bg-brand-500/18 blur-[130px]"
        />

        <header className="relative border-b border-white/10">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:gap-3 sm:px-5">
            <span className="flex items-center gap-2.5">
              <span className="rounded-lg bg-white/10 p-1.5 text-vital-300 ring-1 ring-white/15">
                <HeartPulse className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-display text-lg font-bold">{t('app.name')}</span>
            </span>
            <div className="flex items-center gap-1.5 sm:gap-3">
              <LanguageSwitcher compact onDark />
              <Link
                to="/login"
                className="btn-secondary border-white/20 bg-transparent text-white hover:border-white/35 hover:bg-white/10"
              >
                {t('auth.login')}
              </Link>
              <Link to="/register/patient" className="btn-primary hidden sm:inline-flex">
                {t('auth.register')}
              </Link>
            </div>
          </div>
        </header>

        <section className="relative mx-auto max-w-6xl px-5 pt-14 pb-16 sm:pt-20 sm:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
            <div>
              <p className="eyebrow text-vital-300">{t('landing.eyebrow')}</p>
              <h1 className="font-display mt-5 text-[2.5rem] leading-[1.08] font-bold sm:text-6xl lg:text-[4.25rem]">
                {t('landing.heroTitle')}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
                {t('landing.heroBody')}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link to="/register/patient" className="btn-primary px-6 py-3">
                  {t('landing.ctaPatient')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/register/doctor"
                  className="btn-secondary border-white/20 bg-transparent px-6 py-3 text-white hover:border-white/35 hover:bg-white/10"
                >
                  {t('landing.ctaDoctor')}
                </Link>
              </div>
              <p className="mt-5 text-sm text-white/40">{t('landing.trustNote')}</p>
            </div>

            <OnCallBoard specialties={specialties} loading={isLoading} />
          </div>
        </section>
      </div>

      {/* ── How a consultation works ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <p className="eyebrow text-brand-700">{t('landing.stepsEyebrow')}</p>
        <h2 className="font-display mt-3 max-w-2xl text-3xl font-bold text-ink-900 sm:text-4xl">
          {t('landing.stepsTitle')}
        </h2>

        <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((n) => (
            <li key={n} className="relative">
              {/* The rule doubles as the connector between steps, so the
                  sequence is legible without arrows or chevrons. */}
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-brand-600">
                  {n.padStart(2, '0')}
                </span>
                <span className="h-px flex-1 bg-ink-900/12" aria-hidden="true" />
              </div>
              <h3 className="font-display mt-4 text-lg font-semibold text-ink-900">
                {t(`landing.step${n}Title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-900/62">
                {t(`landing.step${n}Body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Capabilities ─────────────────────────────────────────────────── */}
      <section className="border-y border-ink-900/10 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <p className="eyebrow text-brand-700">{t('landing.builtInEyebrow')}</p>
          <h2 className="font-display mt-3 max-w-2xl text-3xl font-bold text-ink-900 sm:text-4xl">
            {t('landing.builtInTitle')}
          </h2>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, key }) => (
              <div
                key={key}
                className="flex flex-col rounded-xl border border-ink-900/10 bg-paper p-6"
              >
                <span
                  className={`inline-flex w-fit rounded-lg p-2.5 ${
                    key === 'sos'
                      ? 'bg-urgent-50 text-urgent-600'
                      : 'bg-brand-50 text-brand-700'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="font-display mt-4 text-lg font-semibold text-ink-900">
                  {t(`landing.${key}Title`)}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-900/62">
                  {t(`landing.${key}Body`)}
                </p>

                {/* The language card proves its own claim instead of repeating it. */}
                {key === 'lang' && (
                  <ul className="mt-5 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-ink-900/10 pt-4">
                    {HEALTH_IN.map((word) => (
                      <li key={word} className="text-base text-ink-900/70">
                        {word}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Specialty directory ──────────────────────────────────────────── */}
      {specialties.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <p className="eyebrow text-brand-700">{t('landing.directoryEyebrow')}</p>
          <h2 className="font-display mt-3 max-w-2xl text-3xl font-bold text-ink-900 sm:text-4xl">
            {t('landing.specialtiesTitle')}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-900/62">
            {t('landing.specialtiesBody')}
          </p>

          <ul className="mt-10 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {specialties.map((s) => (
              <li key={s._id}>
                <Link
                  to="/register/patient"
                  className="group flex items-baseline justify-between gap-4 border-b border-ink-900/10 py-3.5 transition-colors hover:border-brand-600"
                >
                  <span className="truncate text-[0.9375rem] font-medium text-ink-900 group-hover:text-brand-700">
                    {s.name}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-ink-900/40">
                    {s.doctorCount ?? 0}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Emergency ────────────────────────────────────────────────────── */}
      <section className="border-t border-urgent-100 bg-urgent-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-10">
          <div className="flex min-w-0 items-start gap-4">
            <span className="mt-0.5 shrink-0 rounded-lg bg-urgent-600 p-2.5 text-white">
              <Siren className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold text-urgent-700">
                {t('landing.emergencyTitle')}
              </h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-900/70">
                {t('landing.emergencyBody', { number: AMBULANCE })}
              </p>
            </div>
          </div>
          <a href={`tel:${AMBULANCE}`} className="btn-danger px-6 py-3 text-base">
            <Phone className="h-4.5 w-4.5" aria-hidden="true" />
            {t('landing.emergencyCta', { number: AMBULANCE })}
          </a>
        </div>
      </section>

      <footer className="bg-ink-900 px-5 py-12 text-white">
        <div className="mx-auto max-w-3xl">
          <span className="flex items-center justify-center gap-2.5">
            <HeartPulse className="h-4.5 w-4.5 text-vital-300" aria-hidden="true" />
            <span className="font-display font-bold">{t('app.name')}</span>
          </span>
          <p className="mt-5 text-center text-xs leading-relaxed text-white/45">
            {t('landing.disclaimer')}
          </p>
        </div>
      </footer>
    </div>
  );
}
