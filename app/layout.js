import './globals.css';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { ToastProvider } from '@/components/Toast';

export const metadata = {
  title: 'Lead Finder',
  description: 'Search people by job title, location, seniority, industry and company size.',
};

export default function RootLayout({ children }) {
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
          <div className="shell">
            <Sidebar />
            <div className="main">
              <TopBar />
              {children}
            </div>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
