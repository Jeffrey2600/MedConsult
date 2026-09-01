import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';

import { AuthLayout, FormError } from './AuthLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { toApiError } from '../../api/client.js';
import { specialtyApi } from '../../api/specialties.js';
import { qk } from '../../lib/queryClient.js';
import { Spinner } from '../../components/Spinner.jsx';
import { LANGUAGES } from '../../lib/i18n.js';

export default function RegisterDoctor() {
  const { t, i18n } = useTranslation();
  const { registerDoctor } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const { data: specialtyData, isLoading: loadingSpecialties } = useQuery({
    queryKey: qk.specialties,
    queryFn: () => specialtyApi.list(),
    staleTime: 10 * 60_000,
  });
  const specialties = specialtyData?.specialties ?? [];

  const schema = z
    .object({
      name: z.string().trim().min(2, t('validation.nameTooShort')),
      email: z.string().trim().min(1, t('validation.fieldRequired')).email(t('validation.emailInvalid')),
      password: z.string().min(8, t('validation.passwordTooShort')),
      confirmPassword: z.string().min(1, t('validation.fieldRequired')),
      phone: z.string().trim().optional(),
      specialty: z.string().min(1, t('validation.fieldRequired')),
      registrationNumber: z.string().trim().min(3, t('validation.fieldRequired')),
      qualifications: z.string().trim().optional(),
      experienceYears: z.coerce.number().min(0).max(70).optional(),
      consultationFee: z.coerce.number().min(0).optional(),
      languages: z.array(z.string()).optional(),
      bio: z.string().trim().max(2000).optional(),
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
    defaultValues: {
      name: '', email: '', password: '', confirmPassword: '', phone: '',
      specialty: '', registrationNumber: '', qualifications: '',
      experienceYears: 0, consultationFee: 0, languages: ['en'], bio: '',
    },
  });

  const onSubmit = async ({ confirmPassword, qualifications, ...values }) => {
    setServerError('');
    try {
      await registerDoctor({
        ...values,
        qualifications: qualifications
          ? qualifications.split(',').map((q) => q.trim()).filter(Boolean)
          : [],
        languages: values.languages?.length ? values.languages : ['en'],
        preferredLanguage: i18n.resolvedLanguage,
      });
      navigate('/doctor', { replace: true });
    } catch (err) {
      const apiError = toApiError(err);
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
      title={t('auth.registerAsDoctor')}
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
      <div className="mb-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t('auth.doctorPendingBody')}</p>
      </div>

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
          <label className="label" htmlFor="specialty">{t('auth.specialty')}</label>
          <select id="specialty" disabled={loadingSpecialties}
            className={`input ${errors.specialty ? 'input-error' : ''}`} {...register('specialty')}>
            <option value="">{loadingSpecialties ? t('common.loading') : t('auth.selectSpecialty')}</option>
            {specialties.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
          {errors.specialty && <p className="field-error">{errors.specialty.message}</p>}
        </div>

        <div>
          <label className="label" htmlFor="registrationNumber">{t('auth.registrationNumber')}</label>
          <input id="registrationNumber" className={`input ${errors.registrationNumber ? 'input-error' : ''}`}
            {...register('registrationNumber')} />
          {errors.registrationNumber && <p className="field-error">{errors.registrationNumber.message}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="qualifications">{t('auth.qualifications')}</label>
          <input id="qualifications" className="input" placeholder={t('auth.qualificationsHint')} {...register('qualifications')} />
        </div>

        <div>
          <label className="label" htmlFor="experienceYears">{t('auth.experienceYears')}</label>
          <input id="experienceYears" type="number" min="0" max="70" className="input" {...register('experienceYears')} />
        </div>

        <div>
          <label className="label" htmlFor="consultationFee">{t('auth.consultationFee')}</label>
          <input id="consultationFee" type="number" min="0" className="input" {...register('consultationFee')} />
        </div>

        <fieldset className="sm:col-span-2">
          <legend className="label">{t('auth.languagesSpoken')}</legend>
          <div className="flex flex-wrap gap-3">
            {LANGUAGES.map((lang) => (
              <label key={lang.code} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <input type="checkbox" value={lang.code} className="accent-brand-600" {...register('languages')} />
                {lang.native}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="bio">{t('auth.bio')}</label>
          <textarea id="bio" rows={3} className="input" placeholder={t('auth.bioHint')} {...register('bio')} />
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
