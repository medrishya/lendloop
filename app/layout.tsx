// app/layout.tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { ConvexClientProvider } from '@/components/ConvexClientProvider';
import { UserSyncBanner } from '@/components/UserSyncBanner';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'LendLoop — Borrow what you need. Lend what you don’t.',
  description: 'Borrow and lend tools with neighbors safely and transparently.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-50 font-sans text-slate-900 antialiased`}
      >
        <ConvexClientProvider>
          <UserSyncBanner />
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}
