/**
 * Public addresses of the two sites, from the environment only:
 *
 *   NEXT_PUBLIC_WEBSITE_URL  this website and its customer portal
 *   NEXT_PUBLIC_PORTAL_URL   the staff portal (the "Employee login" link)
 *
 * In development a missing value falls back to the local dev port. In
 * production a missing value is a configuration error: it is logged once and
 * the link is left relative, so nothing ever points at another site.
 * next.config.ts also stops a Vercel production build when they are missing.
 */

const reported = new Set<string>();

function configError(name: string): void {
  if (reported.has(name)) return;
  reported.add(name);
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', at: 'config', message: `${name} is not set; links will be incomplete.` }));
}

function clean(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** This website's public address (no trailing slash). */
export function websiteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WEBSITE_URL;
  if (configured) return clean(configured);
  if (!isProduction()) return 'http://localhost:3000';
  configError('NEXT_PUBLIC_WEBSITE_URL');
  return '';
}

/** The staff portal's public address (no trailing slash), or '' when not configured in production. */
export function portalBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_PORTAL_URL;
  if (configured) return clean(configured);
  if (!isProduction()) return 'http://localhost:3001';
  configError('NEXT_PUBLIC_PORTAL_URL');
  return '';
}
