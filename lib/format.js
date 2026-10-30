// Formatting helpers shared by server and client components (no database code here)
export const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .map((x) => x[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const SIZE_LABELS = {
  '1-50': '1–50',
  '51-200': '51–200',
  '201-1000': '201–1,000',
  '1001-5000': '1,001–5,000',
  '5000+': '5,000+',
};

export const sizeLabel = (n) =>
  n == null ? '–' : n <= 50 ? '1–50' : n <= 200 ? '51–200' : n <= 1000 ? '201–1,000' : n <= 5000 ? '1,001–5,000' : '5,000+';

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const formatDue = (d) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No date';


// SQLite "2026-10-28 09:15:00" (UTC) -> local "28 Oct 2026, 2:45 pm"
export const formatDateTime = (s) =>
  s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–';

// Short form for big totals, like Apollo: 850 -> "850", 3597 -> "3.6K", 1000000 -> "1M", 250400000 -> "250.4M"
const compactFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const compact = (n) => compactFormat.format(Number(n || 0));
