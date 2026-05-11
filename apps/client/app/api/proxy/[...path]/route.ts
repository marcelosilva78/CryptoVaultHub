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

  // Retry transient socket-level failures (ECONNRESET, "other side closed")
  // that happen when the upstream gateway (Kong) recycles workers mid-request.
  // These are connection-level errors, not HTTP responses, so they surface as
  // TypeError from undici. Idempotent methods retry up to 3x with short backoff.
  const isIdempotent =
    request.method === 'GET' ||
    request.method === 'HEAD' ||
    request.method === 'OPTIONS';
  const maxAttempts = isIdempotent ? 3 : 1;

  let backendRes: Response | null = null;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      backendRes = await fetch(`${CLIENT_API}${targetPath}${queryString}`, {
        method: request.method,
        headers,
        body,
        // Avoid undici connection reuse — sticky sockets to a flapping
        // upstream produce ECONNRESET on subsequent requests.
        cache: 'no-store',
      });
      break;
    } catch (err: any) {
      lastErr = err;
      const cause = err?.cause?.code ?? err?.code ?? '';
      const message = String(err?.message ?? '');
      const isTransient =
        cause === 'ECONNRESET' ||
        cause === 'UND_ERR_SOCKET' ||
        cause === 'UND_ERR_CONNECT_TIMEOUT' ||
        cause === 'ETIMEDOUT' ||
        message.includes('other side closed') ||
        message.includes('socket hang up');
      if (!isTransient || attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }

  if (!backendRes) {
    return NextResponse.json(
      { message: 'Upstream gateway unreachable', error: String(lastErr) },
      { status: 502 },
    );
  }

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
