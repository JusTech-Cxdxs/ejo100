import type { ReactNode } from 'react';

// Rendered per request so every customer-portal page carries that response's
// Content-Security-Policy nonce (middleware.ts). A page built ahead of time
// could not, and its scripts would be blocked.
export const dynamic = 'force-dynamic';

export default function CustomerPortalLayout({ children }: { children: ReactNode }) {
  return children;
}
