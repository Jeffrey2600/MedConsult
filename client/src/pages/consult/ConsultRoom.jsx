import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Video, Clock, AlertTriangle, MessageSquare, X, Captions, CaptionsOff,
} from 'lucide-react';

import { EmptyState } from '../../components/DashboardLayout.jsx';
import { FullPageSpinner } from '../../components/Spinner.jsx';
import { ChatPanel } from '../../components/ChatPanel.jsx';
import { AgoraStage, JitsiStage } from '../../components/VideoStage.jsx';
import { PatientRecordsPanel } from '../../components/PatientRecordsPanel.jsx';
import { PrescriptionForm } from '../../components/PrescriptionForm.jsx';
import { appointmentApi } from '../../api/appointments.js';
import { videoApi } from '../../api/notifications.js';
import { qk } from '../../lib/queryClient.js';
import { toApiError } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocketConnection, useSocketEvent } from '../../hooks/useSocket.js';
import { useLiveCaptions } from '../../hooks/useLiveCaptions.js';
import { formatDateTime, formatTime } from '../../lib/datetime.js';

/**
 * The consultation room.
 *
 * Credentials come from the server, which decides the provider: Agora when
 * its keys are configured, otherwise a Jitsi room. The page renders whichever
 * it is told, so switching provider needs no change here.
 */
