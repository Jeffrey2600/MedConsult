import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeartPulse, ShieldCheck } from 'lucide-react';
import { LanguageSwitcher } from '../../components/LanguageSwitcher.jsx';

/**
 * Two panels on a wide screen: the ink side carries the identity so the form
 * side can be nothing but the form. On a narrow screen the ink side collapses
 * to a slim header — a phone signing in does not need the pitch again.
 */
export function AuthLayout({ title, subtitle, children, footer, wide = false }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      {/* Identity panel */}
      <aside className="relative overflow-hidden bg-ink-900 px-5 py-4 text-white lg:flex lg:flex-col lg:justify-between lg:px-10 lg:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-20 hidden h-[30rem] w-[30rem] rounded-full bg-brand-500/20 blur-[120px] lg:block"
        />

        <div className="relative flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="rounded-lg bg-white/10 p-1.5 text-vital-300 ring-1 ring-white/15">
              <HeartPulse className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-display text-lg font-bold">{t('app.name')}</span>
          </Link>
          <div className="lg:hidden">
            <LanguageSwitcher compact onDark />
          </div>
        </div>

        <div className="relative hidden lg:block">
          <p className="font-display text-3xl leading-[1.15] font-bold">
            {t('landing.heroTitle')}
          </p>
          <p className="mt-5 flex items-start gap-2.5 text-sm leading-relaxed text-white/55">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-vital-300" aria-hidden="true" />
            <span>{t('landing.trustNote')}</span>
          </p>
        </div>

        <div className="relative hidden lg:block">
          <LanguageSwitcher onDark />
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex justify-center bg-paper px-4 py-10 sm:px-8 lg:items-center lg:py-12">
        <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
          <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm leading-relaxed text-ink-900/62">{subtitle}</p>
          )}

          <div className="card mt-7 p-6 sm:p-7">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-ink-900/62">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** Banner used for server-side failures on the auth forms. */
export function FormError({ message }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-urgent-100 bg-urgent-50 px-3.5 py-3 text-sm text-urgent-700"
    >
      {message}
    </div>
  );
}
