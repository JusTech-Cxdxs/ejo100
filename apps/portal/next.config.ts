import type { NextConfig } from 'next';
import path from 'path';
import { PERMISSIONS_POLICY } from './lib/security-headers';

/**
 * A production deployment on Vercel stops at build time when an address or
 * secret it depends on is missing, instead of sending emails with broken links
 * or running with a default. The previous deployment stays live.
 */
const REQUIRED_IN_PRODUCTION = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_PORTAL_URL', 'NEXT_PUBLIC_WEBSITE_URL', 'NEXT_PUBLIC_ORGANISATION_NAME', 'CRON_SECRET'];
if (process.env.VERCEL_ENV === 'production') {
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables for production: ${missing.join(', ')}. Set them in Vercel → Settings → Environment Variables (Production), then redeploy. See docs/OPERATIONS_CHECKLIST.md.`);
  }
}

/** Extra origins allowed to call server actions, e.g. when a proxy in front changes the host. Comma-separated host names. */
const serverActionOrigins = (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  transpilePackages: ['@ejo/ui', '@ejo/types', '@ejo/utils', '@ejo/enyo'],
  reactStrictMode: true,
  // Don't advertise the framework.
  poweredByHeader: false,
  ...(serverActionOrigins.length > 0 ? { experimental: { serverActions: { allowedOrigins: serverActionOrigins } } } : {}),
  // Addresses of modules planned next open their roadmap page.
  async redirects() {
    const planned = ['hr', 'payroll', 'finance', 'documents', 'reports', 'branding', 'help'];
    return [
      ...planned.map((k) => ({ source: `/${k}`, destination: `/roadmap/${k}`, permanent: false })),
      { source: '/module-registry', destination: '/roadmap', permanent: false },
      ...['business-units', 'departments', 'teams', 'countries', 'states', 'cities'].map((k) => ({ source: `/${k}`, destination: '/structure', permanent: false })),
    ];
  },
  // Security headers on every response. The Content-Security-Policy is set
  // per request by middleware.ts, because it carries a fresh nonce.
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
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      // The logo is shown inside emails, which load it from another site.
      { source: '/images/:path*', headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }] },
    ];
  },
  // npm workspaces hoist pdfkit (a dependency of @react-pdf/renderer) to the
  // repository root, so file tracing must start there.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // pdfkit reads its standard font files from disk at run time, which file
  // tracing cannot see. Server actions can render a PDF from any route, so the
  // fonts go into every function. The glob is relative to this file, not to
  // outputFileTracingRoot.
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/pdfkit/js/standard-fonts/**'],
  },
};

export default nextConfig;
