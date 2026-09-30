import { prisma } from '@ejo/database';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';

export type Recipient = { fullName: string; email: string };

/**
 * Send a staff email and ALWAYS record it — recipient, subject, sent or the
 * error — in the email log and the record's audit trail. Server-only (never
 * a callable action). A failed email never throws.
 */
export async function sendLoggedEmail(opts: { entityType: string; entityId: string; recipients: Recipient[]; subject: string; heading: string; lines: string[]; path: string; actorId: string | null }) {
  const unique = opts.recipients.filter((r, i, a) => r.email && a.findIndex((x) => x.email === r.email) === i);
  if (unique.length === 0) return;
  const branch = await prisma.branch.findFirst({ select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } }).catch(() => null);
  const portal = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
  for (const r of unique) {
    let sent = true;
    let error: string | null = null;
    try {
      await sendEmail(r.email, opts.subject, renderWarrantyStaffNoticeEmail({ recipientName: r.fullName, heading: opts.heading, lines: opts.lines, actionUrl: `${portal}${opts.path}`, logoUrl: `${portal}/images/logo/logo.png`, companyName: branch?.businessUnit?.organisation?.name ?? 'EJO 100', branchName: branch?.name ?? '' }));
    } catch (err) {
      sent = false;
      error = err instanceof Error ? err.message.slice(0, 300) : 'Unknown error';
    }
    await prisma.securityEmailLog.create({ data: { entityType: opts.entityType, entityId: opts.entityId, recipient: `${r.fullName} <${r.email}>`, subject: opts.subject, sent, error } });
    await prisma.auditLog.create({ data: { userId: opts.actorId, action: sent ? 'security.email_sent' : 'security.email_failed', entityType: opts.entityType, entityId: opts.entityId, metadata: { to: r.fullName, subject: opts.subject, ...(error ? { error } : {}) } } });
  }
}
