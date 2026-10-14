import { prisma } from '@ejo/database';
import { mailKey } from './config';

/**
 * Unread messages in this person's OWN connected mailbox (the menu badge).
 * Server-only; the caller passes the signed-in person's id and must not call
 * it during an assisted session. 0 when mail is not set up or not connected.
 */
export async function mailUnreadFor(userId: string): Promise<number> {
  if (!mailKey() || !userId) return 0;
  return prisma.mailMessage.count({ where: { account: { userId }, folder: 'INBOX', seen: false } }).catch(() => 0);
}
