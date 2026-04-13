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
 * Shared fetch helper for all admin pages.
 * Automatically prepends the ADMIN_API base URL and attaches the JWT token.
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
