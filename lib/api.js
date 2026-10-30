// Browser-side helpers for calling the API
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
