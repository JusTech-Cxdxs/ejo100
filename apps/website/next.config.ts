import type { NextConfig } from 'next';
import { PERMISSIONS_POLICY, STATIC_CSP } from './lib/security-headers';

/**
 * A production deployment on Vercel stops at build time when an address or
 * secret it depends on is missing, instead of running with a default. The
 * previous deployment stays live.
 */
const REQUIRED_IN_PRODUCTION = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'NEXT_PUBLIC_WEBSITE_URL', 'NEXT_PUBLIC_PORTAL_URL', 'NEXT_PUBLIC_ORGANISATION_NAME'];
if (process.env.VERCEL_ENV === 'production') {
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables for production: ${missing.join(', ')}. Set them in Vercel → Settings → Environment Variables (Production), then redeploy. See docs/OPERATIONS_CHECKLIST.md.`);
  }
}

const serverActionOrigins = (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  transpilePackages: ['@ejo/ui', '@ejo/types', '@ejo/utils'],
  reactStrictMode: true,
  // Don't advertise the framework.
  poweredByHeader: false,
  ...(serverActionOrigins.length > 0 ? { experimental: { serverActions: { allowedOrigins: serverActionOrigins } } } : {}),
  // The same security headers as the staff portal: the customer sign-in can
  // never be framed by another site (clickjacking), and so on.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Same rule as the policy's frame-ancestors 'self', for older browsers.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      // Marketing pages: the fixed policy. The customer portal and its API get
      // a per-request policy with a nonce from middleware.ts instead.
      {
        source: '/:path((?!customer-portal(?:/|$)|api/customer(?:/|$)).*)',
        headers: [{ key: 'Content-Security-Policy', value: STATIC_CSP }],
      },
      // The logo is shown inside emails, which load it from another site.
      { source: '/images/:path*', headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }] },
      // Customer portal pages and data are personal: never kept by a shared
      // cache or the back/forward cache (middleware.ts sets the same).
      ...['/customer-portal', '/customer-portal/:path*', '/api/customer/:path*'].map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      })),
    ];
  },
};

export default nextConfig;
