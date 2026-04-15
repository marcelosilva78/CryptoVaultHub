import { AdminApiClient } from '@cvh/api-client';

export const ADMIN_API =
  process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3001/admin';

export const AUTH_API =
  process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';

/** Read the access token from the cookie. */
function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)cvh_admin_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

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
 * Reads the JWT from the cvh_admin_token cookie and sends it as
 * Authorization: Bearer header to the cross-origin API.
 */
export async function adminFetch<T = any>(
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

  const res = await fetch(`${ADMIN_API}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await attemptTokenRefresh();
    if (!refreshed) clearAuthAndRedirect();

    // Re-read token after refresh (cookie was updated by the proxy route)
    const newToken = getToken();
    const retryHeaders = { ...headers };
    if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;

    const retryRes = await fetch(`${ADMIN_API}${path}`, { ...options, headers: retryHeaders });
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
