import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const TICKS = [0, 6, 12, 18];
const MAX_ROWS = 6;

const pad = (n) => String(n).padStart(2, '0');

/**
 * The landing hero's centrepiece: a night-shift board reporting what the
 * platform actually knows right now.
 *
 * Everything on it is true. The hour strip is the booking window, which really
 * is unrestricted — slots come from each doctor's own published rules and the
 * server applies no time-of-day gate, so all twenty-four hours are genuinely
 * open. The rows are the live specialty list with real verified-doctor counts.
 * Nothing here is a mock-up of availability the app cannot vouch for, because
 * a patient reading "cardiology, 03:00" as a promise is a real harm.
 */
export function OnCallBoard({ specialties = [], loading = false }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const currentHour = now.getHours();
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const rows = [...specialties]
    .sort((a, b) => (b.doctorCount ?? 0) - (a.doctorCount ?? 0))
    .slice(0, MAX_ROWS);
  const busiest = Math.max(1, ...rows.map((s) => s.doctorCount ?? 0));
  const totalDoctors = specialties.reduce((sum, s) => sum + (s.doctorCount ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-950/60 backdrop-blur-sm">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 px-4 py-3 sm:px-5">
        <span className="flex items-center gap-2.5">
          <span
            className="anim-pulse-vital h-2 w-2 rounded-full bg-vital-300"
            aria-hidden="true"
          />
          <span className="eyebrow text-vital-300">{t('board.bookingOpen')}</span>
        </span>
        {/* The visitor's own clock. A board that ticks is the shortest way to
            say the service is not waiting for morning. */}
        <span className="font-mono text-sm tabular-nums text-white/70">
          {clock}
          <span className="ml-2 text-white/35">{t('board.yourTime')}</span>
        </span>
      </div>

      {/* The booking window: all twenty-four hours, with the visitor's current
          hour called out so the claim is anchored to their real time. */}
      <div className="px-4 pt-4 sm:px-5">
        <p className="eyebrow text-white/40">{t('board.window')}</p>
        <div className="mt-2.5 flex items-end gap-[3px]" role="presentation">
          {HOURS.map((h) => {
            const isNow = h === currentHour;
            return (
              <span
                key={h}
                style={{ animationDelay: `${h * 22}ms` }}
                className={`anim-segment flex-1 origin-bottom rounded-[2px] ${
                  isNow ? 'h-7 bg-vital-300' : 'h-4 bg-vital-400/25'
                }`}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[0.625rem] text-white/30">
          {TICKS.map((h) => (
            <span key={h}>{pad(h)}</span>
          ))}
          <span>24</span>
        </div>
      </div>

      {/* Specialty depth */}
      <div className="mt-5 border-t border-white/10 px-4 py-4 sm:px-5">
        <p className="eyebrow text-white/40">{t('board.bySpecialisation')}</p>

        {loading && (
          <div className="mt-3 space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-white/[0.07]" />
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <p className="mt-3 text-sm text-white/45">{t('board.noSpecialties')}</p>
        )}

        {!loading && rows.length > 0 && (
          <ul className="mt-3 space-y-2">
            {rows.map((s, i) => {
              const count = s.doctorCount ?? 0;
              return (
                <li
                  key={s._id}
                  style={{ animationDelay: `${600 + i * 70}ms` }}
                  className="anim-rise grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,11rem)_1fr_auto]"
                >
                  <span className="truncate text-sm text-white/85">{s.name}</span>
                  {/* Bench depth, relative to the deepest specialty. */}
                  <span
                    className="col-span-2 h-1 overflow-hidden rounded-full bg-white/[0.08] sm:order-none sm:col-span-1"
                    aria-hidden="true"
                  >
                    <span
                      className={`block h-full rounded-full ${count ? 'bg-vital-400' : 'bg-transparent'}`}
                      style={{ width: `${Math.round((count / busiest) * 100)}%` }}
                    />
                  </span>
                  <span className="font-mono text-xs tabular-nums text-white/50">
                    {count || '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Totals */}
      <div className="border-t border-white/10 px-4 py-3 font-mono text-[0.6875rem] tracking-wide text-white/40 sm:px-5">
        {t('board.summary', { specialties: specialties.length, doctors: totalDoctors })}
      </div>
    </div>
  );
}
