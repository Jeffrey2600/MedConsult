import { io } from 'socket.io-client';
import { API_BASE, getToken } from '../api/client.js';

// The socket connects to the server root, not the /api prefix.
const SOCKET_URL = API_BASE.replace(/\/api\/?$/, '');

let socket = null;

/**
 * One shared socket for the whole app. Components subscribe to events rather
 * than opening their own connection, so switching pages does not tear down
 * and rebuild the connection.
 */
export function getSocket() {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    // The same JWT that authorises the REST API authorises the socket.
    auth: { token: getToken() },
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function connectSocket() {
  const s = getSocket();
  // Re-read the token on every connect: the user may have signed in as
  // someone else since the socket object was created.
  s.auth = { token: getToken() };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
