import axios, { AxiosError } from 'axios';

export function getApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  const hostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
  return `http://${hostname}:5000/api/v1`;
}

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ─── Request Interceptor: Attach JWT ─────────────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('flowpilot_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ─── Response Interceptor: Handle 401 ────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (!error.response && error.code !== 'ERR_CANCELED' && typeof window !== 'undefined') {
      console.error(error.code === 'ECONNABORTED'
        ? '[FlowPilot API] The request timed out before the backend responded.'
        : '[FlowPilot API] The backend could not be reached.', {
        apiBaseUrl: api.defaults.baseURL,
        requestPath: error.config?.url?.split('?')[0],
        frontendOrigin: window.location.origin,
        errorCode: error.code,
        hint: 'Start the backend with `npm run dev:backend` or run `npm run dev` from the repository root.',
      });
    }

    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Token expired – clear storage and redirect to login
      if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
        localStorage.removeItem('flowpilot_token');
        localStorage.removeItem('flowpilot_user');
        window.location.replace('/');
      }
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, action = 'complete this request'): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    const responseMessage = error.response?.data?.message;
    if (responseMessage) return responseMessage;

    if (error.code === 'ECONNABORTED') {
      return `The request to the FlowPilot API timed out while trying to ${action}. Please try again.`;
    }
    if (!error.response) {
      return `Unable to reach the FlowPilot API at ${api.defaults.baseURL}. Start the backend with \`npm run dev:backend\` (or \`npm run dev\` from the repository root), then try again.`;
    }
    return error.message || `Unable to ${action}.`;
  }

  return error instanceof Error ? error.message : `Unable to ${action}.`;
}

// ─── Typed helper ─────────────────────────────────────────────────────────────
export function getAuthUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('flowpilot_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('flowpilot_token');
}
