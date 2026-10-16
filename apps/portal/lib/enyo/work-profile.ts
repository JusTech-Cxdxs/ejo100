import 'server-only';
/**
 * How this person works here — so Enyo can tailor its answers to their job
 * without being told every time: their branch and department, and what they
 * do most in the portal (their own business actions in the last 60 days,
 * counted). Only for that person's own chat; never shown to anyone else and
 * never used for training. Nothing during an assisted session (the colleague's
 * habits are theirs).
 */
import { prisma } from '@ejo/database';
import { securityActionLabel } from '@/lib/security-labels';

const DAYS = 60;
// Never counted: system and personal actions, and anything private (integrity, Speak up, refused pages, help requests, mail).
const SKIP = /^(system\.|auth\.|session\.|notification|enyo\.|mailbox\.|user\.sign|integrity\.|access\.|support\.help_|assist\.)/;

export async function workProfile(userId: string, organisationId: string | null): Promise<string | null> {
  try {
    const since = new Date(Date.now() - DAYS * 86_400_000);
    const [user, actions] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { branch: { select: { name: true } }, department: { select: { name: true } }, team: { select: { name: true } } } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where: { userId, createdAt: { gte: since }, ...(organisationId ? { organisationId } : {}), NOT: { entityType: { startsWith: 'db:' } } },
        _count: { _all: true },
        orderBy: { _count: { action: 'desc' } },
        take: 25,
      }),
    ]);
    const top = actions.filter((a) => !SKIP.test(a.action)).slice(0, 8).map((a) => `${securityActionLabel(a.action).toLowerCase()} (${a._count._all}×)`);
    const where = [user?.branch?.name && `branch ${user.branch.name}`, user?.department?.name && `department ${user.department.name}`, user?.team?.name && `team ${user.team.name}`].filter(Boolean).join(', ');
    if (!where && !top.length) return null;
    return [where ? `Works in: ${where}.` : '', top.length ? `What they do most here (last ${DAYS} days): ${top.join(', ')}.` : ''].filter(Boolean).join(' ');
  } catch {
    return null;
  }
}
