/**
 * Public addresses of the two sites, for links in emails, printouts and
 * notifications. Every address comes from the environment, so a new
 * deployment (or a custom domain) never needs a code change.
 *
 *   NEXT_PUBLIC_PORTAL_URL   this staff portal (falls back to BETTER_AUTH_URL)
 *   NEXT_PUBLIC_WEBSITE_URL  the public website and customer portal
 *
 * In development a missing value falls back to the local dev port. In
 * production a missing value is a configuration error: it is logged once and
 * the link is left relative, so a message never points at another site.
 * next.config.ts also stops a Vercel production build when they are missing.
 */

const reported = new Set<string>();

function configError(name: string): void {
  if (reported.has(name)) return;
  reported.add(name);
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', at: 'config', message: `${name} is not set; links in emails and printouts will be incomplete.` }));
}

function clean(url: string): string {
  return url.trim().replace(/\/api\/auth\/?$/, '').replace(/\/+$/, '');
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** The portal's public address (no trailing slash). */
export function portalBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_PORTAL_URL || process.env.BETTER_AUTH_URL;
  if (configured) return clean(configured);
  if (!isProduction()) return 'http://localhost:3001';
  configError('NEXT_PUBLIC_PORTAL_URL');
  return '';
}

/** The public website's address (no trailing slash); the customer portal lives under /customer-portal. */
export function websiteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WEBSITE_URL;
  if (configured) return clean(configured);
  if (!isProduction()) return 'http://localhost:3000';
  configError('NEXT_PUBLIC_WEBSITE_URL');
  return '';
}
