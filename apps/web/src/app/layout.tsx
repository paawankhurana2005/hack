import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { RoleProvider } from '@/lib/role-context';
import { TopNav } from '@/components/layout/top-nav';

export const metadata: Metadata = {
  title: 'ReLoop — Recommerce, Rewired',
  description:
    'ReLoop is the invisible AI layer that turns Amazon returns into a regenerative loop. Real-time grading, smart routing, instant trust.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-surface font-sans text-foreground antialiased">
        <RoleProvider>
          <TopNav />
          <main>{children}</main>
        </RoleProvider>
      </body>
    </html>
  );
}
