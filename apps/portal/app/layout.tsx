import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { portalConfig } from '@/lib/site-config';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  // Browser-tab and home-screen icons: the company logo (public/icons, made from public/images/logo/logo.png).
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    shortcut: '/icons/favicon-32.png',
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  title: portalConfig.productName,
  description: portalConfig.poweredBy,
  // Added to an iPhone's home screen it opens full screen, named after the organisation.
  appleWebApp: { capable: true, title: portalConfig.organisationName, statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the app use the whole screen on phones with a notch; the shell pads itself with env(safe-area-inset-*).
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e10600' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

// Every page is rendered per request so it can carry that response's
// Content-Security-Policy nonce (middleware.ts); a page built ahead of time
// could not, and its scripts would be blocked.
export const dynamic = 'force-dynamic';

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
