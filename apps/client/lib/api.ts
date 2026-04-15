import { ClientApiClient, type ClientAuthMode } from '@cvh/api-client';

/**
 * Base URL for the Client API.
 *
 * In production, NEXT_PUBLIC_CLIENT_API_URL points to the client-api through Kong.
 * In development, it defaults to the client-api NestJS service on port 3002.
 */
export const CLIENT_API =
  process.env.NEXT_PUBLIC_CLIENT_API_URL || 'http://localhost:3002/client';

export const AUTH_API =
  process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8000/auth';

/**
 * Attempt to refresh the client JWT token using the server-side proxy.
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
 * Shared fetch helper for all client portal pages.
 * Automatically prepends the CLIENT_API base URL and sends credentials (HttpOnly cookies).
 * On 401, attempts a token refresh and retries the request once.
 * If refresh fails, clears auth state and redirects to /login.
 *
 * The client-api now supports JWT tokens (Authorization: Bearer) in addition
 * to API keys (X-API-Key), allowing the web portal to authenticate via JWT.
 *
 * @param path - API path, e.g. "/client/v1/wallets"
 * @param options - Standard RequestInit options
 */
export async function clientFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${CLIENT_API}${path}`, {
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
    const retryRes = await fetch(`${CLIENT_API}${path}`, {
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
 * Create a ClientApiClient instance (for use with @cvh/api-client SDK).
 *
 * @param token - JWT token or API key
 * @param authMode - 'jwt', 'apikey', or 'auto' (default: 'auto' detects based on token format)
 */
export function getClientApi(token: string, authMode: ClientAuthMode = 'auto') {
  return new ClientApiClient(CLIENT_API, token, authMode);
}

export { CLIENT_API as API_URL };
