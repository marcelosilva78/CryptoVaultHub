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

export function getToken(): string {
  return typeof window !== 'undefined'
    ? localStorage.getItem('cvh_client_token') ?? ''
    : '';
}

/**
 * Shared fetch helper for all client portal pages.
 * Automatically prepends the CLIENT_API base URL and attaches the JWT token.
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
 * Create a ClientApiClient instance (for use with @cvh/api-client SDK).
 *
 * @param token - JWT token or API key
 * @param authMode - 'jwt', 'apikey', or 'auto' (default: 'auto' detects based on token format)
 */
export function getClientApi(token: string, authMode: ClientAuthMode = 'auto') {
  return new ClientApiClient(CLIENT_API, token, authMode);
}

export { CLIENT_API as API_URL };
