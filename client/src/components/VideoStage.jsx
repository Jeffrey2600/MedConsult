import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff, VideoIcon, VideoOff, PhoneOff, Loader2, UserRound } from 'lucide-react';

import { useAgoraCall } from '../hooks/useAgoraCall.js';

/** Plays one remote participant's video into its own container element. */
function RemoteVideo({ user }) {
  const ref = useRef(null);

  useEffect(() => {
    const track = user.videoTrack;
    if (track && ref.current) track.play(ref.current);
    return () => track?.stop();
  }, [user, user.videoTrack]);

  return <div ref={ref} className="h-full w-full [&>div]:!bg-slate-900 [&_video]:!object-cover" />;
}

export function AgoraStage({ credentials, onLeave }) {
  const { t } = useTranslation();
  const {
    status, error, remoteUsers, micOn, cameraOn,
    toggleMic, toggleCamera, leave, localContainerRef,
  } = useAgoraCall({
    appId: credentials.appId,
    channel: credentials.channel,
    token: credentials.token,
    uid: credentials.uid,
    enabled: true,
  });

  const remote = remoteUsers[0];
  const remoteHasVideo = Boolean(remote?.videoTrack);

  const handleLeave = async () => {
    await leave();
    onLeave?.();
  };

  if (status === 'error') {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl bg-slate-900 p-6 text-center text-white">
        <VideoOff className="h-10 w-10 text-slate-500" aria-hidden="true" />
        <p className="mt-3 font-semibold">{t(`video.error_${error}_title`, t('video.error_generic_title'))}</p>
        <p className="mt-1.5 max-w-md text-sm text-slate-300">
          {t(`video.error_${error}_body`, t('video.error_generic_body'))}
        </p>
        <button type="button" onClick={handleLeave} className="btn-secondary mt-5">
          {t('video.leave')}
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-slate-900">
      <div className="relative aspect-video w-full">
        {/* Remote participant fills the stage. */}
        {remoteHasVideo ? (
          <RemoteVideo user={remote} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-slate-400">
            {status === 'joining' ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
                <p className="mt-3 text-sm">{t('video.joining')}</p>
              </>
            ) : (
              <>
                <UserRound className="h-10 w-10" aria-hidden="true" />
                <p className="mt-3 text-sm">{t('video.waitingForOther')}</p>
              </>
            )}
          </div>
        )}

        {/* Own camera, picture-in-picture. */}
        <div className="absolute bottom-3 right-3 h-24 w-32 overflow-hidden rounded-lg border-2 border-slate-700 bg-slate-800 sm:h-32 sm:w-44">
          <div
            ref={localContainerRef}
            className="h-full w-full [&>div]:!bg-slate-800 [&_video]:!object-cover"
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-slate-400">
              <VideoOff className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-slate-800 py-3">
        <button
          type="button"
          onClick={toggleMic}
          disabled={status !== 'joined'}
          className={`rounded-full p-3 transition-colors disabled:opacity-40 ${
            micOn ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-red-600 text-white hover:bg-red-700'
          }`}
          aria-label={micOn ? t('video.muteMic') : t('video.unmuteMic')}
          aria-pressed={!micOn}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>

        <button
          type="button"
          onClick={toggleCamera}
          disabled={status !== 'joined'}
          className={`rounded-full p-3 transition-colors disabled:opacity-40 ${
            cameraOn ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-red-600 text-white hover:bg-red-700'
          }`}
          aria-label={cameraOn ? t('video.stopCamera') : t('video.startCamera')}
          aria-pressed={!cameraOn}
        >
          {cameraOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </button>

        <button
          type="button"
          onClick={handleLeave}
          className="rounded-full bg-red-600 px-5 py-3 text-white transition-colors hover:bg-red-700"
          aria-label={t('video.leave')}
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Zero-configuration fallback. meet.jit.si needs no account, no key and has
 * no quota, so the consultation still works if Agora is unconfigured or its
 * free minutes run out mid-demo.
 */
export function JitsiStage({ room, displayName }) {
  const { t } = useTranslation();
  const src =
    `https://meet.jit.si/${encodeURIComponent(room)}` +
    `#userInfo.displayName=${encodeURIComponent(`"${displayName}"`)}` +
    '&config.prejoinPageEnabled=false';

  return (
    <div className="overflow-hidden rounded-xl bg-slate-900">
      <iframe
        title={t('video.title')}
        src={src}
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        className="aspect-video w-full border-0"
      />
      <p className="border-t border-slate-800 px-4 py-2.5 text-xs text-slate-400">
        {t('video.jitsiNote')}
      </p>
    </div>
  );
}
