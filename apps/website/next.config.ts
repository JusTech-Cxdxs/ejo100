import type { NextConfig } from 'next';

// Content-Security-Policy (SEC-04): only this site's own scripts, styles,
// fonts and connections (nothing external). Next.js still needs inline
// scripts for hydration, hence 'unsafe-inline' (a nonce-based policy is the
// planned next step); development also needs 'unsafe-eval' for fast refresh.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
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

const nextConfig: NextConfig = {
  transpilePackages: ['@ejo/ui', '@ejo/types', '@ejo/utils'],
  reactStrictMode: true,
  // Don't advertise the framework.
  poweredByHeader: false,
  // The same security headers as the staff portal — the customer sign-in can
  // never be framed by another site (clickjacking), and so on.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      // The logo is shown inside emails, which load it from another site.
      { source: '/images/:path*', headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }] },
      // Customer portal pages and data are personal — never kept by a shared
      // cache or the back/forward cache (middleware.ts sets the same).
      ...['/customer-portal', '/customer-portal/:path*', '/api/customer/:path*'].map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      })),
    ];
  },
};

export default nextConfig;
