// Centered card used by the sign-in and sign-up pages
export default function AuthCard({ title, subtitle, children }) {
  return (
    <main className="auth">
      <div className="card authcard">
        <div className="brand dark">
          <div className="mark">
            <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" />
            </svg>
          </div>
          <span>Lead Finder</span>
        </div>
        <h2>{title}</h2>
        {subtitle && <p className="meta">{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}
