import { useTranslation } from 'react-i18next';
import { Star, Languages, Briefcase, IndianRupee } from 'lucide-react';
import { LANGUAGES } from '../lib/i18n.js';

const initials = (name = '') =>
  name
    .replace(/^Dr\.?\s*/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

export function DoctorCard({ doctor, action }) {
  const { t } = useTranslation();
  const name = doctor.user?.name ?? '';

  const spokenLanguages = (doctor.languages ?? [])
    .map((code) => LANGUAGES.find((l) => l.code === code)?.native)
    .filter(Boolean)
    .join(', ');

  return (
    <article className="card flex flex-col p-5">
      <div className="flex items-start gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900">{name}</h3>
          <p className="text-sm text-brand-700">{doctor.specialty?.name}</p>
          {doctor.ratingCount > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="font-medium text-slate-700">
                {doctor.ratingAverage.toFixed(1)}
              </span>
              ({doctor.ratingCount})
            </p>
          )}
        </div>
      </div>

      {doctor.bio && (
        <p className="mt-3.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
          {doctor.bio}
        </p>
      )}

      <dl className="mt-3.5 space-y-1.5 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <dd>{t('doctor.yearsShort', { count: doctor.experienceYears ?? 0 })} {t('search.experienceSuffix')}</dd>
        </div>
        {spokenLanguages && (
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dd className="truncate">{spokenLanguages}</dd>
          </div>
        )}
        {doctor.consultationFee > 0 && (
          <div className="flex items-center gap-2">
            <IndianRupee className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dd>{doctor.consultationFee}</dd>
          </div>
        )}
      </dl>

      {action && <div className="mt-4 pt-1">{action}</div>}
    </article>
  );
}
