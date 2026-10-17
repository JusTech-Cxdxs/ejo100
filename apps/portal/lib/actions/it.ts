'use server';

import { prisma } from '@ejo/database';
import { authorize, getPrincipal, lensPeopleWhere, myOrganisationId } from '@/lib/authz/server';
import { ROLE_LABELS } from '@/lib/authz/catalogue';
import { KIND_LABEL, isErrorKind } from '@/lib/error-events-core';
import { jobIsLate, jobStatuses } from '@/lib/job-runs';
import { lagosYmd } from '@/lib/nigeria-calendar';
import { getItPulse, type ItPulse } from './leadership';

/**
 * The IT control room (audit.view): everything IT looks after, for the whole
 * organisation or the branch chosen in the branch bar — sign-ins and sessions,
 * people per branch, roles and recent access changes, refused attempts, errors
 * by kind and by page, the Support centre's teams, and every scheduled job.
 * Counts, names and references only; never passwords, tokens or message text.
 */
export type ItControlRoom = {
  asOf: Date;
  pulse: ItPulse;
  lensBranch: string | null;
  signIns: { days: { label: string; ok: number; failed: number }[]; sessionsActive: number; lastSeen: { d1: number; d7: number; d30: number; older: number; never: number } };
  branches: { id: string; name: string; people: number; active7d: number; neverSignedIn: number }[];
  roles: { name: string; people: number }[];
  accessChanges: { at: Date; action: string; by: string; detail: string }[];
  denied: { permission: string; count: number }[];
  errors: { byKind: { kind: string; label: string; count: number }[]; byRoute: { route: string; count: number }[]; latest: { ref: string; at: Date; kind: string; message: string; path: string | null }[] };
  support: { name: string; open: number; late: number; unassigned: number }[];
  jobs: { key: string; name: string; when: string; lastRun: Date | null; runs7d: number; late: boolean }[];
};

const ACCESS_ACTIONS = ['user.role_assigned', 'user.role_removed', 'role.permission_granted', 'role.permission_revoked', 'user.created', 'user.deactivated', 'user.reactivated'];
const ACTION_LABEL: Record<string, string> = {
  'user.role_assigned': 'Role given', 'user.role_removed': 'Role removed', 'role.permission_granted': 'Permission added to a role',
  'role.permission_revoked': 'Permission removed from a role', 'user.created': 'Staff member added', 'user.deactivated': 'Account switched off', 'user.reactivated': 'Account switched on',
};

