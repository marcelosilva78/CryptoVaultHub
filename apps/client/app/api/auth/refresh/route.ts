import { NextRequest, NextResponse } from 'next/server';

const AUTH_API_URL =
  process.env.AUTH_API_URL ||
  process.env.NEXT_PUBLIC_AUTH_API_URL ||
  'http://localhost:8000/auth';

/**
 * Server-side proxy for client token refresh.
 * Reads the refresh token from the HttpOnly cookie, calls the auth service,
 * and sets updated HttpOnly cookies.
 */
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get('cvh_client_refresh')?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { message: 'No refresh token' },
      { status: 401 },
    );
  }

  const res = await fetch(`${AUTH_API_URL}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    const response = NextResponse.json(
      { message: 'Token refresh failed' },
      { status: 401 },
    );
    response.cookies.set('cvh_client_token', '', { maxAge: 0, path: '/' });
    response.cookies.set('cvh_client_refresh', '', { maxAge: 0, path: '/' });
    return response;
  }

  const data = await res.json();
  const accessToken = data.tokens?.accessToken ?? data.accessToken;
  const newRefresh = data.tokens?.refreshToken ?? data.refreshToken;

  if (!accessToken) {
    const response = NextResponse.json(
      { message: 'Token refresh failed: malformed response' },
      { status: 401 },
    );
    response.cookies.set('cvh_client_token', '', { maxAge: 0, path: '/' });
    response.cookies.set('cvh_client_refresh', '', { maxAge: 0, path: '/' });
    return response;
  }

  const response = NextResponse.json({ user: data.user, success: true });

  response.cookies.set('cvh_client_token', accessToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  if (newRefresh) {
    response.cookies.set('cvh_client_refresh', newRefresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  return response;
}
