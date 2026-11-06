// GET /api/auth/google?next=/people&remember=0 -> sends the browser to Google's account picker
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { OAUTH_COOKIE, authUrl, googleEnabled } from '@/lib/google';
import { safeNext } from '@/lib/next-url';

export const dynamic = 'force-dynamic';

export function GET(request) {
  const sp = request.nextUrl.searchParams;
  if (!googleEnabled()) {
    return NextResponse.redirect(new URL('/login?error=' + encodeURIComponent('Google sign-in is not set up yet. Use email and password.'), request.url));
  }
  // state ties Google's answer to this browser (stops login CSRF)
  const state = crypto.randomBytes(16).toString('hex');
  const res = NextResponse.redirect(authUrl(request, state));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, next: safeNext(sp.get('next')), remember: sp.get('remember') !== '0' }), {
    httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/api/auth/google', maxAge: 600,
  });
  return res;
}
