import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { LANGUAGES } from '../lib/i18n.js';
import { useAuth } from '../context/AuthContext.jsx';
import { authApi } from '../api/auth.js';

/**
 * Switches the interface language. When someone is signed in the choice is
 * also written to their account, so emails and their next device match.
 */
export function LanguageSwitcher({ compact = false, onDark = false }) {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  const handleChange = async (event) => {
    const code = event.target.value;
    await i18n.changeLanguage(code);
    if (isAuthenticated && user?.preferredLanguage !== code) {
      authApi.updateMe({ preferredLanguage: code }).catch(() => {
        // A failed preference save must not undo the visible change.
      });
    }
  };

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">{t('nav.language')}</span>
      {/* The icon is redundant next to a select that already shows a language
          name, so it is the first thing to go when width is tight. */}
      <Globe
        className={`h-4 w-4 ${compact ? 'hidden sm:block' : ''} ${
          onDark ? 'text-white/50' : 'text-ink-900/45'
        }`}
        aria-hidden="true"
      />
      <select
        value={i18n.resolvedLanguage}
        onChange={handleChange}
        className={`rounded-lg border py-1.5 text-sm
                    focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none
                    ${compact ? 'px-2' : 'px-3'}
                    ${onDark
                      ? 'border-white/20 bg-white/10 text-white hover:border-white/35'
                      : 'border-ink-900/15 bg-white text-ink-800'}`}
      >
        {LANGUAGES.map((lang) => (
          /* Options render in the OS dropdown, which does not inherit the
             dark trigger's colours on any platform — so they stay dark-on-
             light regardless of where the switcher sits. */
          <option key={lang.code} value={lang.code} className="bg-white text-ink-900">
            {lang.native}
          </option>
        ))}
      </select>
    </label>
  );
}
