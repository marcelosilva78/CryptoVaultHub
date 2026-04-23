import { AdminApiClient } from '@cvh/api-client';

export const ADMIN_API =
  process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3001/admin';

export const AUTH_API =
  process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';

/**
 * Attempt to refresh the admin JWT token using the server-side proxy.
 * The HttpOnly refresh cookie is sent automatically.
 */
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
 * Shared fetch helper for all admin pages.
 * Routes requests through the server-side proxy at /api/proxy/... which reads
 * the HttpOnly access token cookie and attaches the Authorization header.
 * This prevents the JWT from ever being exposed to client-side JavaScript.
 */
export async function adminFetch<T = any>(
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

    // Retry after refresh — the proxy route will read the updated HttpOnly cookie
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
  return res.json();
}

export function getAdminApi(token: string) {
  return new AdminApiClient(ADMIN_API, token);
}
