'use client';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { fmt, formatDateTime } from '@/lib/format';

const EMPTY = { name: '', email: '', password: '', role: 'user' };

export default function AdminUsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(() => api('/admin/users').then(setUsers, (e) => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);

  async function run(path, options, done) {
    try {
      await api(path, options);
      if (done) toast(done);
      load();
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    }
  }

  async function add(e) {
    e.preventDefault();
    if (await run('/admin/users', { method: 'POST', body: form }, `Added ${form.email}`)) setForm(EMPTY);
  }
  function resetPassword(u) {
    const password = window.prompt(`New password for ${u.email} (at least 6 characters)`);
    if (password) run(`/admin/users/${u.id}`, { method: 'PATCH', body: { password } }, 'Password changed');
  }
  function remove(u) {
    if (window.confirm(`Delete ${u.email}? Their saved leads and tasks are removed too.`)) {
      run(`/admin/users/${u.id}`, { method: 'DELETE' }, 'User deleted');
    }
  }
  const field = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <section className="view">
      <div className="card">
        <h3>Add a user</h3>
        <form className="userform" onSubmit={add}>
          <input className="txt" placeholder="Name" {...field('name')} />
          <input className="txt" type="email" placeholder="Email" required {...field('email')} />
          <input className="txt" type="text" placeholder="Password (6+ characters)" required minLength={6} autoComplete="new-password" {...field('password')} />
          <select className="txt" aria-label="Role" {...field('role')}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn primary" type="submit">Add user</button>
        </form>
      </div>

      <div className="tablewrap">
        <table>
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Saved leads</th><th>Tasks</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {!users && <tr><td colSpan={7} className="empty">Loading…</td></tr>}
            {users?.map((u) => (
              <tr key={u.id}>
                <td><div className="co">{u.name || '–'}</div><div className="meta">{u.email}</div></td>
                <td><span className={'pill' + (u.role === 'admin' ? ' accent' : '')}>{u.role === 'admin' ? 'Admin' : 'User'}</span></td>
                <td><span className={'pill' + (u.blocked ? ' due' : ' ok')}>{u.blocked ? 'Blocked' : 'Active'}</span></td>
                <td className="num">{fmt(u.saved)}</td>
                <td className="num">{fmt(u.tasks)}</td>
                <td>{formatDateTime(u.created_at)}</td>
                <td>
                  <div className="rowacts">
                    <button className="link" type="button" onClick={() => resetPassword(u)}>Password</button>
                    <button className="link" type="button" onClick={() => run(`/admin/users/${u.id}`, { method: 'PATCH', body: { blocked: !u.blocked } }, u.blocked ? 'Unblocked' : 'Blocked')}>
                      {u.blocked ? 'Unblock' : 'Block'}
                    </button>
                    <button className="link danger" type="button" onClick={() => remove(u)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
