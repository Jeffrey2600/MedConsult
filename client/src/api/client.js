import axios from 'axios';

export const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const TOKEN_KEY = 'medconsult.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Broadcast so AuthContext can clear state without importing this module. */
const forceLogout = () => {
  clearToken();
  window.dispatchEvent(new CustomEvent('medconsult:unauthorised'));
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // An expired or revoked token should drop the user to the login screen
    // rather than leaving the UI in a half-broken authenticated state.
    if (error.response?.status === 401 && getToken()) forceLogout();
    return Promise.reject(error);
  }
);

/**
 * Turns any axios failure into a plain message safe to show a user, and
 * exposes per-field errors from the server's zod validation output.
 */
export function toApiError(error) {
  if (error.response) {
    return {
      status: error.response.status,
      message: error.response.data?.message || 'Something went wrong',
      details: error.response.data?.details || null,
    };
  }
  if (error.code === 'ECONNABORTED') {
    return { status: 0, message: 'The server took too long to respond.', details: null };
  }
  return {
    status: 0,
    message: 'Could not reach the server. Check your connection and try again.',
    details: null,
  };
}

export const unwrap = (promise) => promise.then((res) => res.data);
