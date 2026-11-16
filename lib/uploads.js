// Why a row of an admin upload was left out, in words (browser and server).
// A row of import_skipped: reason 'wrong' | 'in_data' | 'in_file' and its detail (see lib/schema.js).
export const UPLOAD_LABELS = {
  employees: 'Company headcount', department: 'Function', seniority: 'Seniority level', country: 'Country', industry: 'Industry',
};

export function whyText(r) {
  if (r.reason === 'wrong') return `Wrong or empty: ${String(r.detail || '').split(',').map((k) => UPLOAD_LABELS[k] || k).join(', ')}`;
  if (r.reason === 'in_data') return `Already in the data (same ${r.detail === 'Email' ? 'email' : 'name and company'})`;
  return `Repeated in the file (same as row ${r.detail})`;
}