export default function ConsultRoom() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const [peerJoined, setPeerJoined] = useState(false);
  const [panel, setPanel] = useState('chat');

  useSocketConnection();
  const captions = useLiveCaptions(id);

  const { data: appointmentData, isPending: loadingAppointment, isError } = useQuery({
    queryKey: qk.appointment(id),
    queryFn: () => appointmentApi.get(id),
  });

  const {
    data: credentials,
    isPending: loadingToken,
    error: tokenError,
  } = useQuery({
    queryKey: ['video-token', id],
    queryFn: () => videoApi.token(id),
    enabled: Boolean(appointmentData?.appointment),
    retry: false,
    // Tokens are short-lived; refetching keeps a long consultation alive.
    staleTime: 10 * 60_000,
  });

  useSocketEvent('call:participant-joined', (payload) => {
    if (String(payload.appointmentId) === String(id)) setPeerJoined(true);
  });

  const backTo = role === 'doctor' ? '/doctor/appointments' : '/patient/appointments';

  if (loadingAppointment) return <FullPageSpinner />;

  if (isError || !appointmentData?.appointment) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <EmptyState
          icon={Video}
          title={t('consult.unavailableTitle')}
          body={t('consult.unavailableBody')}
          action={<Link to={backTo} className="btn-primary">{t('nav.appointments')}</Link>}
        />
      </div>
    );
  }

  const appointment = appointmentData.appointment;
  const otherParty = role === 'doctor' ? appointment.patient : appointment.doctor;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={backTo} className="btn-ghost p-2" aria-label={t('nav.appointments')}>
              <ArrowLeft className="h-4.5 w-4.5" aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-semibold text-slate-900">
                {t('consult.withPerson', { name: otherParty?.name })}
              </h1>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatDateTime(appointment.startsAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {peerJoined && (
              <span className="badge bg-emerald-50 text-emerald-700">
                {t('consult.peerJoined')}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowChatOnMobile((v) => !v)}
              className="btn-secondary lg:hidden"
            >
              {showChatOnMobile ? <X className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              {showChatOnMobile ? t('common.close') : t('chat.title')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className={`lg:col-span-2 ${showChatOnMobile ? 'hidden lg:block' : ''}`}>
            {loadingToken && (
              <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-slate-900 text-slate-400">
                {t('video.preparing')}
              </div>
            )}

            {tokenError && (
              <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl bg-slate-900 p-6 text-center">
                <AlertTriangle className="h-10 w-10 text-amber-400" aria-hidden="true" />
                <p className="mt-3 font-semibold text-white">{t('video.cannotJoinTitle')}</p>
                <p className="mt-1.5 max-w-md text-sm text-slate-300">
                  {toApiError(tokenError).message}
                </p>
                <Link to={backTo} className="btn-secondary mt-5">{t('nav.appointments')}</Link>
              </div>
            )}

            {credentials?.provider === 'agora' && (
              <AgoraStage credentials={credentials} onLeave={() => navigate(backTo)} />
            )}

            {credentials?.provider === 'jitsi' && (
              <JitsiStage room={credentials.jitsiRoom} displayName={user?.name ?? ''} />
            )}

            {/* Neither video stage exposes the call's own audio to the page
                (Jitsi in particular is a cross-origin iframe), so captions
                are built from each side's own microphone instead — captured
                independently of whichever call is running, translated, and
                relayed to the other party. */}
            {credentials && captions.supported && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={captions.toggle}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        captions.enabled
                          ? 'bg-red-600 text-white'
                          : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                      }`}
                      aria-pressed={captions.enabled}
                    >
                      {captions.enabled ? (
                        <CaptionsOff className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Captions className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {captions.enabled ? t('captions.stop') : t('captions.start')}
                    </button>

                    {captions.enabled && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={captions.readAloud}
                          onChange={(e) => captions.setReadAloud(e.target.checked)}
                        />
                        {t('captions.readAloud')}
                      </label>
                    )}
                  </div>

                  {captions.enabled && captions.listening && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-red-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
                      {t('captions.listening')}
                    </span>
                  )}
                </div>

                {captions.enabled
                  && captions.errorCode
                  && !['unsupported', 'aborted', 'no-speech'].includes(captions.errorCode) && (
                  <p className="mt-2 text-xs text-red-600">
                    {captions.errorCode === 'denied' ? t('captions.micDenied') : t('captions.micError')}
                  </p>
                )}

                {captions.enabled && (
                  <p className="mt-2.5 min-h-[1.5rem] text-sm leading-relaxed text-slate-800">
                    {captions.incoming ? (
                      <>
                        <span className="font-medium">{captions.incoming.name}: </span>
                        {captions.incoming.translatedText || captions.incoming.text}
                      </>
                    ) : (
                      <span className="text-slate-400">{t('captions.waiting')}</span>
                    )}
                  </p>
                )}
              </div>
            )}

            {credentials && (
              <div className="card mt-4 p-4">
                <h2 className="text-sm font-semibold text-slate-900">{t('consult.details')}</h2>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex gap-2">
                    <dt className="text-slate-500">{t('consult.scheduled')}:</dt>
                    <dd className="text-slate-800">
                      {formatTime(appointment.startsAt)} – {formatTime(appointment.endsAt)}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-500">{t('consult.roomCloses')}:</dt>
                    <dd className="text-slate-800">{formatTime(credentials.windowClosesAt)}</dd>
                  </div>
                  {appointment.reason && (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500">{t('appointments.reason')}:</dt>
                      <dd className="text-slate-800">{appointment.reason}</dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>

          <aside
            className={`card flex min-h-[28rem] flex-col lg:col-span-1 lg:h-[36rem] ${
              showChatOnMobile ? '' : 'hidden lg:flex'
            }`}
          >
            {/* The doctor gets the patient's records and the prescription
                form alongside the chat; the patient only needs the chat. */}
            {role === 'doctor' && (
              <div className="flex gap-1 border-b border-slate-100 p-1.5" role="tablist">
                {['chat', 'records', 'prescription'].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={panel === value}
                    onClick={() => setPanel(value)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      panel === value
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t(`consult.tab_${value}`)}
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1">
              {(role !== 'doctor' || panel === 'chat') && <ChatPanel appointmentId={id} />}

              {role === 'doctor' && panel === 'records' && (
                <PatientRecordsPanel patientId={appointment.patient?._id} />
              )}

              {role === 'doctor' && panel === 'prescription' && (
                <PrescriptionForm
                  appointmentId={id}
                  existing={appointment.prescription}
                  onIssued={() => setPanel('chat')}
                />
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
