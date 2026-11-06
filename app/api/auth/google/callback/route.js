// GET /api/auth/google/callback?code=&state= -> Google sends the browser back here.
// Logs in (or creates the account on first use) and redirects into the app.
import { NextResponse } from 'next/server';
import { COOKIE, googleLogin } from '@/lib/auth';
import { OAUTH_COOKIE, googleProfile } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const fail = (msg) => {
    const res = NextResponse.redirect(new URL('/login?error=' + encodeURIComponent(msg), request.url));
    res.cookies.delete({ name: OAUTH_COOKIE, path: '/api/auth/google' });
    return res;
  };
  let saved = {};
  try { saved = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value || '{}'); } catch { /* bad cookie */ }
  if (sp.get('error')) return fail(sp.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in failed. Please try again.');
  if (!saved.state || saved.state !== sp.get('state') || !sp.get('code')) return fail('Google sign-in expired. Please try again.');
  try {
    const { token, expires, user } = await googleLogin(await googleProfile(request, sp.get('code')), saved.remember !== false);
    const home = user.role === 'admin' ? '/admin' : '/';
    const res = NextResponse.redirect(new URL((user.role === 'user' && saved.next) || home, request.url));
    res.cookies.set(COOKIE, token, {
      httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', ...(expires ? { expires } : {}),
    });
    res.cookies.delete({ name: OAUTH_COOKIE, path: '/api/auth/google' });
    return res;
  } catch (e) {
    if (!e.status) console.error('[google]', e);
    return fail(e.status ? e.message : 'Google sign-in failed. Please try again.');
  }
}
