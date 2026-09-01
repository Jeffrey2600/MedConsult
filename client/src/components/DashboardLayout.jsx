import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeartPulse, LogOut, Menu, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import { LanguageSwitcher } from './LanguageSwitcher.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { useSocketConnection } from '../hooks/useSocket.js';

/**
 * Shared chrome for the three role dashboards: a sidebar that collapses to a
 * drawer on small screens, plus a header with language, notifications and
 * sign-out. `nav` is a list of { to, label, icon, end } entries.
 */
export function DashboardLayout({ nav, children, headerExtra }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Opened once here rather than per page, so navigating between screens
  // does not tear the connection down and build it back up.
  const { connected } = useSocketConnection();

  /* The active item gets a left marker rather than only a fill, so which
     screen you are on survives being glanced at rather than read. */
  const linkClass = ({ isActive }) =>
    `relative flex items-center gap-3 rounded-lg py-2.5 pr-3 pl-4 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-brand-50 text-brand-700 before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand-600'
        : 'text-ink-900/65 hover:bg-ink-900/[0.05] hover:text-ink-900'
    }`;

  const navList = (
    <nav className="space-y-1">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={linkClass}
          onClick={() => setDrawerOpen(false)}
        >
          <Icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-paper">
      {/* The app bar stays ink so the product reads as one thing from the
          landing page through to the dashboards. */}
      <header className="sticky top-0 z-30 bg-ink-900 text-white">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="btn-ghost p-2 text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label="Toggle navigation"
              aria-expanded={drawerOpen}
            >
              {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link to="/" className="flex items-center gap-2.5">
              <span className="rounded-lg bg-white/10 p-1.5 text-vital-300 ring-1 ring-white/15">
                <HeartPulse className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="font-display font-bold">{t('app.name')}</span>
            </Link>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {headerExtra}
            <NotificationBell connected={connected} />
            <LanguageSwitcher compact onDark />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="eyebrow text-white/40">{t(`roles.${user?.role}`)}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="btn-ghost p-2 text-white/80 hover:bg-white/10 hover:text-white"
              title={t('nav.logout')}
            >
              <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
              <span className="sr-only">{t('nav.logout')}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-60 shrink-0 border-r border-ink-900/10 bg-white p-4 lg:block">
          {navList}
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-20 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-ink-950/50"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
            />
            <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-white p-4 pt-20 shadow-xl">
              {navList}
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/** Standard page heading used across the dashboards. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-xl font-bold text-ink-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-900/62">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Consistent "nothing here yet" state instead of a blank panel. */
export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {Icon && <Icon className="h-10 w-10 text-ink-900/20" aria-hidden="true" />}
      <h3 className="font-display mt-3 font-semibold text-ink-900">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-ink-900/62">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
