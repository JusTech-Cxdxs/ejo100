import type { Viewport } from 'next';
import type { ReactNode } from 'react';

// Rendered per request so every customer-portal page carries that response's
// Content-Security-Policy nonce (middleware.ts). A page built ahead of time
// could not, and its scripts would be blocked.
export const dynamic = 'force-dynamic';

// The installed customer portal uses the whole screen on phones with a notch;
// PortalShell pads its header, drawer and quick bar with env(safe-area-inset-*).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e10600' },
    { media: '(prefers-color-scheme: dark)', color: '#120606' },
  ],
};

export default function CustomerPortalLayout({ children }: { children: ReactNode }) {
  return children;
}
