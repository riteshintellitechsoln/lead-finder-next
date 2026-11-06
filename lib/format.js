// Formatting helpers shared by server and client components (no database code here)
import { SIZE_EDGES, SIZE_KEYS, SIZE_LABELS } from './options.js';

export const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export { SIZE_LABELS };

export const sizeLabel = (n) => {
  if (n == null) return '–';
  const i = SIZE_EDGES.findIndex((e) => n <= e);
  return SIZE_LABELS[SIZE_KEYS[i < 0 ? SIZE_KEYS.length - 1 : i]];
};

export const REVENUE_LABELS = {
  '0-1M': '< $1M',
  '1M-10M': '$1M–10M',
  '10M-50M': '$10M–50M',
  '50M-100M': '$50M–100M',
  '100M-500M': '$100M–500M',
  '500M-1B': '$500M–1B',
  '1B+': '$1B+',
};

// 12500000 -> "$12.5M"
const usd = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'USD' });
export const revenueLabel = (n) => (n == null ? '' : usd.format(n));

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const formatDue = (d) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No date';


// SQLite "2026-10-28 09:15:00" (UTC) -> local "28 Oct 2026, 2:45 pm"
export const formatDateTime = (s) =>
  s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–';

// Short form for big totals, like Apollo: 850 -> "850", 3597 -> "3.6K", 1000000 -> "1M", 250400000 -> "250.4M"
const compactFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const compact = (n) => compactFormat.format(Number(n || 0));
