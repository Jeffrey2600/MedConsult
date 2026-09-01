import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { FullPageSpinner } from './Spinner.jsx';

export const HOME_FOR_ROLE = {
  patient: '/patient',
  doctor: '/doctor',
  admin: '/admin',
};

/**
 * Route guard. Waits for the session restore to finish before deciding, so a
 * refresh on a protected page does not bounce the user to the login screen.
 *
 * This is a convenience layer, not the security boundary — every protected
 * endpoint is independently guarded on the server.
 */
export function RoleRoute({ allow }) {
  const { status, role } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;

  if (status !== 'authenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allow && !allow.includes(role)) {
    return <Navigate to={HOME_FOR_ROLE[role] ?? '/'} replace />;
  }

  return <Outlet />;
}

/** Keeps a signed-in user away from the login/register screens. */
export function GuestRoute() {
  const { status, role } = useAuth();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') {
    return <Navigate to={HOME_FOR_ROLE[role] ?? '/'} replace />;
  }
  return <Outlet />;
}
