// Sign-in / sign-up page: the form on the left, a preview of the product on the right
import Link from 'next/link';
import LoginForm from './LoginForm';
import { fmt } from '@/lib/format';

export default function AuthCard({ mode, next, error, googleOn, signupOn, totalPeople }) {
  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  return (
    <main className="authpage">
      <header className="authtop">
        <div className="brand dark">
          <div className="mark">
            <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" />
            </svg>
          </div>
          <span>Lead Finder</span>
        </div>
      </header>

      <div className="authgrid">
        <section className="authleft">
          <div className="authtabs" role="tablist" aria-label="Log in or sign up">
            <Link role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} href={`/login${q}`}>Log In</Link>
            {signupOn && <Link role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} href={`/signup${q}`}>Sign Up</Link>}
          </div>
          <LoginForm key={mode} mode={mode} next={next} error={error} googleOn={googleOn} signupOn={signupOn} />
        </section>

        <aside className="authright" aria-hidden="true">
          <div className="demo">
            <div className="demowin">
              <i /><i /><i />
            </div>
            <div className="democard">
              <div className="demohead">
                <span className="on">Person</span>
                <span>Company</span>
              </div>
              <div className="demoperson">
                <div className="av">AS</div>
                <div>
                  <b>Ananya Sharma</b>
                  <div className="meta">Head of Sales at Northwind Labs</div>
                  <span className="pill ok">Verified email</span>
                </div>
              </div>
              <div className="demoacts">
                <span><svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4z" /></svg>Save</span>
                <span><svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></svg>Add task</span>
                <span><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16" /></svg>Download</span>
              </div>
              <div className="demorow">
                <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg>
                <div>ananya@northwindlabs.in<div className="meta">Work</div></div>
              </div>
              <div className="demorow">
                <svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
                <div>+91 98xxx xx210<div className="meta">Direct</div></div>
              </div>
            </div>
          </div>
          <div className="authpitch">
            <b>{totalPeople ? `${fmt(totalPeople)}+` : 'Millions of'}</b>
            <p>people to search by job title, company, location and more, with verified emails and phone numbers.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
