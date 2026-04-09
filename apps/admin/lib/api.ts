import { AdminApiClient } from '@cvh/api-client';

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3001';

/**
 * Create an AdminApiClient instance.
 * In a real app, the token would come from the auth session.
 */
export function getAdminApi(token: string) {
  return new AdminApiClient(API_URL, token);
}

export { API_URL };
