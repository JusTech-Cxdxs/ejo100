import 'server-only';
import { prisma } from '@ejo/database';
import { sendEmail } from '@/lib/email';
import { portalBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';
import { letterheadFor } from '@/lib/support/server';
import { renderWorkflowNoticeEmail, type WorkflowNoticeOptions } from '@/lib/email-templates/workflow-notice';

/**
 * Emails colleagues at a workflow step: the people who must act next, or who
 * asked and should hear the outcome. Each person once, active accounts of the
 * same organisation only, never the person who just acted. Never throws: a
 * failed email is logged and the work carries on (the bell still shows it).
 */
export async function emailColleagues(o: {
  branchId: string | null;
  /** When the record has no branch (a support request, say): its organisation. */
  organisationId?: string | null;
  userIds: (string | null | undefined)[];
  exceptUserId?: string | null;
  path: string;
  where: string;
  notice: Omit<WorkflowNoticeOptions, 'companyName' | 'logoUrl' | 'recipientName' | 'url'>;
}): Promise<number> {
  try {
    const ids = [...new Set(o.userIds.filter((x): x is string => Boolean(x) && x !== o.exceptUserId))];
    if (!ids.length) return 0;
    const branch = o.branchId ? await prisma.branch.findUnique({ where: { id: o.branchId }, select: { name: true, businessUnit: { select: { organisationId: true } } } }) : null;
    const organisationId = branch?.businessUnit.organisationId ?? o.organisationId ?? null;
    if (!organisationId) return 0;
    const [people, head] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: ids }, organisationId, isActive: true }, select: { fullName: true, email: true }, take: 25 }),
      letterheadFor(organisationId, o.branchId),
    ]);
    const url = `${portalBaseUrl()}${o.path}`;
    let sent = 0;
    for (const p of people) {
      const m = renderWorkflowNoticeEmail({ ...o.notice, companyName: head.companyName, logoUrl: head.logoUrl, recipientName: p.fullName, url, orgContext: o.notice.orgContext ?? [branch?.name] });
      try {
        await sendEmail(p.email, m.subject, m.html);
        sent += 1;
      } catch (err) {
        logFailure(`Could not email a colleague (${o.where})`, o.path, err);
      }
    }
    return sent;
  } catch (err) {
    logFailure(`Could not work out whom to email (${o.where})`, o.path, err);
    return 0;
  }
}
