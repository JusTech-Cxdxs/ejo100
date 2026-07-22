import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { portalConfig } from '@/lib/site-config';
import './globals.css';

export const metadata: Metadata = {
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
