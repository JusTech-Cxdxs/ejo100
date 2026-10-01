'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { securityActionLabel, securityActionDetail } from '@/lib/security-labels';
import { recordUrl, describeApiEntry, areaOf, AREA_LABEL } from '@/lib/notification-rules';

/** The full audit trail is for the Master Admin and Administrators. */
export async function canSeeAuditLogs(): Promise<boolean> {
  const user = await requireUser();
  const roles = await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: { select: { slug: true, isSuperAdmin: true } } } });
  return roles.some((r: { role: { slug: string; isSuperAdmin: boolean } }) => r.role.isSuperAdmin || r.role.slug === 'administrator');
}

export type AuditKind = 'all' | 'business' | 'data' | 'api';
export type AuditRow = { id: string; at: Date; who: string; kind: 'Business' | 'Data change' | 'API'; title: string; detail: string | null; area: string; record: string | null; url: string | null; changes: { field: string; before: string; after: string }[]; ip: string | null };

const PAGE = 50;
const show = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 200));
const VERB: Record<string, string> = { create: 'created', createMany: 'created (several)', update: 'updated', updateMany: 'updated (several)', upsert: 'saved', delete: 'deleted', deleteMany: 'deleted (several)' };
const words = (model: string) => model.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`);

/** One page (50) of the audit trail, newest first, cursor-paged so it stays
 * fast however large the trail grows. Append-only: nothing here changes it. */
export async function getAuditLogPage(f: { kind?: string; q?: string; userId?: string; from?: string; to?: string; cursor?: string }) {
  if (!(await canSeeAuditLogs())) throw new Error('The audit trail is for the Master Admin and Administrators.');
  const kind = (['business', 'data', 'api'].includes(f.kind ?? '') ? f.kind : 'all') as AuditKind;
  const q = f.q?.trim();
  const createdAt: { gte?: Date; lt?: Date } = {};
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) createdAt.gte = new Date(`${f.from}T00:00:00+01:00`);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) createdAt.lt = new Date(new Date(`${f.to}T00:00:00+01:00`).getTime() + 86400000);
  const kindWhere = kind === 'data' ? { entityType: { startsWith: 'db:' } } : kind === 'api' ? { entityType: { startsWith: 'api:' } } : kind === 'business' ? { NOT: [{ entityType: { startsWith: 'db:' } }, { entityType: { startsWith: 'api:' } }] } : {};
  const rows = await prisma.auditLog.findMany({
    where: {
      ...kindWhere,
      ...(f.userId ? { userId: f.userId } : {}),
      ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
      ...(q ? { OR: [{ action: { contains: q, mode: 'insensitive' as const } }, { entityType: { contains: q, mode: 'insensitive' as const } }, { entityId: { contains: q } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    select: { id: true, action: true, entityType: true, entityId: true, metadata: true, userId: true, ipAddress: true, createdAt: true },
  });
  const page = rows.slice(0, PAGE);
  const ids = [...new Set(page.map((r: { userId: string | null }) => r.userId).filter((v: string | null): v is string => Boolean(v)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  const out: AuditRow[] = page.map((r: (typeof page)[number]) => {
    const who = r.userId ? name.get(r.userId) ?? 'Former user' : 'System';
    const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
    if (r.entityType.startsWith('db:')) {
      const model = r.entityType.slice(3);
      const op = r.action.replace(/^data\./, '');
      const before = (meta.before ?? {}) as Record<string, unknown>;
      const after = (meta.after ?? {}) as Record<string, unknown>;
      const fields = op === 'update' || op === 'upsert' ? Object.keys(after).filter((k) => k !== 'updatedAt') : [];
      return { id: r.id, at: r.createdAt, who, kind: 'Data change', title: `${words(model)} ${VERB[op] ?? op}`, detail: fields.length ? `Changed: ${fields.map((k) => words(k).toLowerCase()).join(', ')}` : null, area: AREA_LABEL[areaOf(model)] ?? 'System', record: r.entityId, url: r.entityId ? recordUrl(model, r.entityId) : null, changes: fields.slice(0, 30).map((k) => ({ field: words(k), before: show(before[k]), after: show(after[k]) })), ip: r.ipAddress };
    }
    if (r.entityType.startsWith('api:')) {
      const d = describeApiEntry(r.action.replace(/\.failed$/, ''), r.entityType);
      const failed = r.action.endsWith('.failed');
      return { id: r.id, at: r.createdAt, who, kind: 'API', title: `${failed ? 'Failed: ' : ''}${d?.title ?? 'Request'}`, detail: typeof meta.status === 'number' ? `Status ${meta.status}${typeof meta.durationMs === 'number' ? ` · ${meta.durationMs} ms` : ''}${failed && typeof meta.error === 'string' ? ` · ${meta.error}` : ''}` : null, area: 'System', record: r.entityId, url: d?.url ?? null, changes: [], ip: r.ipAddress };
    }
    return { id: r.id, at: r.createdAt, who, kind: 'Business', title: securityActionLabel(r.action), detail: securityActionDetail(r.action, meta), area: AREA_LABEL[areaOf(r.entityType)] ?? 'System', record: r.entityId, url: r.entityId ? recordUrl(r.entityType, r.entityId) : null, changes: [], ip: r.ipAddress };
  });
  return { kind, rows: out, nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null };
}

export async function listAuditUsers() {
  if (!(await canSeeAuditLogs())) return [];
  return prisma.user.findMany({ orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } });
}