export async function getItControlRoom(): Promise<ItControlRoom> {
  await authorize('audit.view', undefined, 'getItControlRoom', 'The IT control room is for IT and administrators.');
  const [org, p, people, pulse] = await Promise.all([myOrganisationId(), getPrincipal(), lensPeopleWhere(), getItPulse()]);
  const o = org ?? '__none__';
  const now = Date.now();
  const d7 = new Date(now - 7 * 86_400_000);
  const d30 = new Date(now - 30 * 86_400_000);
  const d1 = new Date(now - 86_400_000);
  const branchWhere = { businessUnit: { organisationId: o }, ...(p.lensBranchId ? { id: p.lensBranchId } : {}) };
  const usersIn = { organisationId: o, ...(p.lensBranchId ? { branchId: p.lensBranchId } : {}) };

  const [branchRows, staff, signIns, failedIns, sessions, roleRows, changes, deniedRows, errKinds, errRoutes, errLatest, queues, jobs] = await Promise.all([
    prisma.branch.findMany({ where: branchWhere, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { ...usersIn, isActive: true }, select: { branchId: true, lastLoginAt: true }, take: 20_000 }),
    prisma.auditLog.findMany({ where: { organisationId: o, action: 'user.signed_in', createdAt: { gte: d7 }, ...people }, select: { createdAt: true }, take: 50_000 }),
    prisma.auditLog.findMany({ where: { organisationId: o, action: 'user.sign_in_failed', createdAt: { gte: d7 } }, select: { createdAt: true }, take: 50_000 }),
    prisma.session.count({ where: { expiresAt: { gt: new Date(now) }, user: usersIn } }),
    prisma.role.findMany({ where: { organisationId: o, isSuperAdmin: false }, select: { name: true, slug: true, _count: { select: { users: { where: { user: { ...usersIn, isActive: true } } } } } } }),
    prisma.auditLog.findMany({ where: { organisationId: o, action: { in: ACCESS_ACTIONS }, ...people }, orderBy: { createdAt: 'desc' }, take: 12, select: { createdAt: true, action: true, userId: true, metadata: true } }),
    prisma.auditLog.findMany({ where: { organisationId: o, action: 'access.denied', createdAt: { gte: d7 }, ...people }, select: { metadata: true }, take: 20_000 }),
    prisma.errorEvent.groupBy({ by: ['kind'], where: { organisationId: o, createdAt: { gte: d7 }, ...people }, _count: { _all: true } }),
    prisma.errorEvent.groupBy({ by: ['route'], where: { organisationId: o, createdAt: { gte: d7 }, ...people }, _count: { _all: true }, orderBy: { _count: { route: 'desc' } }, take: 6 }),
    prisma.errorEvent.findMany({ where: { organisationId: o, ...people }, orderBy: { createdAt: 'desc' }, take: 10, select: { ref: true, createdAt: true, kind: true, message: true, path: true } }),
    prisma.supportQueue.findMany({ where: { organisationId: o, active: true }, orderBy: { name: 'asc' }, select: { name: true, id: true } }).catch(() => []),
    jobStatuses().catch(() => ({ jobs: [] as Awaited<ReturnType<typeof jobStatuses>>['jobs'] })),
  ]);

  // Sign-ins per Lagos day, the last seven days.
  const days = Array.from({ length: 7 }, (_, i) => lagosYmd(new Date(now - (6 - i) * 86_400_000)));
  const okBy = new Map<string, number>(); const failBy = new Map<string, number>();
  for (const s of signIns) { const k = lagosYmd(s.createdAt); okBy.set(k, (okBy.get(k) ?? 0) + 1); }
  for (const s of failedIns) { const k = lagosYmd(s.createdAt); failBy.set(k, (failBy.get(k) ?? 0) + 1); }
  const label = (ymd: string) => new Date(`${ymd}T12:00:00+01:00`).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric' });

  const lastSeen = { d1: 0, d7: 0, d30: 0, older: 0, never: 0 };
  for (const u of staff) {
    const t = u.lastLoginAt?.getTime();
    if (!t) lastSeen.never += 1; else if (t >= d1.getTime()) lastSeen.d1 += 1; else if (t >= d7.getTime()) lastSeen.d7 += 1; else if (t >= d30.getTime()) lastSeen.d30 += 1; else lastSeen.older += 1;
  }

  // Who made each access change (names of colleagues of this organisation only).
  const actorIds = [...new Set(changes.map((c) => c.userId).filter((v): v is string => Boolean(v)))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds }, organisationId: o }, select: { id: true, fullName: true } }) : [];
  const nameOf = new Map(actors.map((a) => [a.id, a.fullName]));
  const detail = (m: unknown) => {
    const x = (m ?? {}) as Record<string, unknown>;
    const parts = [x.person, x.role, x.roleName, x.permission, x.label].filter((v): v is string => typeof v === 'string' && v.length > 0);
    return parts.join(' · ').slice(0, 140);
  };

  const deniedBy = new Map<string, number>();
  for (const d of deniedRows) { const k = String(((d.metadata ?? {}) as { permission?: unknown }).permission ?? 'unknown'); deniedBy.set(k, (deniedBy.get(k) ?? 0) + 1); }

  // Support teams: open, late and unassigned, per team.
  const open = ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] as const;
  const support = await Promise.all(queues.map(async (q) => {
    const where = { organisationId: o, queueId: q.id, status: { in: [...open] }, ...(p.lensBranchId ? { branchId: p.lensBranchId } : {}) };
    const [n, late, un] = await Promise.all([
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.count({ where: { ...where, slaBreachedAt: { not: null }, firstResponseAt: null } }),
      prisma.supportTicket.count({ where: { ...where, assignedToId: null } }),
    ]).catch(() => [0, 0, 0]);
    return { name: q.name, open: n, late, unassigned: un };
  }));

  return {
    asOf: new Date(),
    pulse,
    lensBranch: p.lensBranchId ? branchRows.find((b) => b.id === p.lensBranchId)?.name ?? null : null,
    signIns: { days: days.map((d) => ({ label: label(d), ok: okBy.get(d) ?? 0, failed: failBy.get(d) ?? 0 })), sessionsActive: sessions, lastSeen },
    branches: branchRows.map((b) => {
      const mine = staff.filter((u) => u.branchId === b.id);
      return { id: b.id, name: b.name, people: mine.length, active7d: mine.filter((u) => u.lastLoginAt && u.lastLoginAt >= d7).length, neverSignedIn: mine.filter((u) => !u.lastLoginAt).length };
    }),
    roles: roleRows.map((r) => ({ name: ROLE_LABELS[r.slug] ?? r.name, people: r._count.users })).sort((a, b) => b.people - a.people || a.name.localeCompare(b.name)),
    accessChanges: changes.map((c) => ({ at: c.createdAt, action: ACTION_LABEL[c.action] ?? c.action, by: c.userId ? nameOf.get(c.userId) ?? 'A colleague' : 'The system', detail: detail(c.metadata) })),
    denied: [...deniedBy.entries()].map(([permission, count]) => ({ permission, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    errors: {
      byKind: errKinds.map((k) => ({ kind: k.kind ?? 'unknown', label: isErrorKind(k.kind) ? KIND_LABEL[k.kind] : 'Other', count: k._count._all })).sort((a, b) => b.count - a.count),
      byRoute: errRoutes.map((r) => ({ route: r.route ?? '(no page)', count: r._count._all })),
      latest: errLatest.map((e) => ({ ref: e.ref, at: e.createdAt, kind: isErrorKind(e.kind) ? KIND_LABEL[e.kind] : 'Other', message: e.message.slice(0, 160), path: e.path })),
    },
    support,
    jobs: jobs.jobs.map((j) => ({ key: j.key, name: j.name, when: j.when, lastRun: j.lastRun, runs7d: j.runs7d, late: jobIsLate(j, now) })),
  };
}
