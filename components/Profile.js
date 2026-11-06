'use client';
// My profile: account summary, edit name / email, change password, log out.
// Used by /profile (users) and /admin/profile (admins).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from './Toast';
import { api } from '@/lib/api';
import { fmt, formatDateTime, initials } from '@/lib/format';

export default function Profile({ admin = false }) {
  const toast = useToast();
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [details, setDetails] = useState({ name: '', email: '' });
  const [pw, setPw] = useState({ current: '', password: '', confirm: '' });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api('/me').then((m) => { setMe(m); setDetails({ name: m.name || '', email: m.email }); }, (e) => toast(e.message));
  }, [toast]);

  async function saveDetails(e) {
    e.preventDefault();
    setBusy('details');
    try {
      const m = await api('/me', { method: 'PATCH', body: details });
      setMe(m);
      toast('Profile saved');
      router.refresh(); // updates the name in the top bar and sidebar
    } catch (err) {
      toast(err.message);
    }
    setBusy('');
  }

  async function savePassword(e) {
    e.preventDefault();
    if (pw.password !== pw.confirm) return toast('The new passwords do not match');
    setBusy('password');
    try {
      await api('/me/password', { method: 'POST', body: { current: pw.current, password: pw.password } });
      setPw({ current: '', password: '', confirm: '' });
      setMe((m) => ({ ...m, sessions: 1 }));
      toast('Password changed. Other devices were logged out.');
    } catch (err) {
      toast(err.message);
    }
    setBusy('');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  if (!me) return <section className="view"><div className="meta">Loading…</div></section>;
  const changed = details.name !== (me.name || '') || details.email !== me.email;
  const field = (state, set, k) => ({ value: state[k], onChange: (e) => set({ ...state, [k]: e.target.value }) });

  return (
    <section className="view">
      <div className="card profilehead">
        <div className="av big">{initials(me.name || me.email)}</div>
        <div className="grow">
          <h2>{me.name || 'No name yet'}</h2>
          <div className="meta">{me.email}</div>
          <div className="pills">
            <span className={'pill' + (me.role === 'admin' ? ' accent' : ' ok')}>{me.role === 'admin' ? 'Admin' : 'User'}</span>
            <span className="meta">Member since {formatDateTime(me.created_at)}</span>
          </div>
        </div>
        <button className="btn" type="button" onClick={logout}>Log out</button>
      </div>

      <div className="stats three">
        {admin ? (
          <>
            <Link className="card stat" href="/admin/users"><div className="k">Manage</div><div className="v">Users</div><div className="meta">Add, block, reset passwords</div></Link>
            <Link className="card stat" href="/admin/data"><div className="k">Manage</div><div className="v">Data</div><div className="meta">Upload CSV, edit people</div></Link>
          </>
        ) : (
          <>
            <Link className="card stat" href="/saved"><div className="k">Saved searches</div><div className="v">{fmt(me.saved)}</div><div className="meta">Open saved searches</div></Link>
            <Link className="card stat" href="/tasks"><div className="k">Open tasks</div><div className="v">{fmt(me.openTasks)}</div><div className="meta">{fmt(me.tasks)} in total</div></Link>
          </>
        )}
        <div className="card stat">
          <div className="k">Logged-in devices</div>
          <div className="v">{fmt(me.sessions)}</div>
          <div className="meta">Changing the password logs out the others</div>
        </div>
      </div>

      <div className="grid2 even">
        <form className="card" onSubmit={saveDetails}>
          <h3>Personal details</h3>
          <div className="stack tight">
            <label className="lbl" htmlFor="pname">Name</label>
            <input className="txt" id="pname" autoComplete="name" {...field(details, setDetails, 'name')} />
            <label className="lbl" htmlFor="pemail">Email (used to sign in)</label>
            <input className="txt" id="pemail" type="email" required autoComplete="email" {...field(details, setDetails, 'email')} />
            <button className="btn primary" type="submit" disabled={!changed || busy === 'details'}>
              {busy === 'details' ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </form>

        <form className="card" onSubmit={savePassword}>
          <h3>Change password</h3>
          <div className="stack tight">
            <label className="lbl" htmlFor="pcur">Current password</label>
            <input className="txt" id="pcur" type="password" required autoComplete="current-password" {...field(pw, setPw, 'current')} />
            <label className="lbl" htmlFor="pnew">New password (6+ characters)</label>
            <input className="txt" id="pnew" type="password" required minLength={6} autoComplete="new-password" {...field(pw, setPw, 'password')} />
            <label className="lbl" htmlFor="pconf">Repeat new password</label>
            <input className="txt" id="pconf" type="password" required minLength={6} autoComplete="new-password" {...field(pw, setPw, 'confirm')} />
            <button className="btn primary" type="submit" disabled={busy === 'password'}>
              {busy === 'password' ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
