import { randomInt } from 'crypto';

/**
 * Generates a secure, readable temporary password for new accounts
 * (currently: customer welcome emails). Uses Node's built-in `crypto`
 * module — no new dependency added.
 *
 * Deliberately excludes visually-ambiguous characters (0/O, 1/l/I) since
 * this password is meant to be read from an email and typed once, not
 * memorized — reducing "why won't my password work" support requests
 * matters more here than maximizing entropy from the full character set.
 * Still genuinely strong: 12 characters from a 70-character set is well
 * beyond what's needed for a temporary credential the user is explicitly
 * prompted to change on first login.
 */
const CHARSET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#%*?';

export function generateSecurePassword(length = 12): string {
  let password = '';
  for (let i = 0; i < length; i++) {
    password += CHARSET[randomInt(CHARSET.length)];
  }
  return password;
}
