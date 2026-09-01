import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck } from 'lucide-react';

import { notificationApi } from '../api/notifications.js';
import { qk } from '../lib/queryClient.js';
import { fromNow } from '../lib/datetime.js';

export function NotificationBell({ connected }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const { data: countData } = useQuery({
    queryKey: qk.unreadCount,
    queryFn: () => notificationApi.unreadCount(),
    // The socket pushes updates; this interval is only a safety net for a
    // dropped connection, so it can be slow.
    refetchInterval: 120_000,
  });

  const { data: listData, isPending } = useQuery({
    queryKey: qk.notifications,
    queryFn: () => notificationApi.list({ limit: 15 }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id) => notificationApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.notifications });
      queryClient.invalidateQueries({ queryKey: qk.unreadCount });
    },
  });

  const markAll = useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.notifications });
      queryClient.invalidateQueries({ queryKey: qk.unreadCount });
    },
  });

  // Close when clicking away or pressing Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = countData?.unreadCount ?? 0;
  const notifications = listData?.notifications ?? [];

  const openNotification = (notification) => {
    if (!notification.isRead) markRead.mutate(notification._id);
    setOpen(false);
    if (notification.link) navigate(notification.link);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost relative p-2"
        aria-label={t('nav.notifications')}
        aria-expanded={open}
      >
        <Bell className="h-4.5 w-4.5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        {/* A quiet indicator that live updates are not currently arriving. */}
        {!connected && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400"
            title={t('notifications.offline')}
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{t('nav.notifications')}</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isPending && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">{t('common.loading')}</p>
            )}

            {!isPending && notifications.length === 0 && (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <BellOff className="h-8 w-8 text-slate-300" aria-hidden="true" />
                <p className="mt-2 text-sm text-slate-500">{t('notifications.empty')}</p>
              </div>
            )}

            <ul className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                      n.isRead ? '' : 'bg-brand-50/40'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.isRead && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
                      )}
                      <div className={n.isRead ? 'pl-4' : ''}>
                        <p className="text-sm font-medium text-slate-900">{n.title}</p>
                        {n.body && <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>}
                        <p className="mt-1 text-xs text-slate-400">{fromNow(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
