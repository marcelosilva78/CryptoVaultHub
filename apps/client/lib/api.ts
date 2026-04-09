import { ClientApiClient } from '@cvh/api-client';

const API_URL = process.env.NEXT_PUBLIC_CLIENT_API_URL || 'http://localhost:3002';

/**
 * Create a ClientApiClient instance.
 * In a real app, the apiKey would come from the session / environment.
 */
export function getClientApi(apiKey: string) {
  return new ClientApiClient(API_URL, apiKey);
}

export { API_URL };
