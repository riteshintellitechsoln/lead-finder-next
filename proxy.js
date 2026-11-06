// Only signed-in people can use the app. This is a quick check for the session
// cookie (no database here); every page and API route still checks the session
// itself (pageUser / requireUser in lib/auth.js).
import { NextResponse } from 'next/server';

const PUBLIC = ['/login', '/signup', '/api/auth/'];

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (request.cookies.get('lf_session')?.value) return NextResponse.next();
  if (pathname.startsWith('/api/')) return Response.json({ error: 'Please log in' }, { status: 401 });
  const to = new URL('/login', request.url);
  if (pathname !== '/') to.searchParams.set('next', pathname + search);
  return NextResponse.redirect(to);
}

export const config = {
  // Everything except Next.js files and static assets
  matcher: ['/((?!_next/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|map|txt|woff2?)$).*)'],
};
