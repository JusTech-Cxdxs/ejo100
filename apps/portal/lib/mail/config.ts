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
  return process.env.MAILBOX_ALLOW_INSECURE === '1' && process.env.VERCEL_ENV !== 'production';
}

export const NOT_SET_UP = 'Work email is not set up by your administrator yet.';
