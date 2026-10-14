import { prisma } from '@ejo/database';

/**
 * Retention for Enyo chats (data inventory: EnyoConversation): staff and
 * customer conversations are removed 12 months after their last message,
 * public website chats after 90 days. Messages go with their conversation
 * (cascade). Server-only; run daily by /api/cron/pricing-alerts.
 */
export const STAFF_CUSTOMER_RETENTION_DAYS = 365;
export const PUBLIC_RETENTION_DAYS = 90;
export const DELETED_RETENTION_DAYS = 30;

export async function purgeOldEnyoConversations(now: Date = new Date()): Promise<{ staffAndCustomer: number; publicChats: number }> {
  const before = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const [kept, pub, deleted] = await Promise.all([
    prisma.enyoConversation.deleteMany({ where: { channel: { in: ['STAFF', 'CUSTOMER'] }, updatedAt: { lt: before(STAFF_CUSTOMER_RETENTION_DAYS) } } }),
    prisma.enyoConversation.deleteMany({ where: { channel: 'PUBLIC', updatedAt: { lt: before(PUBLIC_RETENTION_DAYS) } } }),
    // Chats a person deleted are hidden at once and removed for good after 30 days.
    prisma.enyoConversation.deleteMany({ where: { archivedAt: { lt: before(DELETED_RETENTION_DAYS) } } }),
  ]);
  return { staffAndCustomer: kept.count + deleted.count, publicChats: pub.count };
}
