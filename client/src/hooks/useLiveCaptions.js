import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getSocket } from '../lib/socket.js';
import { useSocketEvent } from './useSocket.js';
import { useSpeechRecognition } from './useSpeechRecognition.js';

/** Same BCP-47 mapping as speech recognition, reused for speech synthesis. */
const TTS_LOCALE = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN', te: 'te-IN', ml: 'ml-IN' };

/**
 * Live translated captions for a video consultation. Each side transcribes
 * its OWN microphone locally and sends finished phrases to the server,
 * which translates and relays them to the other party — this hook both
 * sends (from local speech) and receives (from the socket) for whichever
 * appointment is passed in.
 *
 * Off by default: continuous background transcription is not something to
 * start without the person asking for it, and every account of this feature
 * across the app follows the same rule (see useSpeechRecognition).
 */
export function useLiveCaptions(appointmentId) {
  const { i18n } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [incoming, setIncoming] = useState(null);
  const sentLengthRef = useRef(0);
  const speech = useSpeechRecognition(i18n.resolvedLanguage);

  const startSession = useCallback(() => {
    sentLengthRef.current = 0;
    speech.reset();
    speech.start();
  }, [speech.reset, speech.start]);

  // Forward only the newly-finished part of my own speech.
  useEffect(() => {
    if (!enabled || !speech.finalText) return;
    const delta = speech.finalText.slice(sentLengthRef.current).trim();
    if (!delta) return;
    sentLengthRef.current = speech.finalText.length;
    getSocket().emit('call:caption', { appointmentId, text: delta });
  }, [enabled, speech.finalText, appointmentId]);

  // Chrome ends a "continuous" session on its own after a while even with
  // someone still talking — restart for as long as captions stay on, unless
  // the stop was a denied permission or the browser having no speech engine.
  useEffect(() => {
    if (!enabled || speech.listening) return;
    if (speech.errorCode === 'denied' || speech.errorCode === 'unsupported') return;
    const timer = setTimeout(startSession, 400);
    return () => clearTimeout(timer);
  }, [enabled, speech.listening, speech.errorCode, startSession]);

  useEffect(() => () => speech.stop(), [speech.stop]);

  useSocketEvent('call:caption', (payload) => {
    if (String(payload.appointmentId) !== String(appointmentId)) return;
    setIncoming(payload);
  });

  // Optional: speak the translated line aloud so someone can listen instead
  // of reading, using only the browser's own speech synthesis — no service,
  // no cost.
  useEffect(() => {
    if (!readAloud || !incoming || typeof window === 'undefined' || !window.speechSynthesis) return;
    const text = incoming.translatedText || incoming.text;
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = TTS_LOCALE[incoming.targetLanguage] ?? TTS_LOCALE.en;
    window.speechSynthesis.speak(utterance);
  }, [incoming, readAloud]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (next) startSession();
      else speech.stop();
      return next;
    });
  }, [startSession, speech.stop]);

  return {
    supported: speech.supported,
    enabled,
    listening: speech.listening,
    errorCode: speech.errorCode,
    incoming,
    readAloud,
    setReadAloud,
    toggle,
  };
}
