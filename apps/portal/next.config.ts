import type { NextConfig } from 'next';
import path from 'path';

// Content-Security-Policy (SEC-04): only this site's own scripts, styles,
// fonts and connections (plus Supabase realtime). Next.js still needs inline
// scripts for hydration, hence 'unsafe-inline' (a nonce-based policy is the
// planned next step); development also needs 'unsafe-eval' for fast refresh.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
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

const nextConfig: NextConfig = {
  transpilePackages: ['@ejo/ui', '@ejo/types', '@ejo/utils'],
  reactStrictMode: true,
  // Don't advertise the framework.
  poweredByHeader: false,
  // Addresses of modules planned next open their roadmap page.
  async redirects() {
    const planned = ['hr', 'payroll', 'finance', 'procurement', 'suppliers', 'warehouse', 'manufacturing', 'documents', 'reports', 'branding', 'help'];
    return [
      ...planned.map((k) => ({ source: `/${k}`, destination: `/roadmap/${k}`, permanent: false })),
      { source: '/module-registry', destination: '/roadmap', permanent: false },
      ...['business-units', 'departments', 'teams', 'countries', 'states', 'cities'].map((k) => ({ source: `/${k}`, destination: '/structure', permanent: false })),
    ];
  },
  // Security headers on every response.
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
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          // Blocks plugins, foreign form targets, base-URL hijacking and being
          // framed by other sites — without breaking Next.js's own scripts.
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      // The logo is shown inside emails, which load it from another site.
      { source: '/images/:path*', headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' }] },
    ];
  },
  // This is an npm workspaces monorepo (apps/*, packages/*) — a
  // transitive dependency like pdfkit (pulled in by
  // @react-pdf/renderer) gets hoisted to the real repo ROOT's
  // node_modules, not apps/portal/node_modules. Without this,
  // Next.js's own file-tracing root defaults to apps/portal itself,
  // so the outputFileTracingIncludes glob below silently matches
  // nothing — the real, actual cause of a real, recurring production
  // error, confirmed directly: a fresh `npm install` at the repo
  // root places pdfkit at ./node_modules/pdfkit, never inside
  // apps/portal/node_modules at all.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // The real, known cause of a real, recurring production error:
  // @react-pdf/renderer's own transitive dependency, pdfkit, loads its
  // standard font files (.afm/.cjs) from disk at runtime via a
  // relative path Next.js's own static analysis can't always follow —
  // so those files can genuinely get left out of the serverless
  // function bundle even though the code that needs them is included.
  // Server Actions can be invoked from effectively any route, so this
  // explicitly traces pdfkit's font files into every real function
  // bundle, not just the one route that happens to render the PDF.
  // Confirmed directly, by building a minimal reproduction of this
  // monorepo's exact layout: outputFileTracingIncludes globs stay
  // relative to THIS config file's own directory (apps/portal), never
  // to outputFileTracingRoot above, no matter where that root points —
  // a real, subtle Next.js behavior, not the intuitive one. pdfkit's
  // real, hoisted location is two levels up from here.
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/pdfkit/js/standard-fonts/**'],
  },
};

export default nextConfig;
