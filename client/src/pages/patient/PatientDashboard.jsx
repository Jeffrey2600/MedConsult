import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Search, CalendarDays, FileText, FolderHeart, Bot, Siren, User,
} from 'lucide-react';

import { DashboardLayout } from '../../components/DashboardLayout.jsx';
import PatientOverview from './PatientOverview.jsx';
import FindDoctors from './FindDoctors.jsx';
import DoctorProfilePage from './DoctorProfilePage.jsx';
import PatientAppointments from './PatientAppointments.jsx';
import HealthRecords from './HealthRecords.jsx';
import Emergency from './Emergency.jsx';
import SymptomChecker from './SymptomChecker.jsx';
import PatientProfile from './PatientProfile.jsx';
import PrescriptionList from '../PrescriptionList.jsx';
import Placeholder from '../Placeholder.jsx';

export default function PatientDashboard() {
  const { t } = useTranslation();

  const nav = [
    { to: '/patient', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
    { to: '/patient/doctors', label: t('nav.findDoctors'), icon: Search },
    { to: '/patient/appointments', label: t('nav.appointments'), icon: CalendarDays },
    { to: '/patient/prescriptions', label: t('nav.prescriptions'), icon: FileText },
    { to: '/patient/records', label: t('nav.records'), icon: FolderHeart },
    { to: '/patient/symptom-checker', label: t('nav.symptomChecker'), icon: Bot },
    { to: '/patient/emergency', label: t('nav.emergency'), icon: Siren },
    { to: '/patient/profile', label: t('nav.profile'), icon: User },
  ];

  return (
    <DashboardLayout nav={nav}>
      <Routes>
        <Route index element={<PatientOverview />} />
        <Route path="doctors" element={<FindDoctors />} />
        <Route path="doctors/:id" element={<DoctorProfilePage />} />
        <Route path="appointments" element={<PatientAppointments />} />
        <Route path="prescriptions" element={<PrescriptionList viewerRole="patient" />} />
        <Route path="records" element={<HealthRecords />} />
        <Route path="symptom-checker" element={<SymptomChecker />} />
        <Route path="emergency" element={<Emergency />} />
        <Route path="profile" element={<PatientProfile />} />
        <Route path="*" element={<Navigate to="/patient" replace />} />
      </Routes>
    </DashboardLayout>
  );
}
