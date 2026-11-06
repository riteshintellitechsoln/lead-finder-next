'use client';
// Log in or sign up: "Log in with Google" or email and password.
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { safeNext } from '@/lib/next-url';

const EMPTY = { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' };

export default function LoginForm({ mode = 'login', next, error: startError, googleOn, signupOn }) {
  const signup = mode === 'signup';
  const [form, setForm] = useState(EMPTY);
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState(startError || '');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const q = next ? `?next=${encodeURIComponent(next)}` : '';

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (signup && form.password !== form.confirmPassword) return setError('The two passwords do not match');
    setBusy(true);
    try {
      const body = signup ? { ...form, remember } : { email: form.email, password: form.password, remember };
      const { home, user } = await api(signup ? '/auth/signup' : '/auth/login', { method: 'POST', body });
      // Full load so the server layout sees the new cookie; customers go back where they were
      window.location.href = (user.role === 'user' && safeNext(next)) || home;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  const field = (k) => ({ id: k, name: k, value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  const googleHref = `/api/auth/google?${new URLSearchParams({ ...(safeNext(next) ? { next } : {}), ...(remember ? {} : { remember: '0' }) })}`;

  const eye = (
    <button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
      <svg viewBox="0 0 24 24">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {!show && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );

  return (
    <form className="authform" onSubmit={submit}>
      {googleOn && (
        <>
          <a className="sso" href={googleHref}>
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {signup ? 'Sign up with Google' : 'Log In with Google'}
          </a>
          <div className="or"><span>Or</span></div>
        </>
      )}

      {signup && (
        <div className="two">
          <div>
            <label className="lbl" htmlFor="firstName">First name</label>
            <input className="txt" autoComplete="given-name" placeholder="First name" required {...field('firstName')} />
          </div>
          <div>
            <label className="lbl" htmlFor="lastName">Surname</label>
            <input className="txt" autoComplete="family-name" placeholder="Surname" {...field('lastName')} />
          </div>
        </div>
      )}
      <label className="lbl" htmlFor="email">Email</label>
      <input className="txt" type="email" autoComplete={signup ? 'email' : 'username'} placeholder="Work Email" required {...field('email')} />

      <label className="lbl" htmlFor="password">Password</label>
      <div className="pw">
        <input className="txt" type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'}
          placeholder={signup ? 'At least 6 characters' : 'Enter your password'} minLength={signup ? 6 : undefined} required {...field('password')} />
        {eye}
      </div>
      {signup && (
        <>
          <label className="lbl" htmlFor="confirmPassword">Confirm password</label>
          <div className="pw">
            <input className="txt" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Type the password again" required {...field('confirmPassword')} />
          </div>
          {form.confirmPassword && form.confirmPassword !== form.password && <div className="meta warn">Passwords do not match yet</div>}
        </>
      )}

      {error && <div className="err" role="alert">{error}</div>}
      <button className="btn primary big" type="submit" disabled={busy}>
        {busy ? 'Please wait…' : signup ? 'Create account' : 'Log In'}
      </button>

      <div className="authrow">
        <label className="chk">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in
        </label>
        {!signup && <button className="link" type="button" onClick={() => setForgot((f) => !f)}>Forgot password?</button>}
      </div>
      {forgot && !signup && (
        <div className="hint">
          Ask your admin to set a new password for you (Admin → Users). If you signed up with Google, use Log In with Google.
        </div>
      )}

      <div className="meta center">
        {signup
          ? <>Already have an account? <Link className="link" href={`/login${q}`}>Log in</Link></>
          : signupOn && <>New here? <Link className="link" href={`/signup${q}`}>Create an account</Link></>}
      </div>
    </form>
  );
}
