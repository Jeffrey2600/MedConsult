import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';

import { AuthLayout, FormError } from './AuthLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { toApiError } from '../../api/client.js';
import { Spinner } from '../../components/Spinner.jsx';

export default function RegisterPatient() {
  const { t, i18n } = useTranslation();
  const { registerPatient } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const schema = z
    .object({
      name: z.string().trim().min(2, t('validation.nameTooShort')),
      email: z.string().trim().min(1, t('validation.fieldRequired')).email(t('validation.emailInvalid')),
      password: z.string().min(8, t('validation.passwordTooShort')),
      confirmPassword: z.string().min(1, t('validation.fieldRequired')),
      phone: z.string().trim().optional(),
      dateOfBirth: z.string().optional(),
      gender: z.enum(['male', 'female', 'other', '']).optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.passwordsDoNotMatch'),
      path: ['confirmPassword'],
    });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '', phone: '', dateOfBirth: '', gender: '' },
  });

  const onSubmit = async ({ confirmPassword, dateOfBirth, ...values }) => {
    setServerError('');
    try {
      await registerPatient({
        ...values,
        ...(dateOfBirth ? { dateOfBirth } : {}),
        preferredLanguage: i18n.resolvedLanguage,
      });
      navigate('/patient', { replace: true });
    } catch (err) {
      const apiError = toApiError(err);
      // Surface the server's per-field messages on the matching inputs.
      if (apiError.details) {
        for (const [field, message] of Object.entries(apiError.details)) {
          setError(field, { message });
        }
      }
      setServerError(apiError.message);
    }
  };

  return (
    <AuthLayout
      title={t('auth.registerAsPatient')}
      subtitle={t('app.tagline')}
      wide
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            {t('auth.login')}
          </Link>
        </>
      }
    >
      <FormError message={serverError} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">{t('auth.fullName')}</label>
          <input id="name" className={`input ${errors.name ? 'input-error' : ''}`} autoComplete="name" {...register('name')} />
          {errors.name && <p className="field-error">{errors.name.message}</p>}
        </div>

        <div>
          <label className="label" htmlFor="email">{t('auth.email')}</label>
          <input id="email" type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')}
            className={`input ${errors.email ? 'input-error' : ''}`} {...register('email')} />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </div>

        <div>
          <label className="label" htmlFor="phone">
            {t('auth.phone')} <span className="font-normal text-slate-400">({t('common.optional')})</span>
          </label>
          <input id="phone" type="tel" autoComplete="tel" className="input" {...register('phone')} />
        </div>

        <div>
          <label className="label" htmlFor="password">{t('auth.password')}</label>
          <input id="password" type="password" autoComplete="new-password" placeholder={t('auth.passwordPlaceholder')}
            className={`input ${errors.password ? 'input-error' : ''}`} {...register('password')} />
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </div>

        <div>
          <label className="label" htmlFor="confirmPassword">{t('auth.confirmPassword')}</label>
          <input id="confirmPassword" type="password" autoComplete="new-password"
            className={`input ${errors.confirmPassword ? 'input-error' : ''}`} {...register('confirmPassword')} />
          {errors.confirmPassword && <p className="field-error">{errors.confirmPassword.message}</p>}
        </div>

        <div>
          <label className="label" htmlFor="dateOfBirth">
            {t('auth.dateOfBirth')} <span className="font-normal text-slate-400">({t('common.optional')})</span>
          </label>
          <input id="dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} className="input" {...register('dateOfBirth')} />
        </div>

        <div>
          <label className="label" htmlFor="gender">
            {t('auth.gender')} <span className="font-normal text-slate-400">({t('common.optional')})</span>
          </label>
          <select id="gender" className="input" {...register('gender')}>
            <option value="">{t('common.notSpecified')}</option>
            <option value="male">{t('auth.genderMale')}</option>
            <option value="female">{t('auth.genderFemale')}</option>
            <option value="other">{t('auth.genderOther')}</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting && <Spinner className="h-4 w-4" />}
            {isSubmitting ? t('auth.registering') : t('auth.register')}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
