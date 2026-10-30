import './globals.css';
import { ToastProvider } from '@/components/Toast';
import { SessionProvider } from '@/components/Session';
import { getUser } from '@/lib/auth';

export const metadata = {
  title: 'Lead Finder',
  description: 'Search people by job title, location, seniority, industry and company size.',
};

// The sidebar shells live in app/(shop)/layout.js (users) and app/admin/layout.js (admin)
// SessionProvider sits here so a guest's in-memory lists survive moving between pages
export default async function RootLayout({ children }) {
  const user = await getUser();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <ToastProvider>
          <SessionProvider user={user}>{children}</SessionProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
