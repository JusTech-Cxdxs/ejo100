import { randomInt } from 'crypto';

/**
 * A readable random password (Node crypto). Leaves out look-alike
 * characters (0/O, 1/l/I) because it is read from an email and typed once;
 * 12 characters from this set is ample for a one-time credential.
 */
const CHARSET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#%*?';

export function generateSecurePassword(length = 12): string {
  let password = '';
  for (let i = 0; i < length; i++) {
    password += CHARSET[randomInt(CHARSET.length)];
  }
  return password;
}
