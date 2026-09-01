import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from './lib/queryClient.js';
import { AuthProvider } from './context/AuthContext.jsx';
import { RoleRoute, GuestRoute } from './components/RoleRoute.jsx';
import { FullPageSpinner } from './components/Spinner.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/auth/Login.jsx';
import NotFound from './pages/NotFound.jsx';

// Registration and the role dashboards are split out of the initial bundle —
// a visitor landing on the home page should not download the doctor console.
const RegisterPatient = lazy(() => import('./pages/auth/RegisterPatient.jsx'));
const RegisterDoctor = lazy(() => import('./pages/auth/RegisterDoctor.jsx'));
const PatientDashboard = lazy(() => import('./pages/patient/PatientDashboard.jsx'));
const DoctorDashboard = lazy(() => import('./pages/doctor/DoctorDashboard.jsx'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const ConsultRoom = lazy(() => import('./pages/consult/ConsultRoom.jsx'));

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              <Route path="/" element={<Landing />} />

              <Route element={<GuestRoute />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Navigate to="/register/patient" replace />} />
                <Route path="/register/patient" element={<RegisterPatient />} />
                <Route path="/register/doctor" element={<RegisterDoctor />} />
              </Route>

              <Route element={<RoleRoute allow={['patient']} />}>
                <Route path="/patient/*" element={<PatientDashboard />} />
              </Route>

              <Route element={<RoleRoute allow={['doctor']} />}>
                <Route path="/doctor/*" element={<DoctorDashboard />} />
              </Route>

              <Route element={<RoleRoute allow={['admin']} />}>
                <Route path="/admin/*" element={<AdminDashboard />} />
              </Route>

              {/* The consultation room is shared by both participants. */}
              <Route element={<RoleRoute allow={['patient', 'doctor']} />}>
                <Route path="/consult/:id" element={<ConsultRoom />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
