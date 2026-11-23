import { initials } from '@/lib/format';

// label: what to show instead of the full name (e.g. only the first name in a First name column)
export default function PersonCell({ person, label, showSaved = false, hideTitle = false }) {
  return (
    <div className="person">
      <div className="av">{initials(person.name)}</div>
      <div>
        <div className="pname">
          {label ?? person.name} {showSaved && person.saved ? <span className="pill ok">Saved</span> : null}
        </div>
        {!hideTitle && <div className="ptitle">{person.title || '–'}</div>}
      </div>
    </div>
  );
}

export function EmailCell({ email }) {
  return email ? <span className="email">{email}</span> : <span className="meta">Not available</span>;
}

const STATUS_CLASS = { Verified: 'ok', Invalid: 'due' };
const shortDate = (d) => new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Email with its status and verified date, then phone numbers
export function ContactCell({ person: p }) {
  return (
    <div className="contact">
      <EmailCell email={p.email} />
      {p.email && (p.email_status || p.verified_at) && (
        <div className="meta">
          {p.email_status && <span className={'pill ' + (STATUS_CLASS[p.email_status] || '')}>{p.email_status}</span>}
          {p.verified_at && <> verified {shortDate(p.verified_at)}</>}
        </div>
      )}
      {p.phone && <div className="phone"><span className="meta">Phone</span> {p.phone}</div>}
      {p.direct_phone && <div className="phone"><span className="meta">Direct</span> {p.direct_phone}</div>}
    </div>
  );
}
