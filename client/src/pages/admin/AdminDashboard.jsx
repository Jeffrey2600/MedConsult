import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, ShieldCheck, Stethoscope, Users, CalendarDays, Settings, Siren } from 'lucide-react';

import { DashboardLayout } from '../../components/DashboardLayout.jsx';
import AdminOverview from './AdminOverview.jsx';
import Verification from './Verification.jsx';
import SpecialtiesPage from './Specialties.jsx';
// Aliased — `Users` and `Settings` are also lucide icon names imported above.
import UsersPage from './Users.jsx';
import SettingsPage from './Settings.jsx';
import SosEvents from './SosEvents.jsx';
import Placeholder from '../Placeholder.jsx';

export default function AdminDashboard() {
  const { t } = useTranslation();

  const nav = [
    { to: '/admin', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
    { to: '/admin/verification', label: t('nav.verification'), icon: ShieldCheck },
    { to: '/admin/specialties', label: t('nav.specialties'), icon: Stethoscope },
    { to: '/admin/users', label: t('nav.users'), icon: Users },
    { to: '/admin/appointments', label: t('nav.appointments'), icon: CalendarDays },
    { to: '/admin/sos', label: t('nav.emergency'), icon: Siren },
    { to: '/admin/settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <DashboardLayout nav={nav}>
      <Routes>
        <Route index element={<AdminOverview />} />
        <Route path="verification" element={<Verification />} />
        <Route path="specialties" element={<SpecialtiesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="appointments" element={<Placeholder titleKey="nav.appointments" />} />
        <Route path="sos" element={<SosEvents />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
