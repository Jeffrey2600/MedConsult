import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * BCP-47 locale for each interface language's speech recognition. Chrome's
 * speech service (the only backend most browsers actually implement this
 * against) supports all five, but recognition quality for the Indic
 * languages depends on the device's own language pack — English is the one
 * guaranteed to work everywhere, so it is also the fallback if a request for
 * another locale is rejected outright.
 */
const RECOGNITION_LOCALE = {
  en: 'en-IN',
  ta: 'ta-IN',
  hi: 'hi-IN',
  te: 'te-IN',
  ml: 'ml-IN',
};

const SpeechRecognitionCtor =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/**
 * Wraps the browser's native speech-to-text API.
 *
 * This is not an npm dependency — SpeechRecognition ships in the browser
 * itself (Chrome and Edge; not Firefox or Safari as of this writing), so the
 * feature is entirely free and adds nothing to the bundle. Consistent with
 * every other integration in this app, an unsupported browser is a normal
 * outcome: `supported` is false, the caller hides the mic control, and typing
 * still works exactly as before.
 *
 * Interim (still-being-spoken) and final results are both surfaced so the
 * caller can show live feedback rather than a silent wait, but only
 * `finalText` should ever be persisted — interim text can still change.
 */
export function useSpeechRecognition(languageCode) {
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [errorCode, setErrorCode] = useState(null);
  const recognitionRef = useRef(null);

  const supported = Boolean(SpeechRecognitionCtor);

  // A language switch mid-session would otherwise keep recognising in the
  // old locale until the next start() — stop cleanly so state cannot drift.
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    if (!supported) {
      setErrorCode('unsupported');
      return;
    }

    setErrorCode(null);
    setInterimText('');
    setFinalText('');

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = RECOGNITION_LOCALE[languageCode] ?? RECOGNITION_LOCALE.en;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalChunk += `${result[0].transcript} `;
        else interimChunk += result[0].transcript;
      }
      if (finalChunk) setFinalText((prev) => `${prev}${finalChunk}`);
      setInterimText(interimChunk);
    };

    // A locale the device has no language pack for reports as a generic
    // 'language-not-supported' on some platforms and as a silent immediate
    // 'no-speech' on others — both are reported the same way so the caller
    // can offer the same recovery (switch the interface to English, or type).
    recognition.onerror = (event) => {
      setErrorCode(event.error === 'not-allowed' ? 'denied' : event.error || 'unknown');
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [supported, languageCode]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    setInterimText('');
    setFinalText('');
    setErrorCode(null);
  }, []);

  return { supported, listening, interimText, finalText, errorCode, start, stop, reset };
}
