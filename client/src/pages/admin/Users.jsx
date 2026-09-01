import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, UserCheck, UserX, ChevronLeft, ChevronRight } from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/DashboardLayout.jsx';
import { SkeletonList } from '../../components/Spinner.jsx';
import { adminApi } from '../../api/admin.js';
import { qk } from '../../lib/queryClient.js';
import { toApiError } from '../../api/client.js';
import { useDebounced } from '../../hooks/useDebounced.js';

const ROLE_TONE = {
  admin: 'bg-purple-50 text-purple-700',
  doctor: 'bg-brand-50 text-brand-700',
  patient: 'bg-slate-100 text-slate-700',
};

export default function Users() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const q = useDebounced(search, 350);
  const filters = { ...(role ? { role } : {}), ...(q ? { q } : {}), page, limit: 20 };

  const { data, isPending } = useQuery({
    queryKey: qk.adminUsers(filters),
    queryFn: () => adminApi.users(filters),
    placeholderData: keepPreviousData,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => adminApi.setUserActive(id, isActive),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: qk.adminStats });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
    },
    onError: (err) => setError(toApiError(err).message),
  });

  const users = data?.users ?? [];
  const pagination = data?.pagination;

  return (
    <>
      <PageHeader title={t('nav.users')} subtitle={t('users.subtitle')} />

      <div className="card mb-5 flex flex-wrap gap-3 p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('users.searchPlaceholder')}
            className="input pl-9"
            aria-label={t('common.search')}
          />
        </div>
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1); }}
          className="input sm:w-48"
          aria-label={t('users.filterByRole')}
        >
          <option value="">{t('users.allRoles')}</option>
          <option value="patient">{t('roles.patient')}</option>
          <option value="doctor">{t('roles.doctor')}</option>
          <option value="admin">{t('roles.admin')}</option>
        </select>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isPending && <SkeletonList rows={4} />}

      {!isPending && users.length === 0 && (
        <EmptyState icon={UserX} title={t('users.emptyTitle')} body={t('users.emptyBody')} />
      )}

      {users.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-160 text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('auth.fullName')}</th>
                <th className="px-4 py-3 font-semibold">{t('auth.email')}</th>
                <th className="px-4 py-3 font-semibold">{t('users.role')}</th>
                <th className="px-4 py-3 font-semibold">{t('users.joined')}</th>
                <th className="px-4 py-3 font-semibold">{t('users.status')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('users.action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u._id} className={u.isActive ? '' : 'bg-slate-50/60'}>
                  <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${ROLE_TONE[u.role]}`}>{t(`roles.${u.role}`)}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                      {u.isActive ? t('users.active') : t('users.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={u.isActive ? 'btn-secondary' : 'btn-primary'}
                      disabled={toggleActive.isPending}
                      onClick={() => toggleActive.mutate({ id: u._id, isActive: !u.isActive })}
                    >
                      {u.isActive ? (
                        <><UserX className="h-4 w-4" aria-hidden="true" />{t('users.deactivate')}</>
                      ) : (
                        <><UserCheck className="h-4 w-4" aria-hidden="true" />{t('users.activate')}</>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <nav className="mt-5 flex items-center justify-center gap-2" aria-label="Pagination">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t('common.back')}
          </button>
          <span className="px-2 text-sm text-slate-600">
            {t('search.pageOf', { page, pages: pagination.pages })}
          </span>
          <button type="button" className="btn-secondary" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>
            {t('common.next')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </>
  );
}
