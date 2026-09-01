import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, CalendarDays, CalendarClock, Users, FileText, User } from 'lucide-react';

import { DashboardLayout } from '../../components/DashboardLayout.jsx';
import DoctorOverview from './DoctorOverview.jsx';
import DoctorAppointments from './DoctorAppointments.jsx';
import Availability from './Availability.jsx';
import Patients from './Patients.jsx';
import PrescriptionList from '../PrescriptionList.jsx';
import Placeholder from '../Placeholder.jsx';

export default function DoctorDashboard() {
  const { t } = useTranslation();

  const nav = [
    { to: '/doctor', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
    { to: '/doctor/appointments', label: t('nav.appointments'), icon: CalendarDays },
    { to: '/doctor/availability', label: t('nav.availability'), icon: CalendarClock },
    { to: '/doctor/patients', label: t('nav.patients'), icon: Users },
    { to: '/doctor/prescriptions', label: t('nav.prescriptions'), icon: FileText },
    { to: '/doctor/profile', label: t('nav.profile'), icon: User },
  ];

  return (
    <DashboardLayout nav={nav}>
      <Routes>
        <Route index element={<DoctorOverview />} />
        <Route path="appointments" element={<DoctorAppointments />} />
        <Route path="availability" element={<Availability />} />
        <Route path="patients" element={<Patients />} />
        <Route path="prescriptions" element={<PrescriptionList viewerRole="doctor" />} />
        <Route path="profile" element={<Placeholder titleKey="nav.profile" />} />
        <Route path="*" element={<Navigate to="/doctor" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
