import { THEME_BOOT_SCRIPT } from './theme';

/**
 * Security headers shared by next.config.ts (static headers) and
 * middleware.ts (the per-request Content-Security-Policy). Edge-safe: no
 * Node APIs, so the middleware can import it.
 */

/** Browser features the portal never uses are switched off for every page. */
export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'autoplay=()',
  'bluetooth=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'publickey-credentials-get=()',
  'serial=()',
  'usb=()',
  'xr-spatial-tracking=()',
].join(', ');

let themeHash: Promise<string> | null = null;

/** sha256 of the inline theme script in app/layout.tsx, so the policy allows exactly that script. */
export function themeScriptHash(): Promise<string> {
  themeHash ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(THEME_BOOT_SCRIPT)).then((buf) => {
    let bin = '';
    for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
    return `'sha256-${btoa(bin)}'`;
  });
  return themeHash;
}

/** A fresh random nonce for one response. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * The Content-Security-Policy for one response. Scripts run only when they
 * carry this response's nonce (Next.js adds it to its own scripts) or match
 * the theme script's hash; 'strict-dynamic' lets those scripts load the app's
 * chunks. Inline styles stay allowed because React style attributes need it.
 * Development also needs 'unsafe-eval' for fast refresh.
 */
export function contentSecurityPolicy(nonce: string, themeHashSource: string): string {
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${themeHashSource} 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}
