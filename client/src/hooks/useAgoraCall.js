import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Manages one Agora call: join, publish local mic/camera, subscribe to the
 * remote participant, and tear everything down on the way out.
 *
 * The SDK is imported lazily so its ~400KB only downloads when someone
 * actually opens a consultation room, not on every page load.
 *
 * Joining is guarded by a token ref rather than a boolean: React StrictMode
 * runs effects twice in development, and Agora will throw if a second join
 * starts while the first is still in flight or has already succeeded.
 */
export function useAgoraCall({ appId, channel, token, uid, enabled }) {
  const [status, setStatus] = useState('idle'); // idle | joining | joined | error
  const [error, setError] = useState('');
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const clientRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });
  const localContainerRef = useRef(null);
  const joinKeyRef = useRef(null);

  const cleanup = useCallback(async () => {
    const client = clientRef.current;
    const { audio, video } = localTracksRef.current;

    try {
      if (client && audio && video) await client.unpublish([audio, video]).catch(() => {});
      audio?.stop();
      audio?.close();
      video?.stop();
      video?.close();
      localTracksRef.current = { audio: null, video: null };
      if (client) {
        client.removeAllListeners();
        await client.leave().catch(() => {});
      }
    } finally {
      clientRef.current = null;
      joinKeyRef.current = null;
      setRemoteUsers([]);
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    if (!enabled || !appId || !channel || !token) return undefined;

    // Identifies this specific call; a repeated effect run with the same
    // parameters must not join a second time.
    const joinKey = `${channel}:${uid}`;
    if (joinKeyRef.current === joinKey) return undefined;
    joinKeyRef.current = joinKey;

    let cancelled = false;

    (async () => {
      setStatus('joining');
      setError('');

      try {
        const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
        AgoraRTC.setLogLevel(3); // warnings and errors only

        if (cancelled) return;

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'audio') user.audioTrack?.play();
          setRemoteUsers((prev) => {
            const others = prev.filter((u) => u.uid !== user.uid);
            return [...others, user];
          });
        });

        client.on('user-unpublished', (user, mediaType) => {
          if (mediaType === 'video') {
            setRemoteUsers((prev) => [...prev.filter((u) => u.uid !== user.uid), user]);
          }
        });

        client.on('user-left', (user) => {
          setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
        });

        await client.join(appId, channel, token, uid);
        if (cancelled) return;

        // Camera/microphone permission is requested here. A refusal is a
        // normal outcome, not a crash — it surfaces as a readable message.
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        if (cancelled) {
          audioTrack.close();
          videoTrack.close();
          return;
        }

        localTracksRef.current = { audio: audioTrack, video: videoTrack };
        if (localContainerRef.current) videoTrack.play(localContainerRef.current);

        await client.publish([audioTrack, videoTrack]);
        if (cancelled) return;

        setStatus('joined');
      } catch (err) {
        if (cancelled) return;
        joinKeyRef.current = null;
        setStatus('error');
        setError(mapAgoraError(err));
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, appId, channel, token, uid, cleanup]);

  const toggleMic = useCallback(async () => {
    const track = localTracksRef.current.audio;
    if (!track) return;
    const next = !micOn;
    await track.setEnabled(next);
    setMicOn(next);
  }, [micOn]);

  const toggleCamera = useCallback(async () => {
    const track = localTracksRef.current.video;
    if (!track) return;
    const next = !cameraOn;
    await track.setEnabled(next);
    setCameraOn(next);
  }, [cameraOn]);

  const leave = useCallback(() => cleanup(), [cleanup]);

  return {
    status,
    error,
    remoteUsers,
    micOn,
    cameraOn,
    toggleMic,
    toggleCamera,
    leave,
    localContainerRef,
  };
}

/** Turns Agora's error codes into something a patient can act on. */
function mapAgoraError(err) {
  const code = err?.code || err?.name || '';
  const message = err?.message || String(err);

  if (/PERMISSION_DENIED|NotAllowedError/i.test(code + message)) {
    return 'camera-permission';
  }
  if (/NotFoundError|DEVICE_NOT_FOUND/i.test(code + message)) {
    return 'no-device';
  }
  if (/INVALID_TOKEN|token/i.test(code + message)) {
    return 'token';
  }
  if (/NETWORK|network|timeout/i.test(code + message)) {
    return 'network';
  }
  return 'generic';
}
