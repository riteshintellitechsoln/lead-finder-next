// Sets the session cookie after login / sign-up and copies the guest's browser lists into the account
import { cookies } from 'next/headers';
import { COOKIE } from './auth.js';
import { mergeGuest } from './guest.js';

export async function startSession(request, { token, expires, user }, guest) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    expires,
  });
  return { user, merged: mergeGuest(user, guest), home: user.role === 'admin' ? '/admin' : '/' };
}
