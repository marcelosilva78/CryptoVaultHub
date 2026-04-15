import { NextResponse } from 'next/server';

/**
 * Server-side logout: clears HttpOnly auth cookies.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('cvh_client_token', '', { maxAge: 0, path: '/' });
  response.cookies.set('cvh_client_refresh', '', { maxAge: 0, path: '/' });
  return response;
}
