'use client';
// Log in or sign up. The guest's in-memory saved leads and tasks are sent
// along, so they are copied into the account instead of being lost.
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from './Session';

// Only go back to a page on this site
const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') && !next.startsWith('/signup') ? next : null);

export default function LoginForm({ mode = 'login', next }) {
  const session = useSession();
  const signup = mode === 'signup';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const guestData = session.guestData();
  const carried = guestData ? guestData.saved.length + guestData.tasks.length : 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { home, user } = await api(signup ? '/auth/signup' : '/auth/login', { method: 'POST', body: { ...form, guest: guestData } });
      // Full load so the server layout sees the new cookie; customers go back where they were
      window.location.href = (user.role === 'user' && safeNext(next)) || home;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });
  const q = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <form className="stack" onSubmit={submit}>
      {signup && (
        <>
          <label className="lbl" htmlFor="name">Name</label>
          <input className="txt" id="name" autoComplete="name" {...field('name')} />
        </>
      )}
      <label className="lbl" htmlFor="email">Email</label>
      <input className="txt" id="email" type="email" autoComplete={signup ? 'email' : 'username'} required {...field('email')} />
      <label className="lbl" htmlFor="password">Password{signup ? ' (6+ characters)' : ''}</label>
      <input className="txt" id="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 6 : undefined} required {...field('password')} />
      {carried > 0 && (
        <div className="hint">Your {guestData.saved.length} saved leads and {guestData.tasks.length} tasks will be kept in your account.</div>
      )}
      {error && <div className="err">{error}</div>}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
      </button>
      <div className="meta center">
        {signup ? <>Already have an account? <Link className="link" href={`/login${q}`}>Sign in</Link></> : <>New here? <Link className="link" href={`/signup${q}`}>Create an account</Link></>}
        {' · '}
        <Link className="link" href={safeNext(next) || '/'}>Continue as guest</Link>
      </div>
    </form>
  );
}
