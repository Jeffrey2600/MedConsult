import { useState, useCallback } from 'react';

/**
 * Wraps the browser Geolocation API.
 *
 * Refusing location is a normal outcome, not an error state to panic about —
 * the emergency screen still shows the ambulance number and can still alert
 * the contact, just without coordinates. The reason is returned as a code so
 * the UI can explain what happened in the user's own language.
 */
export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | locating | ready | error
  const [errorCode, setErrorCode] = useState(null);

  const locate = useCallback(
    () =>
      new Promise((resolve) => {
        if (!('geolocation' in navigator)) {
          setStatus('error');
          setErrorCode('unsupported');
          return resolve(null);
        }

        setStatus('locating');
        setErrorCode(null);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const next = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracyMeters: Math.round(pos.coords.accuracy),
            };
            setPosition(next);
            setStatus('ready');
            resolve(next);
          },
          (err) => {
            const codes = {
              1: 'denied',
              2: 'unavailable',
              3: 'timeout',
            };
            setStatus('error');
            setErrorCode(codes[err.code] ?? 'unknown');
            resolve(null);
          },
          {
            enableHighAccuracy: true,
            // A rough fix now beats a precise one later in an emergency.
            timeout: 10_000,
            maximumAge: 60_000,
          }
        );
      }),
    []
  );

  return { position, status, errorCode, locate };
}
