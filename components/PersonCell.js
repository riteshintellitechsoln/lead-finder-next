import { initials } from '@/lib/format';

export default function PersonCell({ person, showSaved = false }) {
  return (
    <div className="person">
      <div className="av">{initials(person.name)}</div>
      <div>
        <div className="pname">
          {person.name} {showSaved && person.saved ? <span className="pill ok">Saved</span> : null}
        </div>
        <div className="ptitle">{person.title || '–'}</div>
      </div>
    </div>
  );
}

export function EmailCell({ email }) {
  return email ? <span className="email">{email}</span> : <span className="meta">Not available</span>;
}
