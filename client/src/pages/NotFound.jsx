import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <FileQuestion className="mx-auto h-12 w-12 text-slate-400" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-slate-900">{t('errors.notFoundTitle')}</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-600">{t('errors.notFoundBody')}</p>
        <Link to="/" className="btn-primary mt-6 inline-flex">
          {t('errors.goHome')}
        </Link>
      </div>
    </div>
  );
}
