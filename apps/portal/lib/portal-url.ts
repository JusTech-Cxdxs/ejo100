/** The portal's public address (no trailing slash), for links in emails. */
export function portalBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_PORTAL_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3001')
    .replace(/\/api\/auth\/?$/, '')
    .replace(/\/$/, '');
}
