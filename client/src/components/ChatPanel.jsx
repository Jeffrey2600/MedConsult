import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Send, MessageSquare } from 'lucide-react';

import { notificationApi } from '../api/notifications.js';
import { qk } from '../lib/queryClient.js';
import { getSocket } from '../lib/socket.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatTime } from '../lib/datetime.js';
import { LANGUAGES } from '../lib/i18n.js';

/** Native-script name shown in "translated from X" captions — recognisable
 *  regardless of which language the reader's own interface is in. */
const nativeNameFor = (code) => LANGUAGES.find((l) => l.code === code)?.native ?? code;

/**
 * Per-appointment text chat. History is fetched over REST so it survives a
 * refresh; new messages arrive over the socket. Both feed one list, keyed by
 * message id, so a message never appears twice when the echo of your own
 * send arrives back from the server.
 */
export function ChatPanel({ appointmentId }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showOriginal, setShowOriginal] = useState(() => new Set());
  const endRef = useRef(null);

  const toggleOriginal = (id) => {
    setShowOriginal((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data, isPending } = useQuery({
    queryKey: qk.messages(appointmentId),
    queryFn: () => notificationApi.messages(appointmentId),
    enabled: Boolean(appointmentId),
  });

  useEffect(() => {
    if (!data?.messages) return;
    setMessages(
      data.messages.map((m) => ({
        id: String(m._id),
        senderId: String(m.sender?._id ?? m.sender),
        senderName: m.sender?.name ?? '',
        text: m.text,
        translatedText: m.translatedText || '',
        sourceLanguage: m.sourceLanguage || '',
        translatedLanguage: m.translatedLanguage || '',
        createdAt: m.createdAt,
      }))
    );
  }, [data]);

  // Join the appointment's room so the server routes messages here.
  useEffect(() => {
    if (!appointmentId) return undefined;
    const socket = getSocket();
    socket.emit('appointment:join', appointmentId);
    return () => socket.emit('appointment:leave', appointmentId);
  }, [appointmentId]);

  useSocketEvent('chat:message', (payload) => {
    if (String(payload.appointmentId) !== String(appointmentId)) return;
    setMessages((prev) =>
      prev.some((m) => m.id === payload.id) ? prev : [...prev, payload]
    );
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError('');
    getSocket().emit('chat:send', { appointmentId, text }, (ack) => {
      setSending(false);
      if (ack?.ok) {
        setDraft('');
        // The broadcast handler adds the message; this covers the case where
        // the acknowledgement beats the broadcast back to us.
        setMessages((prev) =>
          prev.some((m) => m.id === ack.message.id) ? prev : [...prev, ack.message]
        );
      } else {
        setError(ack?.error || t('chat.sendFailed'));
      }
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
        <MessageSquare className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {t('chat.title')}
      </h2>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {isPending && <p className="text-sm text-slate-500">{t('common.loading')}</p>}

        {!isPending && messages.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">{t('chat.empty')}</p>
        )}

        {messages.map((m) => {
          const mine = String(m.senderId) === String(user?.id);
          // The stored translation is only ever into the recipient's
          // language, so it is only worth showing as the primary text on
          // the other party's bubbles — on my own bubbles it would just be
          // my own message back in a language I didn't write it in.
          const hasIncomingTranslation = !mine && Boolean(m.translatedText);
          const revealed = showOriginal.has(m.id);
          const displayText =
            hasIncomingTranslation && !revealed ? m.translatedText : m.text;

          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${
                  mine
                    ? 'rounded-br-sm bg-brand-600 text-white'
                    : 'rounded-bl-sm bg-slate-100 text-slate-800'
                }`}
              >
                <p className="text-sm break-words whitespace-pre-wrap">{displayText}</p>

                {hasIncomingTranslation && (
                  <p className="mt-1 text-[10px] text-slate-400">
                    {revealed
                      ? t('chat.showingOriginal')
                      : t('chat.translatedNote', { language: nativeNameFor(m.sourceLanguage) })}
                    {' · '}
                    <button
                      type="button"
                      onClick={() => toggleOriginal(m.id)}
                      className="underline decoration-dotted hover:text-slate-600"
                    >
                      {revealed ? t('chat.showTranslated') : t('chat.showOriginal')}
                    </button>
                  </p>
                )}

                {mine && m.translatedText && (
                  <p className="mt-1 text-[10px] text-brand-100">
                    {t('chat.translatedForRecipient', {
                      language: nativeNameFor(m.translatedLanguage),
                    })}
                  </p>
                )}

                <p className={`mt-0.5 text-[10px] ${mine ? 'text-brand-100' : 'text-slate-400'}`}>
                  {formatTime(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}

      <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('chat.placeholder')}
          maxLength={2000}
          className="input"
          aria-label={t('chat.placeholder')}
        />
        <button type="submit" className="btn-primary px-3" disabled={!draft.trim() || sending}>
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t('chat.send')}</span>
        </button>
      </form>
    </div>
  );
}
