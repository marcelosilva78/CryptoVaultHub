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

/**
 * Attempt to refresh the admin JWT token using the server-side proxy.
 * The HttpOnly cookie is sent automatically; no localStorage needed.
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
  // Throw to halt further execution in the calling function
  throw new Error('Session expired. Redirecting to login.');
}

/**
 * Shared fetch helper for all admin pages.
 * Automatically prepends the ADMIN_API base URL and sends credentials (HttpOnly cookies).
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
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    const refreshed = await attemptTokenRefresh();
    if (!refreshed) {
      clearAuthAndRedirect();
    }

    // Retry the original request with the refreshed cookie
    const retryRes = await fetch(`${ADMIN_API}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
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
