import { prisma } from '@ejo/database';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';
import { BROADCAST_CATEGORY, reaches, isCustomerAudience } from '@/lib/notification-rules';
import { renderCustomerBroadcastEmail } from '@/lib/email-templates/customer-broadcast';

const CUSTOMER_BATCH = 5;

/** A customer broadcast by email: to the organisation's active customers who
 * want email updates (all, or those chosen), a few at a time. Each failure is
 * logged (Settings → Email delivery); a failure never stops the others. */
async function emailCustomers(b: { id: string; title: string; message: string; category: string; organisationId: string; audience: string; audienceIds: string[]; organisation: { name: string } }): Promise<{ sent: number; failed: number }> {
  const customers = await prisma.customer.findMany({
    where: { organisationId: b.organisationId, isActive: true, notifyByEmail: true, ...(b.audience === 'CUSTOMERS_SELECTED' ? { id: { in: b.audienceIds } } : {}) },
    select: { id: true, fullName: true, email: true },
  });
  const meta = BROADCAST_CATEGORY[b.category] ?? BROADCAST_CATEGORY.ANNOUNCEMENT!;
  const website = (process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app').replace(/\/+$/, '');
  let sent = 0, failed = 0;
  for (let i = 0; i < customers.length; i += CUSTOMER_BATCH) {
    const batch = customers.slice(i, i + CUSTOMER_BATCH);
    const results = await Promise.allSettled(batch.map((c: (typeof batch)[number]) => {
      const { subject, html } = renderCustomerBroadcastEmail({
        customerName: c.fullName, title: b.title, message: b.message, categoryLabel: meta.heading,
        portalUrl: `${website}/customer-portal`, logoUrl: `${website}/images/logo/logo.png`, companyName: b.organisation.name,
      });
      return sendEmail(c.email, subject, html);
    }));
    for (let k = 0; k < results.length; k += 1) {
      const r = results[k]!;
      const c = batch[k]!;
      if (r.status === 'fulfilled') { sent += 1; continue; }
      failed += 1;
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      await prisma.securityEmailLog.create({ data: { entityType: 'Broadcast', entityId: b.id, recipient: `${c.fullName} <${c.email}>`, subject: b.title.slice(0, 200), sent: false, error: reason.slice(0, 300) } }).catch(() => undefined);
    }
  }
  return { sent, failed };
}

/**
 * Emails every broadcast that is live, marked for email and not yet sent —
 * to everyone in its audience. Server-only (never a callable action). Each
 * broadcast is claimed first so two runs never both send it; one audit
 * entry records how many went out.
 */
export async function deliverDueBroadcastEmails(now: Date = new Date()): Promise<number> {
  const due = await prisma.broadcast.findMany({
    where: { isActive: true, sendEmail: true, emailedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { id: true, broadcastNumber: true, organisationId: true, category: true, title: true, message: true, audience: true, audienceIds: true, createdById: true, organisation: { select: { name: true } } },
  });
  let total = 0;
  for (const b of due) {
    const claimed = await prisma.broadcast.updateMany({ where: { id: b.id, emailedAt: null }, data: { emailedAt: now } });
    if (claimed.count === 0) continue;
    if (isCustomerAudience(b.audience)) {
      const r = await emailCustomers(b).catch(() => ({ sent: 0, failed: 0 }));
      await prisma.auditLog.create({ data: { userId: b.createdById, organisationId: b.organisationId, action: 'broadcast.emailed', entityType: 'Broadcast', entityId: b.id, metadata: { broadcastNumber: b.broadcastNumber, sent: r.sent, failed: r.failed, audience: 'customers' } } });
      total += r.sent;
      continue;
    }
    const users = await prisma.user.findMany({ where: { organisationId: b.organisationId, isActive: true }, select: { fullName: true, email: true, branchId: true, departmentId: true, roles: { select: { role: { select: { slug: true } } } } } });
    const audience = users.filter((u: (typeof users)[number]) => u.email && reaches(b, { branchId: u.branchId, departmentId: u.departmentId, roleSlugs: u.roles.map((r: { role: { slug: string } }) => r.role.slug) }));
    const meta = BROADCAST_CATEGORY[b.category] ?? BROADCAST_CATEGORY.ANNOUNCEMENT!;
    const portal = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    let sent = 0, failed = 0;
    for (const u of audience) {
      try {
        await sendEmail(u.email, `${meta.icon} ${meta.heading}: ${b.title}`, renderWarrantyStaffNoticeEmail({
          recipientName: u.fullName, heading: `${meta.icon} ${b.title}`, lines: b.message.split(/\n+/).map((l: string) => l.trim()).filter(Boolean),
          actionUrl: `${portal}/notifications?tab=broadcasts`, logoUrl: `${portal}/images/logo/logo.png`, companyName: b.organisation.name, branchName: meta.heading,
        }));
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    await prisma.auditLog.create({ data: { userId: b.createdById, action: 'broadcast.emailed', entityType: 'Broadcast', entityId: b.id, metadata: { broadcastNumber: b.broadcastNumber, sent, failed } } });
    total += sent;
  }
  return total;
}
