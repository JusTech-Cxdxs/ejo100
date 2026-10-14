import { readMailKey } from './crypto';

/**
 * Is the mail feature set up on this server? It needs MAILBOX_ENCRYPTION_KEY
 * (32 random bytes, base64). Without it the Mail pages say "not set up by
 * your administrator" and nothing is stored. Server-only.
 */
export function mailKey(): Buffer | null {
  return readMailKey();
}

export function mailFeatureReady(): boolean {
  return mailKey() !== null;
}

/**
 * Test servers only (CI's GreenMail on localhost): allows unencrypted
 * connections, any port and private addresses. Never set in production.
 */
export function mailAllowInsecure(): boolean {
  if (process.env.MAILBOX_ALLOW_INSECURE !== '1') return false;
  // Only on a developer machine (not a production build) or inside CI. Any real
  // deployment — Vercel production or preview, Render, a company server — runs
  // a production build without CI=true, so the flag is ignored there.
  const allowed = process.env.VERCEL_ENV !== 'production' && (process.env.NODE_ENV !== 'production' || process.env.CI === 'true');
  if (allowed && !warned) {
    warned = true;
    console.warn('[mail] MAILBOX_ALLOW_INSECURE is on: plain connections, any port and private addresses are allowed. Test servers only.');
  }
  return allowed;
}
let warned = false;

export const NOT_SET_UP = 'Work email is not set up by your administrator yet.';
