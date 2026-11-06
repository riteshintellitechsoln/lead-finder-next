// Browser-side helpers for calling the API
import { useEffect, useRef, useState } from 'react';

export async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // Session expired or logged out in another tab
  if (res.status === 401 && path !== '/auth/login') window.location.href = '/login';
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return data;
}

const TIMEOUT_MS = 30_000;

// Loads `url` whenever it changes (url = null skips). The previous request is
// aborted, so quick clicking never piles up work on the server (it stops the
// database query too), and the old data stays on screen while the new data
// loads. After 30 seconds it gives up with a clear message.
export function useFetch(url, { debounce = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: '', loading: Boolean(url) });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!url) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    const id = ++latest.current;
    const ctrl = new AbortController();
    let timedOut = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const timer = setTimeout(async () => {
      const killer = setTimeout(() => { timedOut = true; ctrl.abort(); }, TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
        if (id === latest.current) setState({ data, error: '', loading: false });
      } catch (e) {
        if (id !== latest.current || (e.name === 'AbortError' && !timedOut)) return;
        setState((s) => ({ ...s, loading: false, error: timedOut ? 'The server took too long. Try a narrower search.' : e.message }));
      } finally {
        clearTimeout(killer);
      }
    }, debounce);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [url, nonce, debounce]);

  return { ...state, retry: () => setNonce((n) => n + 1) };
}

// Starts a file download (the server replies with Content-Disposition: attachment)
export function download(url) {
  const a = document.createElement('a');
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Tells the sidebar to refresh its badge counts
export const notifyStatsChanged = () => window.dispatchEvent(new Event('stats-changed'));
