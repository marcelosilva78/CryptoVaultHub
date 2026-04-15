import { AdminApiClient } from '@cvh/api-client';

/**
 * Base URL for the Admin API.
 *
 * In production, NEXT_PUBLIC_ADMIN_API_URL is set to "https://api.vaulthub.live/admin",
 * which already includes the /admin prefix matching the backend controller routes.
 *
 * In development, we default to "http://localhost:3001/admin" to match the
 * NestJS controllers that use @Controller('admin/...') route prefixes.
 */
export const ADMIN_API =
  process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3001/admin';

export const AUTH_API =
  process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';

export function getToken(): string {
  return typeof window !== 'undefined'
    ? localStorage.getItem('cvh_admin_token') ?? ''
    : '';
}

/**
 * Attempt to refresh the admin JWT token using the stored refresh token.
 * On success, persists the new tokens and returns the new access token.
 * On failure, clears auth state and redirects to /login.
 */
async function attemptTokenRefresh(): Promise<string | null> {
  const refreshToken = typeof window !== 'undefined'
    ? localStorage.getItem('cvh_admin_refresh')
    : null;

  if (!refreshToken) return null;

  try {
    const res = await fetch(`${AUTH_API}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const accessToken = data.tokens?.accessToken ?? data.accessToken;
    const newRefresh = data.tokens?.refreshToken ?? data.refreshToken;

    if (!accessToken) return null;

    localStorage.setItem('cvh_admin_token', accessToken);
    if (newRefresh) localStorage.setItem('cvh_admin_refresh', newRefresh);
    document.cookie = `cvh_admin_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    return accessToken;
  } catch {
    return null;
  }
}

function clearAuthAndRedirect(): never {
  localStorage.removeItem('cvh_admin_token');
  localStorage.removeItem('cvh_admin_refresh');
  document.cookie = 'cvh_admin_token=; path=/; max-age=0';
  window.location.href = '/login';
  // Throw to halt further execution in the calling function
  throw new Error('Session expired. Redirecting to login.');
}

/**
 * Shared fetch helper for all admin pages.
 * Automatically prepends the ADMIN_API base URL and attaches the JWT token.
 * On 401, attempts a token refresh and retries the request once.
 * If refresh fails, clears auth state and redirects to /login.
 *
 * @param path - API path relative to the admin base, e.g. "/clients" or "/chains"
 * @param options - Standard RequestInit options
 */
export async function adminFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${ADMIN_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    const newToken = await attemptTokenRefresh();
    if (!newToken) {
      clearAuthAndRedirect();
    }

    // Retry the original request with the new token
    const retryRes = await fetch(`${ADMIN_API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newToken}`,
        ...options.headers,
      },
    });

    if (!retryRes.ok) {
      if (retryRes.status === 401) {
        clearAuthAndRedirect();
      }
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

/**
 * Create an AdminApiClient instance (for use with @cvh/api-client SDK).
 */
export function getAdminApi(token: string) {
  return new AdminApiClient(ADMIN_API, token);
}
