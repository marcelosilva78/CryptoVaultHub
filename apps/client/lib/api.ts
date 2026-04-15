import { ClientApiClient, type ClientAuthMode } from '@cvh/api-client';

export const CLIENT_API =
  process.env.NEXT_PUBLIC_CLIENT_API_URL || 'http://localhost:3002/client';

export const AUTH_API =
  process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';

/** Read the access token from the cookie. */
function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)cvh_client_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function attemptTokenRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

function clearAuthAndRedirect(): never {
  fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login';
  throw new Error('Session expired. Redirecting to login.');
}

/**
 * Shared fetch helper for all client portal pages.
 * Reads JWT from cookie and sends as Authorization: Bearer header.
 */
export async function clientFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${CLIENT_API}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await attemptTokenRefresh();
    if (!refreshed) clearAuthAndRedirect();

    const newToken = getToken();
    const retryHeaders = { ...headers };
    if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;

    const retryRes = await fetch(`${CLIENT_API}${path}`, { ...options, headers: retryHeaders });
    if (!retryRes.ok) {
      if (retryRes.status === 401) clearAuthAndRedirect();
      const e = await retryRes.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(e.message || `HTTP ${retryRes.status}`);
    }
    return retryRes.json();
  }

  if (!res.ok) {
    const e = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(e.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export function getClientApi(token: string, authMode: ClientAuthMode = 'auto') {
  return new ClientApiClient(CLIENT_API, token, authMode);
}

export { CLIENT_API as API_URL };
