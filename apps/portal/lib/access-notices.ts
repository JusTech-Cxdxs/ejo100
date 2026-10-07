import { prisma } from '@ejo/database';
import { emailHoldersOfRole } from '@/lib/staff-onboarding';

/**
 * Access-changed emails for ROLE permission changes, delivered by the
 * 10-minute scheduled job (app/api/cron/appointment-reminders) — never from
 * the click itself. An administrator ticking ten permissions on a role sends
 * each holder ONE email listing every change, not ten; and the work runs in
 * the scheduler, not in a page request that the host may cut short.
 *
 * Picks up exactly where the previous run stopped (its `upTo` time), so no
 * change is missed or emailed twice. (Giving or removing a role from ONE
 * person emails that person straight away — see users-admin.ts.)
 */
export async function deliverRoleAccessNotices(): Promise<{ roles: number; upTo: string }> {
  const upTo = new Date();
  const last = await prisma.auditLog.findFirst({ where: { action: 'system.job_run', entityType: 'ScheduledJob', entityId: 'access-notices' }, orderBy: { createdAt: 'desc' }, select: { metadata: true, createdAt: true } });
  const prev = (last?.metadata as { upTo?: string } | null)?.upTo;
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  let from = prev ? new Date(prev) : last?.createdAt ?? new Date(Date.now() - 15 * 60000);
  if (Number.isNaN(+from) || from < weekAgo) from = weekAgo;
  const changes = await prisma.auditLog.findMany({
    where: { action: { in: ['role.permission_granted', 'role.permission_revoked'] }, entityType: 'Role', createdAt: { gt: from, lte: upTo } },
    orderBy: { createdAt: 'asc' },
    select: { action: true, entityId: true, metadata: true },
    take: 2000,
  });
  // Per role: the final state of each permission changed in this window.
  const byRole = new Map<string, { role: string; final: Map<string, boolean> }>();
  for (const c of changes) {
    if (!c.entityId) continue;
    const m = (c.metadata ?? {}) as { role?: string; permission?: string };
    if (!m.permission) continue;
    const entry = byRole.get(c.entityId) ?? { role: m.role ?? 'your role', final: new Map<string, boolean>() };
    entry.final.set(m.permission, c.action === 'role.permission_granted');
    byRole.set(c.entityId, entry);
  }
  for (const [roleId, { role, final }] of byRole) {
    const added = [...final].filter(([, on]) => on).map(([p]) => p);
    const removed = [...final].filter(([, on]) => !on).map(([p]) => p);
    const parts = [added.length ? `now includes: ${added.join('; ')}` : '', removed.length ? `no longer includes: ${removed.join('; ')}` : ''].filter(Boolean);
    await emailHoldersOfRole(roleId, `Your role ${role} ${parts.join(', and ')}.`);
  }
  return { roles: byRole.size, upTo: upTo.toISOString() };
}
