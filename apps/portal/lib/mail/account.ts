import type { ServerSettings } from './transport';
import { decryptSecret, secretAad, MailCryptoError } from './crypto';
import { mailAllowInsecure, mailKey } from './config';
import { securityFromFlag } from './rules';

/**
 * A stored mailbox row → the settings to connect with. The password is
 * decrypted only here, only in memory, only for the connection being made.
 * Server-only.
 */
export type StoredAccount = {
  id: string;
  userId: string;
  address: string;
  displayName: string | null;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  secret: string;
};

export const ACCOUNT_SECRET_SELECT = {
  id: true, userId: true, address: true, displayName: true, imapHost: true, imapPort: true, imapSecure: true,
  smtpHost: true, smtpPort: true, smtpSecure: true, username: true, secret: true,
} as const;

export function connectionSettings(a: StoredAccount): { imap: ServerSettings; smtp: ServerSettings } {
  const key = mailKey();
  if (!key) throw new MailCryptoError('Work email is not set up by your administrator yet.');
  const password = decryptSecret(a.secret, key, secretAad(a.userId, a.address));
  const insecure = mailAllowInsecure();
  return {
    imap: { host: a.imapHost, port: a.imapPort, security: securityFromFlag(a.imapSecure, insecure), username: a.username, password },
    smtp: { host: a.smtpHost, port: a.smtpPort, security: securityFromFlag(a.smtpSecure, insecure), username: a.username, password },
  };
}

/** Per-instance limits (a second line of defence; the mail servers have their own). */
const hits = new Map<string, number[]>();
export function withinLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(key, list);
  return true;
}
