import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { portalConfig } from '@/lib/site-config';
import './globals.css';

export const metadata: Metadata = {
  // Browser-tab icon: the company logo (not the default globe).
  icons: { icon: [{ url: '/images/logo/logo.png', type: 'image/png' }], shortcut: '/images/logo/logo.png', apple: '/images/logo/logo.png' },
  title: portalConfig.productName,
  description: portalConfig.poweredBy,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
