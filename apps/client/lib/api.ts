import { ClientApiClient, type ClientAuthMode } from '@cvh/api-client';

export const CLIENT_API =
  process.env.NEXT_PUBLIC_CLIENT_API_URL || 'http://localhost:3002/client';

export const AUTH_API =
  process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';

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
 * Routes requests through the server-side proxy at /api/proxy/... which reads
 * the HttpOnly access token cookie and attaches the Authorization header.
 * This prevents the JWT from ever being exposed to client-side JavaScript.
 */
export async function clientFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`/api/proxy${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    const refreshed = await attemptTokenRefresh();
    if (!refreshed) clearAuthAndRedirect();

    const retryRes = await fetch(`/api/proxy${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
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
  // 304 Not Modified has no body — return empty object to avoid JSON parse error
  if (res.status === 304) {
    return {} as T;
  }
  return res.json();
}

export function getClientApi(token: string, authMode: ClientAuthMode = 'auto') {
  return new ClientApiClient(CLIENT_API, token, authMode);
}

export { CLIENT_API as API_URL };
