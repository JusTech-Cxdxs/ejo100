import { prisma } from '@ejo/database';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';
import { BROADCAST_CATEGORY, reaches } from '@/lib/notification-rules';

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
