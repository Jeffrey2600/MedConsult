import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function FullPageSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Spinner className="h-8 w-8 text-brand-600" />
        <p className="text-sm">{t('common.loading')}</p>
      </div>
    </div>
  );
}

/** Grey placeholder blocks shown while a list loads, instead of a blank page. */
export function SkeletonList({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card animate-pulse p-4">
          <div className="mb-3 h-4 w-1/3 rounded bg-slate-200" />
          <div className="mb-2 h-3 w-2/3 rounded bg-slate-100" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
