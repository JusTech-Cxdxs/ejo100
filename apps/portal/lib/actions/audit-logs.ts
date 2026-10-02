'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { securityActionLabel, securityActionDetail } from '@/lib/security-labels';
import { recordUrl, describeApiEntry, areaOf, AREA_LABEL } from '@/lib/notification-rules';
import { resolveRecords, resolveReferenceNumbers, REFERENCE_PATTERN } from '@/lib/record-resolver';

/** The full audit trail is for the Master Admin and Administrators. */
export async function canSeeAuditLogs(): Promise<boolean> {
  const user = await requireUser();
  const roles = await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: { select: { slug: true, isSuperAdmin: true } } } });
  return roles.some((r: { role: { slug: string; isSuperAdmin: boolean } }) => r.role.isSuperAdmin || r.role.slug === 'administrator');
}

export type AuditKind = 'all' | 'business' | 'data' | 'api';
export type AuditRow = { id: string; at: Date; who: string; kind: 'Business' | 'Data change' | 'API'; title: string; detail: string | null; area: string; records: { label: string; url: string }[]; changes: { field: string; before: string; after: string }[]; ip: string | null };

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
  // A reference number (JC-2026-000013, VX-…, GRN-…) finds that record's
  // whole history: resolve the number to the record, then search its id.
  let refId: string | null = null;
  if (q && new RegExp(`^${REFERENCE_PATTERN.source}$`).test(q.toUpperCase())) {
    const url = (await resolveReferenceNumbers([q.toUpperCase()])).get(q.toUpperCase());
    refId = url?.split('/').filter(Boolean).pop() ?? null;
  }
  const kindWhere = kind === 'data' ? { entityType: { startsWith: 'db:' } } : kind === 'api' ? { entityType: { startsWith: 'api:' } } : kind === 'business' ? { NOT: [{ entityType: { startsWith: 'db:' } }, { entityType: { startsWith: 'api:' } }] } : {};
  const rows = await prisma.auditLog.findMany({
    where: {
      ...kindWhere,
      // Personal screen state (read markers, mute) is not business history.
      entityType: { notIn: ['db:NotificationRead', 'db:NotificationPreference'] },
      ...(f.userId ? { userId: f.userId } : {}),
      ...(createdAt.gte || createdAt.lt ? { createdAt } : {}),
      ...(refId ? { entityId: refId } : q ? { OR: [{ action: { contains: q.replace(/\s+/g, '_'), mode: 'insensitive' as const } }, { action: { contains: q, mode: 'insensitive' as const } }, { entityType: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' as const } }, { entityId: { contains: q } }] } : {}),
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
  const resolved = await resolveRecords(page.filter((r: { entityId: string | null; entityType: string }) => r.entityId && !r.entityType.startsWith('api:')).map((r: { entityType: string; entityId: string | null }) => ({ type: r.entityType, id: r.entityId! })));
  const rec = (type: string, id: string | null) => (id ? [resolved.get(`${type}:${id}`) ?? { label: 'Record', url: recordUrl(type.replace(/^db:/, ''), id) }] : []);
  const mapped: AuditRow[] = page.map((r: (typeof page)[number]) => {
    const who = r.userId ? name.get(r.userId) ?? 'Former user' : 'System';
    const meta = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as Record<string, unknown>;
    if (r.entityType.startsWith('db:')) {
      const model = r.entityType.slice(3);
      const op = r.action.replace(/^data\./, '');
      const before = (meta.before ?? {}) as Record<string, unknown>;
      const after = (meta.after ?? {}) as Record<string, unknown>;
      const fields = op === 'update' || op === 'upsert' ? Object.keys(after).filter((k) => k !== 'updatedAt') : [];
      return { id: r.id, at: r.createdAt, who, kind: 'Data change', title: `${words(model)} ${VERB[op] ?? op}`, detail: fields.length ? `Changed: ${fields.map((k) => words(k).toLowerCase()).join(', ')}` : null, area: AREA_LABEL[areaOf(model)] ?? 'System', records: rec(r.entityType, r.entityId), changes: fields.slice(0, 30).map((k) => ({ field: words(k), before: show(before[k]), after: show(after[k]) })).filter((c) => !(c.before === '—' && c.after === '—')), ip: r.ipAddress };
    }
    if (r.entityType.startsWith('api:')) {
      const d = describeApiEntry(r.action.replace(/\.failed$/, ''), r.entityType);
      const failed = r.action.endsWith('.failed');
      return { id: r.id, at: r.createdAt, who, kind: 'API', title: `${failed ? 'Failed: ' : ''}${d?.title ?? 'Request'}`, detail: typeof meta.status === 'number' ? `Status ${meta.status}${typeof meta.durationMs === 'number' ? ` · ${meta.durationMs} ms` : ''}${failed && typeof meta.error === 'string' ? ` · ${meta.error}` : ''}` : null, area: 'System', records: d ? [{ label: d.title.replace(/ (created|updated|deleted)$/, ''), url: d.url }] : [], changes: [], ip: r.ipAddress };
    }
    return { id: r.id, at: r.createdAt, who, kind: 'Business', title: securityActionLabel(r.action), detail: securityActionDetail(r.action, meta), area: AREA_LABEL[areaOf(r.entityType)] ?? 'System', records: rec(r.entityType, r.entityId), changes: [], ip: r.ipAddress };
  });
  // One action recorded on several records at the same moment (e.g. a gate
  // exit on both the exit record and its Job Card) shows once, with all of
  // its records.
  const out: AuditRow[] = [];
  for (const r of mapped) {
    const prev = out[out.length - 1];
    if (prev && r.kind === 'Business' && prev.kind === 'Business' && prev.title === r.title && prev.who === r.who && Math.abs(+prev.at - +r.at) < 2000) {
      for (const x of r.records) if (!prev.records.some((y) => y.url === x.url)) prev.records.push(x);
      if (r.detail && (!prev.detail || r.detail.length > prev.detail.length)) prev.detail = r.detail;
      continue;
    }
    out.push(r);
  }
  const refLinks = await resolveReferenceNumbers(out.flatMap((r) => [r.title, r.detail]));
  return { kind, rows: out, refLinks, nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null };
}

export async function listAuditUsers() {
  if (!(await canSeeAuditLogs())) return [];
  return prisma.user.findMany({ orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } });
}
