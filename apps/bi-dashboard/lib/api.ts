import { AdminApiClient } from '@cvh/api-client';

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3001';

/**
 * Create an AdminApiClient for the BI Dashboard.
 * The BI dashboard uses the Admin API for read-only analytics data.
 */
export function getAdminApi(token: string) {
  return new AdminApiClient(API_URL, token);
}

export { API_URL };
