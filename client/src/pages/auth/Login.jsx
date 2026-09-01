import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';

import { AuthLayout, FormError } from './AuthLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { toApiError } from '../../api/client.js';
import { HOME_FOR_ROLE } from '../../components/RoleRoute.jsx';
import { Spinner } from '../../components/Spinner.jsx';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const schema = z.object({
    email: z.string().trim().min(1, t('validation.fieldRequired')).email(t('validation.emailInvalid')),
    password: z.string().min(1, t('validation.fieldRequired')),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = async (values) => {
    setServerError('');
    try {
      const data = await login(values);
      // Send the user straight back to whatever they were trying to reach.
      const intended = location.state?.from?.pathname;
      navigate(intended || HOME_FOR_ROLE[data.user.role] || '/', { replace: true });
    } catch (err) {
      setServerError(toApiError(err).message);
    }
  };

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register/patient" className="font-semibold text-brand-700 hover:underline">
            {t('auth.signUpPatient')}
          </Link>
          <span className="mx-1.5 text-slate-400">·</span>
          <Link to="/register/doctor" className="font-semibold text-brand-700 hover:underline">
            {t('auth.signUpDoctor')}
          </Link>
        </>
      }
    >
      <FormError message={serverError} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            {t('auth.email')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('auth.emailPlaceholder')}
            className={`input ${errors.email ? 'input-error' : ''}`}
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </div>

        <div>
          <label className="label" htmlFor="password">
            {t('auth.password')}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={`input pr-11 ${errors.password ? 'input-error' : ''}`}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting && <Spinner className="h-4 w-4" />}
          {isSubmitting ? t('auth.loggingIn') : t('auth.login')}
        </button>
      </form>
    </AuthLayout>
  );
}
