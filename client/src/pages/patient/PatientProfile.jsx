import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Siren, User, HeartPulse } from 'lucide-react';

import { PageHeader } from '../../components/DashboardLayout.jsx';
import { SkeletonList, Spinner } from '../../components/Spinner.jsx';
import { patientApi } from '../../api/sos.js';
import { authApi, configApi } from '../../api/auth.js';
import { toApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { toDateKey } from '../../lib/datetime.js';
import { CALLMEBOT, optInLink } from '../../lib/callmebot.js';

const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** Comma-separated text is the least fiddly way to edit a short list. */
const toList = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);
const fromList = (list) => (list ?? []).join(', ');

export default function PatientProfile() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(null);
  const [account, setAccount] = useState({ name: user?.name ?? '', phone: user?.phone ?? '' });

  const { data, isPending } = useQuery({
    queryKey: ['patient', 'profile'],
    queryFn: () => patientApi.profile(),
  });

  // Which WhatsApp provider is configured decides what the contact has to do.
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => configApi.get(),
    staleTime: 10 * 60_000,
  });
  const waProvider = config?.whatsappProvider ?? '';

  useEffect(() => {
    if (data?.profile && !form) {
      const p = data.profile;
      setForm({
        dateOfBirth: p.dateOfBirth ? toDateKey(p.dateOfBirth) : '',
        gender: p.gender ?? '',
        bloodGroup: p.bloodGroup ?? '',
        heightCm: p.heightCm ?? '',
        weightKg: p.weightKg ?? '',
        allergies: fromList(p.allergies),
        chronicConditions: fromList(p.chronicConditions),
        currentMedications: fromList(p.currentMedications),
        address: p.address ?? '',
        contactName: p.emergencyContact?.name ?? '',
        contactRelation: p.emergencyContact?.relation ?? '',
        contactEmail: p.emergencyContact?.email ?? '',
        contactWhatsapp: p.emergencyContact?.whatsappNumber ?? '',
        contactWhatsappKey: p.emergencyContact?.whatsappApiKey ?? '',
      });
    }
  }, [data, form]);

  const save = useMutation({
    mutationFn: async () => {
      await authApi.updateMe({ name: account.name, phone: account.phone });
      return patientApi.updateProfile({
        ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
        gender: form.gender,
        bloodGroup: form.bloodGroup,
        ...(form.heightCm !== '' ? { heightCm: Number(form.heightCm) } : {}),
        ...(form.weightKg !== '' ? { weightKg: Number(form.weightKg) } : {}),
        allergies: toList(form.allergies),
        chronicConditions: toList(form.chronicConditions),
        currentMedications: toList(form.currentMedications),
        address: form.address,
        emergencyContact: {
          name: form.contactName,
          relation: form.contactRelation,
          email: form.contactEmail,
          whatsappNumber: form.contactWhatsapp,
          whatsappApiKey: form.contactWhatsappKey,
        },
      });
    },
    onSuccess: () => {
      setMessage({ tone: 'ok', text: t('profile.saved') });
      queryClient.invalidateQueries({ queryKey: ['patient', 'profile'] });
      queryClient.invalidateQueries({ queryKey: ['sos', 'info'] });
      // The header and the SOS warning banner read from the session.
      refresh().catch(() => {});
    },
    onError: (err) => {
      const apiError = toApiError(err);
      const detail = apiError.details ? Object.values(apiError.details)[0] : null;
      setMessage({ tone: 'error', text: detail || apiError.message });
    },
  });

  if (isPending || !form) {
    return <><PageHeader title={t('nav.profile')} /><SkeletonList rows={3} /></>;
  }

  const field = (key, value) => setForm({ ...form, [key]: value });
  const hasContact = form.contactEmail || form.contactWhatsapp;

  return (
    <>
      <PageHeader title={t('nav.profile')} subtitle={t('profile.subtitle')} />

      {message && (
        <div
          role="status"
          className={`mb-4 rounded-lg border px-3.5 py-3 text-sm ${
            message.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-5">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <User className="h-4.5 w-4.5 text-slate-400" aria-hidden="true" />
            {t('profile.account')}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">{t('auth.fullName')}</label>
              <input id="name" className="input" value={account.name}
                onChange={(e) => setAccount({ ...account, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="phone">{t('auth.phone')}</label>
              <input id="phone" type="tel" className="input" value={account.phone}
                onChange={(e) => setAccount({ ...account, phone: e.target.value })} />
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <HeartPulse className="h-4.5 w-4.5 text-slate-400" aria-hidden="true" />
            {t('profile.medical')}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{t('profile.medicalHint')}</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label" htmlFor="dob">{t('auth.dateOfBirth')}</label>
              <input id="dob" type="date" className="input" max={toDateKey(new Date())}
                value={form.dateOfBirth} onChange={(e) => field('dateOfBirth', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="gender">{t('auth.gender')}</label>
              <select id="gender" className="input" value={form.gender}
                onChange={(e) => field('gender', e.target.value)}>
                <option value="">{t('common.notSpecified')}</option>
                <option value="male">{t('auth.genderMale')}</option>
                <option value="female">{t('auth.genderFemale')}</option>
                <option value="other">{t('auth.genderOther')}</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="blood">{t('patient.bloodGroup')}</label>
              <select id="blood" className="input" value={form.bloodGroup}
                onChange={(e) => field('bloodGroup', e.target.value)}>
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>{g || t('common.notSpecified')}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="height">{t('profile.height')}</label>
                <input id="height" type="number" min="0" max="300" className="input"
                  value={form.heightCm} onChange={(e) => field('heightCm', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="weight">{t('profile.weight')}</label>
                <input id="weight" type="number" min="0" max="500" className="input"
                  value={form.weightKg} onChange={(e) => field('weightKg', e.target.value)} />
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label className="label" htmlFor="allergies">{t('patient.allergies')}</label>
              <input id="allergies" className="input" placeholder={t('profile.commaSeparated')}
                value={form.allergies} onChange={(e) => field('allergies', e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">{t('profile.allergiesHint')}</p>
            </div>

            <div className="sm:col-span-2">
              <label className="label" htmlFor="conditions">{t('patient.conditions')}</label>
              <input id="conditions" className="input" placeholder={t('profile.commaSeparated')}
                value={form.chronicConditions} onChange={(e) => field('chronicConditions', e.target.value)} />
            </div>

            <div className="sm:col-span-2">
              <label className="label" htmlFor="meds">{t('records.currentMedications')}</label>
              <input id="meds" className="input" placeholder={t('profile.commaSeparated')}
                value={form.currentMedications} onChange={(e) => field('currentMedications', e.target.value)} />
            </div>
          </div>
        </section>

        <section className={`card p-5 ${hasContact ? '' : 'border-amber-300 bg-amber-50/40'}`}>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Siren className="h-4.5 w-4.5 text-red-500" aria-hidden="true" />
            {t('profile.emergencyContact')}
          </h2>
          <p className="mt-1 text-sm text-slate-600">{t('profile.emergencyHint')}</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="cname">{t('profile.contactName')}</label>
              <input id="cname" className="input" value={form.contactName}
                onChange={(e) => field('contactName', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="crel">{t('profile.contactRelation')}</label>
              <input id="crel" className="input" placeholder={t('profile.relationPlaceholder')}
                value={form.contactRelation} onChange={(e) => field('contactRelation', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="cemail">{t('profile.contactEmail')}</label>
              <input id="cemail" type="email" className="input" value={form.contactEmail}
                onChange={(e) => field('contactEmail', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="cwa">
                {t('profile.contactWhatsapp')} <span className="font-normal text-slate-400">({t('common.optional')})</span>
              </label>
              <input id="cwa" className="input" placeholder="919876543210" inputMode="numeric"
                value={form.contactWhatsapp} onChange={(e) => field('contactWhatsapp', e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">{t('profile.whatsappHint')}</p>
            </div>
          </div>

          {/* Instructions depend entirely on the provider: Twilio's consent
              is a sandbox join code, CallMeBot's is a key issued to the
              contact. Showing the wrong one wastes the person's time. */}
          {form.contactWhatsapp && waProvider === 'twilio' && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">
                {t('profile.twilioOptInTitle')}
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-slate-600">
                <li>{t('profile.twilioStep1')}</li>
                <li>{t('profile.twilioStep2')}</li>
                <li>{t('profile.twilioStep3')}</li>
              </ol>
              <p className="mt-2 text-xs text-slate-500">{t('profile.twilioCaveat')}</p>
            </div>
          )}

          {form.contactWhatsapp && waProvider === 'callmebot' && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <label className="label" htmlFor="cwakey">{t('profile.whatsappKey')}</label>
              <input
                id="cwakey"
                className="input sm:max-w-xs"
                placeholder="123456"
                inputMode="numeric"
                value={form.contactWhatsappKey}
                onChange={(e) => field('contactWhatsappKey', e.target.value)}
              />
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                <p className="font-semibold text-slate-800">{t('profile.whatsappOptInTitle')}</p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                  <li>{t('profile.whatsappStep1', { number: CALLMEBOT.displayNumber })}</li>
                  <li>
                    {t('profile.whatsappStep2')}{' '}
                    <code className="rounded bg-slate-200 px-1 py-0.5">{CALLMEBOT.optInMessage}</code>
                  </li>
                  <li>{t('profile.whatsappStep3')}</li>
                </ol>
                <a
                  href={optInLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary mt-3 py-1.5 text-xs"
                >
                  {t('profile.whatsappOpenOptIn')}
                </a>
                <p className="mt-2 text-slate-500">{t('profile.whatsappCaveat')}</p>
              </div>
            </div>
          )}

          {form.contactWhatsapp && !waProvider && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3.5 py-3 text-xs text-slate-600">
              {t('profile.whatsappOff')}
            </p>
          )}
        </section>

        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {save.isPending ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </>
  );
}
