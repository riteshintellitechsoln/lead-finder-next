// Where to go after logging in: only pages on this site (no "//evil.com", no login loop)
export const safeNext = (next) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
  && !next.startsWith('/login') && !next.startsWith('/signup') && !next.startsWith('/api/') ? next : null);
