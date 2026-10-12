import { themeInitScript } from './theme-init-script';

/**
 * Security headers shared by next.config.ts and middleware.ts. Edge-safe.
 *
 * Two Content-Security-Policies:
 *  - the customer portal (signed-in, personal data) gets a strict policy with
 *    a fresh nonce per response, set by middleware.ts;
 *  - the marketing pages are built ahead of time and hold no personal data or
 *    user input, so they keep a fixed policy that still needs 'unsafe-inline'
 *    for Next.js's inline scripts (a fixed page cannot carry a per-request nonce).
 */

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

function policy(scriptSrc: string): string {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
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

/** Marketing pages (fixed, built ahead of time). */
export const STATIC_CSP = policy("'self' 'unsafe-inline'");

let themeHash: Promise<string> | null = null;

/** sha256 of the inline theme script in app/layout.tsx. */
export function themeScriptHash(): Promise<string> {
  themeHash ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(themeInitScript)).then((buf) => {
    let bin = '';
    for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
    return `'sha256-${btoa(bin)}'`;
  });
  return themeHash;
}

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Customer portal: only scripts with this response's nonce, the theme script, and what they load. */
export function nonceCsp(nonce: string, themeHashSource: string): string {
  return policy(`'self' 'nonce-${nonce}' ${themeHashSource} 'strict-dynamic'`);
}
