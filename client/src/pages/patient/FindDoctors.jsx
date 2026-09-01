import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, SlidersHorizontal, UserX, ChevronLeft, ChevronRight } from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/DashboardLayout.jsx';
import { DoctorCard } from '../../components/DoctorCard.jsx';
import { SkeletonList } from '../../components/Spinner.jsx';
import { doctorApi } from '../../api/doctors.js';
import { specialtyApi } from '../../api/specialties.js';
import { qk } from '../../lib/queryClient.js';
import { LANGUAGES } from '../../lib/i18n.js';
import { useDebounced } from '../../hooks/useDebounced.js';

export default function FindDoctors() {
  const { t } = useTranslation();
  // Filters live in the URL so a search can be shared, bookmarked, and
  // survives the back button — and the symptom checker can deep-link here.
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  const specialty = params.get('specialty') ?? '';
  const language = params.get('language') ?? '';
  const sort = params.get('sort') ?? 'rating';
  const page = Number(params.get('page') ?? 1);
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '');

  // Avoids firing a request on every keystroke.
  const q = useDebounced(searchInput, 350);

  const filters = useMemo(
    () => ({
      ...(q ? { q } : {}),
      ...(specialty ? { specialty } : {}),
      ...(language ? { language } : {}),
      sort,
      page,
      limit: 12,
    }),
    [q, specialty, language, sort, page]
  );

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: qk.doctors(filters),
    queryFn: () => doctorApi.list(filters),
    placeholderData: keepPreviousData,
  });

  const { data: specialtyData } = useQuery({
    queryKey: qk.specialties,
    queryFn: () => specialtyApi.list(),
    staleTime: 10 * 60_000,
  });

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change invalidates the current page number.
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const doctors = data?.doctors ?? [];
  const pagination = data?.pagination;
  const hasFilters = Boolean(q || specialty || language);

  return (
    <>
      <PageHeader title={t('nav.findDoctors')} subtitle={t('search.subtitle')} />

      <div className="card mb-5 p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setParam('q', e.target.value);
              }}
              placeholder={t('search.placeholder')}
              className="input pl-9"
              aria-label={t('common.search')}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="btn-secondary sm:hidden"
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className={`mt-3 gap-3 sm:grid sm:grid-cols-3 ${showFilters ? 'grid' : 'hidden sm:grid'}`}>
          <div>
            <label className="label" htmlFor="f-specialty">{t('auth.specialty')}</label>
            <select
              id="f-specialty"
              value={specialty}
              onChange={(e) => setParam('specialty', e.target.value)}
              className="input"
            >
              <option value="">{t('search.allSpecialties')}</option>
              {(specialtyData?.specialties ?? []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({s.doctorCount})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="f-language">{t('auth.languagesSpoken')}</label>
            <select
              id="f-language"
              value={language}
              onChange={(e) => setParam('language', e.target.value)}
              className="input"
            >
              <option value="">{t('search.anyLanguage')}</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.native}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="f-sort">{t('search.sortBy')}</label>
            <select id="f-sort" value={sort} onChange={(e) => setParam('sort', e.target.value)} className="input">
              <option value="rating">{t('search.sortRating')}</option>
              <option value="experience">{t('search.sortExperience')}</option>
              <option value="feeAsc">{t('search.sortFeeAsc')}</option>
              <option value="feeDesc">{t('search.sortFeeDesc')}</option>
              <option value="name">{t('search.sortName')}</option>
            </select>
          </div>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setParams(new URLSearchParams(), { replace: true });
            }}
            className="mt-3 text-sm font-medium text-brand-700 hover:underline"
          >
            {t('search.clearFilters')}
          </button>
        )}
      </div>

      {isPending && <SkeletonList rows={3} />}

      {isError && (
        <EmptyState
          icon={UserX}
          title={t('common.somethingWentWrong')}
          action={<button type="button" onClick={() => refetch()} className="btn-primary">{t('common.retry')}</button>}
        />
      )}

      {!isPending && !isError && doctors.length === 0 && (
        <EmptyState
          icon={UserX}
          title={t('search.noResultsTitle')}
          body={hasFilters ? t('search.noResultsFiltered') : t('search.noResultsBody')}
        />
      )}

      {doctors.length > 0 && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {t('search.resultCount', { count: pagination?.total ?? doctors.length })}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {doctors.map((doctor) => (
              <DoctorCard
                key={doctor._id}
                doctor={doctor}
                action={
                  <Link to={`/patient/doctors/${doctor.user._id}`} className="btn-primary w-full">
                    {t('search.viewAndBook')}
                  </Link>
                }
              />
            ))}
          </div>

          {pagination && pagination.pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
              <button
                type="button"
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setParam('page', String(page - 1))}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                {t('common.back')}
              </button>
              <span className="px-2 text-sm text-slate-600">
                {t('search.pageOf', { page, pages: pagination.pages })}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= pagination.pages}
                onClick={() => setParam('page', String(page + 1))}
              >
                {t('common.next')}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
