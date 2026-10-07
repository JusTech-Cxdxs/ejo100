import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { portalConfig } from '@/lib/site-config';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  // Browser-tab icon: the company logo (not the default globe).
  icons: { icon: [{ url: '/images/logo/logo.png', type: 'image/png' }], shortcut: '/images/logo/logo.png', apple: '/images/logo/logo.png' },
  title: portalConfig.productName,
  description: portalConfig.poweredBy,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme attribute is set before paint by the boot script (Light / Dark /
    // System, see lib/theme.ts) — React must not "correct" it on hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
