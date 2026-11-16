'use client';
// Logs the person out after `minutes` without activity (mouse, keys, scroll, touch) in any tab
// of the site, and sends them to /login with `message`. While they are active the session is
// kept alive on the server with a small ping (at most once a minute); the server also ends
// sessions that were not used for that long (lib/auth.js), e.g. when the browser was closed.
//   <IdleLogout minutes={5} message="You were logged out ..." />
import { useEffect } from 'react';

const KEY = 'lf_last_activity'; // shared by all tabs, so activity in one tab keeps the others in too
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'];
const PING_MS = 60_000;
const CHECK_MS = 10_000;

export default function IdleLogout({ minutes, message }) {
  useEffect(() => {
    if (!minutes) return undefined;
    const limit = minutes * 60_000;
    let last = Date.now();
    let lastPing = Date.now();
    let done = false;
    const store = (t) => { try { localStorage.setItem(KEY, String(t)); } catch { /* private mode */ } };
    const lastActivity = () => {
      try { return Math.max(last, Number(localStorage.getItem(KEY)) || 0); } catch { return last; }
    };

    async function logout() {
      if (done) return;
      done = true;
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      const next = window.location.pathname + window.location.search;
      window.location.href = `/login?${new URLSearchParams({ next, error: message })}`;
    }
    function onActivity() {
      const now = Date.now();
      if (done || now - last < 1000) return;
      last = now;
      store(now);
      if (now - lastPing > PING_MS) {
        lastPing = now;
        fetch('/api/auth/ping', { method: 'POST' }).then((r) => { if (r.status === 401) logout(); }, () => {});
      }
    }
    function check() {
      if (!done && Date.now() - lastActivity() >= limit) logout();
    }

    store(last); // opening a page counts as activity
    for (const e of EVENTS) window.addEventListener(e, onActivity, { passive: true });
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, CHECK_MS);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, onActivity);
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, [minutes, message]);
  return null;
}
