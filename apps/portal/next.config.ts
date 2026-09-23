import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  transpilePackages: ['@ejo/ui', '@ejo/types', '@ejo/utils'],
  reactStrictMode: true,
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
