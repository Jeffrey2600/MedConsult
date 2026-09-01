import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { connectSocket, disconnectSocket, getSocket } from '../lib/socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { qk } from '../lib/queryClient.js';

/**
 * Opens the shared socket while someone is signed in, and keeps the query
 * cache honest: a server-pushed event invalidates the affected queries so the
 * UI refetches rather than trying to patch cached objects by hand.
 */
export function useSocketConnection() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      setConnected(false);
      return undefined;
    }

    const socket = connectSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onNotification = () => {
      queryClient.invalidateQueries({ queryKey: qk.notifications });
      queryClient.invalidateQueries({ queryKey: qk.unreadCount });
    };

    const onAppointmentUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['slots'] });
      queryClient.invalidateQueries({ queryKey: ['slot-summary'] });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('notification:new', onNotification);
    socket.on('appointment:updated', onAppointmentUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('notification:new', onNotification);
      socket.off('appointment:updated', onAppointmentUpdated);
    };
    // user.id is in the deps so switching accounts reconnects with the new token.
  }, [isAuthenticated, user?.id, queryClient]);

  return { connected };
}

/** Subscribe to one socket event for the lifetime of a component. */
export function useSocketEvent(event, handler) {
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    const socket = getSocket();
    const listener = (...args) => saved.current(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [event]);
}
