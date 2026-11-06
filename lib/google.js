// "Log in with Google" (OAuth 2.0 / OpenID Connect, server only). Needs
// GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from Google Cloud Console, with
// <APP_URL>/api/auth/google/callback added as an authorised redirect URI.
import { HttpError } from './route.js';

export const OAUTH_COOKIE = 'lf_oauth';
export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// APP_URL when set (needed behind a proxy / on a custom domain), else the address the browser used
export const redirectUri = (request) =>
  `${(process.env.APP_URL || request.nextUrl.origin).replace(/\/+$/, '')}/api/auth/google/callback`;

export function authUrl(request, state) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** code from Google's redirect -> { email, name } of a verified Google account */
export async function googleProfile(request, code) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(request),
      grant_type: 'authorization_code',
    }),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) {
    console.error('[google] token exchange failed:', token.error, token.error_description);
    throw new HttpError(400, 'Google sign-in failed. Please try again.');
  }
  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const info = await infoRes.json().catch(() => ({}));
  if (!infoRes.ok || !info.email) throw new HttpError(400, 'Google did not share an email address');
  if (info.email_verified === false) throw new HttpError(403, 'This Google email is not verified');
  return { email: info.email, name: info.name || [info.given_name, info.family_name].filter(Boolean).join(' ') };
}
