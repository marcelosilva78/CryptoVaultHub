import { NextRequest, NextResponse } from 'next/server';

const CLIENT_API =
  process.env.CLIENT_API_URL ||
  process.env.NEXT_PUBLIC_CLIENT_API_URL ||
  'http://localhost:3002/client';

/**
 * Catch-all API proxy for client portal.
 * Reads the access token from the HttpOnly cookie and forwards requests
 * to the backend API with the Authorization header.
 * This avoids exposing the JWT to client-side JavaScript.
 */
async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const targetPath = '/' + path.join('/');
  const url = new URL(request.url);
  const queryString = url.search;

  const token = request.cookies.get('cvh_client_token')?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Forward the request body for non-GET/HEAD methods
  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      body = await request.text();
    } catch {
      // no body
    }
  }

  const backendRes = await fetch(`${CLIENT_API}${targetPath}${queryString}`, {
    method: request.method,
    headers,
    body,
  });

  // Stream the response back
  const data = await backendRes.text();
  const responseHeaders = new Headers();
  const contentType = backendRes.headers.get('content-type');
  if (contentType) {
    responseHeaders.set('content-type', contentType);
  }

  return new NextResponse(data, {
    status: backendRes.status,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
