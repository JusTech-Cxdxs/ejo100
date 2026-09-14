import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ejo/ui', '@ejo/types', '@ejo/utils'],
  reactStrictMode: true,
  // The real, known cause of a real, recurring production error:
  // @react-pdf/renderer's own transitive dependency, pdfkit, loads its
  // standard font files (.afm/.cjs) from disk at runtime via a
  // relative path Next.js's own static analysis can't always follow —
  // so those files can genuinely get left out of the serverless
  // function bundle even though the code that needs them is included.
  // Server Actions can be invoked from effectively any route, so this
  // explicitly traces pdfkit's font files into every real function
  // bundle, not just the one route that happens to render the PDF.
  outputFileTracingIncludes: {
    '/**': ['./node_modules/pdfkit/js/standard-fonts/**'],
  },
};

export default nextConfig;
