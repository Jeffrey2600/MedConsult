import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Star, Briefcase, Languages, IndianRupee, CalendarX,
  CheckCircle2, Clock, UserX,
} from 'lucide-react';

import { PageHeader, EmptyState } from '../../components/DashboardLayout.jsx';
import { SkeletonList, Spinner } from '../../components/Spinner.jsx';
import { doctorApi } from '../../api/doctors.js';
import { availabilityApi, appointmentApi } from '../../api/appointments.js';
import { qk } from '../../lib/queryClient.js';
import { toApiError } from '../../api/client.js';
import { LANGUAGES } from '../../lib/i18n.js';
import { dayjs, formatTime, toDateKey, localTimezone } from '../../lib/datetime.js';

export default function DoctorProfilePage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  // Once the patient picks a day themselves, stop auto-jumping.
  const datePickedManually = useRef(false);

  const { data: doctorData, isPending: loadingDoctor, isError } = useQuery({
    queryKey: qk.doctor(id),
    queryFn: () => doctorApi.get(id),
  });

  // Which of the next 14 days have free slots — drives the date strip so a
  // patient never clicks into an empty day.
  const { data: summaryData } = useQuery({
    queryKey: ['slot-summary', id],
    queryFn: () => availabilityApi.slotSummary(id, 14),
  });

  const { data: slotData, isFetching: loadingSlots } = useQuery({
    queryKey: qk.slots(id, selectedDate),
    queryFn: () => availabilityApi.slots(id, selectedDate),
    enabled: Boolean(selectedDate),
  });

  /**
   * Today is usually part-spent, so opening on it would show a column of
   * struck-through times. Jump to the first day that actually has a free slot
   * unless the patient has already chosen a day for themselves.
   */
  useEffect(() => {
    if (datePickedManually.current) return;
    const days = summaryData?.days;
    if (!days?.length) return;

    const today = days.find((d) => d.date === selectedDate);
    if (today && today.available > 0) return;

    const firstOpen = days.find((d) => d.available > 0);
    if (firstOpen && firstOpen.date !== selectedDate) setSelectedDate(firstOpen.date);
  }, [summaryData, selectedDate]);

  const book = useMutation({
    mutationFn: () =>
      appointmentApi.create({ doctorId: id, startsAt: selectedSlot.startsAt, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: qk.slots(id, selectedDate) });
      queryClient.invalidateQueries({ queryKey: ['slot-summary', id] });
      navigate('/patient/appointments?booked=1');
    },
    onError: (err) => {
      setError(toApiError(err).message);
      // The slot may have just been taken by someone else — refresh so the
      // calendar reflects reality rather than showing a stale free slot.
      queryClient.invalidateQueries({ queryKey: qk.slots(id, selectedDate) });
      setSelectedSlot(null);
    },
  });

  if (loadingDoctor) return <><PageHeader title={t('common.loading')} /><SkeletonList rows={2} /></>;

  if (isError || !doctorData?.doctor) {
    return (
      <EmptyState
        icon={UserX}
        title={t('search.noResultsTitle')}
        body={t('doctorProfile.notFound')}
        action={<Link to="/patient/doctors" className="btn-primary">{t('nav.findDoctors')}</Link>}
      />
    );
  }

  const doctor = doctorData.doctor;
  const days = summaryData?.days ?? [];
  const slots = slotData?.slots ?? [];
  const availableSlots = slots.filter((s) => s.available);

  const spokenLanguages = (doctor.languages ?? [])
    .map((code) => LANGUAGES.find((l) => l.code === code)?.native)
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <Link to="/patient/doctors" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('nav.findDoctors')}
      </Link>

      <PageHeader title={doctor.user?.name} subtitle={doctor.specialty?.name} />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-1">
          <dl className="space-y-3 text-sm">
            {doctor.ratingCount > 0 && (
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
                <dd>
                  <span className="font-semibold text-slate-900">{doctor.ratingAverage.toFixed(1)}</span>
                  <span className="text-slate-500"> ({doctor.ratingCount})</span>
                </dd>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <dd className="text-slate-700">
                {t('doctor.yearsShort', { count: doctor.experienceYears })} {t('search.experienceSuffix')}
              </dd>
            </div>
            {spokenLanguages && (
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <dd className="text-slate-700">{spokenLanguages}</dd>
              </div>
            )}
            {doctor.consultationFee > 0 && (
              <div className="flex items-center gap-2">
                <IndianRupee className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <dd className="text-slate-700">{doctor.consultationFee}</dd>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <dd className="text-slate-700">
                {t('doctorProfile.consultations', { count: doctor.completedConsultations ?? 0 })}
              </dd>
            </div>
          </dl>

          {doctor.qualifications?.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h2 className="text-sm font-semibold text-slate-900">{t('auth.qualifications')}</h2>
              <p className="mt-1 text-sm text-slate-600">{doctor.qualifications.join(', ')}</p>
            </div>
          )}

          {doctor.bio && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h2 className="text-sm font-semibold text-slate-900">{t('doctorProfile.about')}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{doctor.bio}</p>
            </div>
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">{t('doctorProfile.pickSlot')}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {t('doctorProfile.timezoneNote', { zone: localTimezone() })}
          </p>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {days.map((day) => {
              const isSelected = day.date === selectedDate;
              const disabled = day.available === 0;
              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    datePickedManually.current = true;
                    setSelectedDate(day.date);
                    setSelectedSlot(null);
                    setError('');
                  }}
                  className={`flex min-w-16 shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : disabled
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300'
                        : 'border-slate-300 text-slate-700 hover:border-brand-400 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xs">{dayjs(day.date).format('ddd')}</span>
                  <span className="text-base font-semibold">{dayjs(day.date).format('D')}</span>
                  <span className="text-xs">
                    {day.available > 0 ? t('doctorProfile.freeCount', { count: day.available }) : '—'}
                  </span>
                </button>
              );
            })}
          </div>

          {loadingSlots && <p className="mt-5 text-sm text-slate-500">{t('common.loading')}</p>}

          {!loadingSlots && slots.length === 0 && (
            <div className="mt-5 flex items-center gap-2.5 rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-600">
              <CalendarX className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              {slotData?.isBlocked ? t('doctorProfile.dateBlocked') : t('doctorProfile.noSlotsThisDay')}
            </div>
          )}

          {!loadingSlots && slots.length > 0 && (
            <>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => {
                  const isSelected = selectedSlot?.startsAt === slot.startsAt;
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => { setSelectedSlot(slot); setError(''); }}
                      title={!slot.available ? t(`doctorProfile.slot_${slot.reason}`) : undefined}
                      className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                        isSelected
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : slot.available
                            ? 'border-slate-300 text-slate-700 hover:border-brand-400 hover:bg-brand-50'
                            : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 line-through'
                      }`}
                    >
                      {formatTime(slot.startsAt)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {t('doctorProfile.slotsFree', { count: availableSlots.length, total: slots.length })}
              </p>
            </>
          )}

          {error && (
            <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {selectedSlot && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <label className="label" htmlFor="reason">{t('doctorProfile.reasonLabel')}</label>
              <textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input"
                maxLength={1000}
                placeholder={t('doctorProfile.reasonPlaceholder')}
              />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={book.isPending}
                  onClick={() => { setError(''); book.mutate(); }}
                >
                  {book.isPending && <Spinner className="h-4 w-4" />}
                  {t('doctorProfile.confirmBooking', {
                    time: formatTime(selectedSlot.startsAt),
                    date: dayjs(selectedSlot.startsAt).format('D MMM'),
                  })}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setSelectedSlot(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
