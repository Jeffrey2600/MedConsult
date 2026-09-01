import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Video, FileText, User, Stethoscope } from 'lucide-react';

import { friendlyDate, formatTime, canJoinCall } from '../lib/datetime.js';

const STATUS_TONE = {
  pending: 'bg-amber-50 text-amber-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
  completed: 'bg-brand-50 text-brand-700',
};

/**
 * One appointment row, shared by the patient and doctor lists. `viewerRole`
 * decides whose name is shown and which actions are offered — the underlying
 * record is the same on both sides.
 */
export function AppointmentCard({ appointment, viewerRole, actions }) {
  const { t } = useTranslation();

  const isDoctorView = viewerRole === 'doctor';
  const otherParty = isDoctorView ? appointment.patient : appointment.doctor;
  const joinable = canJoinCall(appointment);

  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500">
            {isDoctorView ? (
              <User className="h-4.5 w-4.5" aria-hidden="true" />
            ) : (
              <Stethoscope className="h-4.5 w-4.5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900">{otherParty?.name}</h3>
            {!isDoctorView && appointment.doctorProfile?.specialty?.name && (
              <p className="text-sm text-brand-700">
                {appointment.doctorProfile.specialty.name}
              </p>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-600">
              <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="font-medium text-slate-800">
                {friendlyDate(appointment.startsAt, t)}
              </span>
              <span>
                {formatTime(appointment.startsAt)} – {formatTime(appointment.endsAt)}
              </span>
            </p>
          </div>
        </div>

        <span className={`badge ${STATUS_TONE[appointment.status]}`}>
          {t(`status.${appointment.status}`)}
        </span>
      </div>

      {appointment.reason && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="font-medium text-slate-500">{t('appointments.reason')}: </span>
          {appointment.reason}
        </p>
      )}

      {appointment.rejectionReason && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="font-medium">{t('appointments.declinedReason')}: </span>
          {appointment.rejectionReason}
        </p>
      )}

      {appointment.cancellationReason && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <span className="font-medium">{t('appointments.cancelledReason')}: </span>
          {appointment.cancellationReason}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {joinable && (
          <Link to={`/consult/${appointment._id}`} className="btn-primary">
            <Video className="h-4 w-4" aria-hidden="true" />
            {t('appointments.joinCall')}
          </Link>
        )}

        {appointment.hasPrescription && (
          <Link
            to={
              isDoctorView
                ? `/doctor/prescriptions?appointment=${appointment._id}`
                : `/patient/prescriptions?appointment=${appointment._id}`
            }
            className="btn-secondary"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {t('appointments.viewPrescription')}
          </Link>
        )}

        {actions}
      </div>

      {appointment.status === 'accepted' && !joinable && (
        <p className="mt-2.5 text-xs text-slate-500">{t('appointments.joinWindowHint')}</p>
      )}
    </article>
  );
}
