import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('cvh_client_token');

  const isLoginPath = request.nextUrl.pathname.startsWith('/login');
  const isRegisterPath = request.nextUrl.pathname.startsWith('/register');
  const isPublicPath = isLoginPath || isRegisterPath;

  // No token and protected route → redirect to login
  if (!token && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Has token and on /login → clear the cookie and stay on login
  // (prevents redirect loop when cookie is invalid/expired)
  if (token && isLoginPath) {
    const response = NextResponse.next();
    response.cookies.delete('cvh_client_token');
    return response;
  }

  // /register is always accessible (invite flow)
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
