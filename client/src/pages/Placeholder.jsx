import { useTranslation } from 'react-i18next';
import { Hammer } from 'lucide-react';
import { PageHeader, EmptyState } from '../components/DashboardLayout.jsx';

/**
 * Temporary stand-in for a screen that is routed but not yet built. Keeping
 * the route wired from the start means navigation, guards and the sidebar can
 * be tested before every page exists.
 */
export default function Placeholder({ titleKey }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <EmptyState
        icon={Hammer}
        title={t('common.comingSoonTitle')}
        body={t('common.comingSoonBody')}
      />
    </>
  );
}
