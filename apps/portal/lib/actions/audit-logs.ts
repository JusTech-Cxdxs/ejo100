'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { allows, getPrincipal, orgWhere } from '@/lib/authz/server';
import { JOBS } from '@/lib/job-runs';
import { securityActionLabel, securityActionDetail } from '@/lib/security-labels';
import { recordUrl, describeApiEntry, areaOf, AREA_LABEL } from '@/lib/notification-rules';
import { resolveRecords, resolveReferenceNumbers, REFERENCE_PATTERN } from '@/lib/record-resolver';

/** The full audit trail — catalogue permission audit.view (Administrators;
 * Master Admin always; plus any grant added on the Roles page). */
export async function canSeeAuditLogs(): Promise<boolean> {
  await requireUser();
  return allows('audit.view');
}

export type AuditKind = 'all' | 'business' | 'data' | 'api' | 'system';
export type AuditRow = { id: string; at: Date; who: string; kind: 'Business' | 'Data change' | 'API' | 'System job'; title: string; detail: string | null; area: string; records: { label: string; url: string }[]; changes: { field: string; before: string; after: string }[]; ip: string | null };

const PAGE = 50;
const show = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 200));
const VERB: Record<string, string> = { create: 'created', createMany: 'created (several)', update: 'updated', updateMany: 'updated (several)', upsert: 'saved', delete: 'deleted', deleteMany: 'deleted (several)' };
const words = (model: string) => model.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`);

/** One page (50) of the audit trail, newest first, cursor-paged so it stays
 * fast however large the trail grows. Append-only: nothing here changes it. */
export async function getAuditLogPage(f: { kind?: string; q?: string; userId?: string; from?: string; to?: string; cursor?: string }) {
  if (!(await canSeeAuditLogs())) throw new Error('The audit trail is for the Master Admin and Administrators.');
  const kind = (['business', 'data', 'api', 'system'].includes(f.kind ?? '') ? f.kind : 'all') as AuditKind;
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
  // Scheduled-job runs (every 10 minutes) have their own tab, so they never bury people's work.
  const notJob = { action: { not: 'system.job_run' } };
  const kindWhere =
    kind === 'system' ? { action: 'system.job_run' }
    : kind === 'data' ? { entityType: { startsWith: 'db:' } }
    : kind === 'api' ? { entityType: { startsWith: 'api:' } }
    : kind === 'business' ? { ...notJob, NOT: [{ entityType: { startsWith: 'db:' } }, { entityType: { startsWith: 'api:' } }] }
    : notJob;
  const rows = await prisma.auditLog.findMany({
    where: {
      // Each organisation sees only its own history; the platform team sees all.
      ...(await orgWhere()),
      // AND, never a spread: both conditions filter entityType, and a spread
      // let the second silently replace the tab's own filter (E2E-06).
      AND: [
        kindWhere,
        // Personal screen state (read markers, mute) is not business history.
        { entityType: { notIn: ['db:NotificationRead', 'db:NotificationPreference', 'db:CustomerNotificationRead'] } },
      ],
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
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, roles: { select: { role: { select: { isSuperAdmin: true } } } } } }) : [];
  const viewerPlatform = await prisma.userRole.findFirst({ where: { userId: (await requireUser()).id, role: { isSuperAdmin: true } }, select: { id: true } });
  // The platform team is shown to organisations as "Platform support".
  const name = new Map(users.map((u: { id: string; fullName: string; roles: { role: { isSuperAdmin: boolean } }[] }) => [u.id, !viewerPlatform && u.roles.some((r) => r.role.isSuperAdmin) ? 'Platform support' : u.fullName]));
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
      return { id: r.id, at: r.createdAt, who, kind: 'Data change', title: `${words(model)} ${VERB[op] ?? op}`, detail: fields.length ? `Changed: ${fields.map((k) => words(k).toLowerCase()).join(', ')}` : null, area: AREA_LABEL[areaOf(model)] ?? 'System', records: rec(r.entityType, r.entityId), changes: fields.slice(0, 30).map((k) => ({ field: words(k), key: k, rawBefore: before[k], rawAfter: after[k], before: show(before[k]), after: show(after[k]) })).filter((c) => !(c.before === '—' && c.after === '—')), ip: r.ipAddress };
    }
    if (r.entityType.startsWith('api:')) {
      const d = describeApiEntry(r.action.replace(/\.failed$/, ''), r.entityType);
      const failed = r.action.endsWith('.failed');
      return { id: r.id, at: r.createdAt, who, kind: 'API', title: `${failed ? 'Failed: ' : ''}${d?.title ?? 'Request'}`, detail: typeof meta.status === 'number' ? `Status ${meta.status}${typeof meta.durationMs === 'number' ? ` · ${meta.durationMs} ms` : ''}${failed && typeof meta.error === 'string' ? ` · ${meta.error}` : ''}` : null, area: 'System', records: d ? [{ label: d.title.replace(/ (created|updated|deleted)$/, ''), url: d.url }] : [], changes: [], ip: r.ipAddress };
    }
    if (r.action === 'system.job_run') {
      const job = JOBS.find((j) => j.key === r.entityId);
      const LABEL: Record<string, string> = { remindersSent: 'reminders', broadcastEmailsSent: 'broadcast emails', digestsSent: 'digests', branchesWithOpenAlerts: 'branches with open alerts', emailsSent: 'emails sent', emailsFailed: 'emails failed', rolesChanged: 'roles changed', errorReferencesRemoved: 'old error references removed' };
      return { id: r.id, at: r.createdAt, who: 'Scheduler', kind: 'System job', title: `Scheduled job ran — ${job?.name ?? r.entityId ?? 'job'}`, detail: Object.entries(meta).map(([k, v]) => `${String(v)} ${LABEL[k] ?? k}`).join(' · ') || null, area: 'System', records: [{ label: 'Scheduled jobs', url: '/settings' }], changes: [], ip: null };
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
  // Values in plain words: dates, statuses, yes / no, and ids → names.
  type Raw = { field: string; key?: string; rawBefore?: unknown; rawAfter?: unknown; before: string; after: string };
  const userIds = new Set<string>(); const partIds = new Set<string>();
  for (const r of out) for (const c of r.changes as Raw[]) for (const v of [c.rawBefore, c.rawAfter]) {
    if (typeof v !== 'string' || !c.key) continue;
    if (/(ById|UserId|userId)$/.test(c.key)) userIds.add(v);
    else if (/[pP]artId$/.test(c.key)) partIds.add(v);
  }
  const [uRows, pRows] = await Promise.all([
    userIds.size ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, fullName: true } }) : [],
    partIds.size ? prisma.part.findMany({ where: { id: { in: [...partIds] } }, select: { id: true, partNumber: true, name: true } }) : [],
  ]);
  const names = new Map<string, string>([...uRows.map((u: { id: string; fullName: string }) => [u.id, u.fullName] as [string, string]), ...pRows.map((x: { id: string; partNumber: string | null; name: string }) => [x.id, `${x.partNumber ? `${x.partNumber} ` : ''}${x.name}`] as [string, string])]);
  const readable = (v: unknown, key?: string): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'string') {
      if (key && names.has(v)) return names.get(v)!;
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return new Date(v).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      if (/^[A-Z][A-Z0-9_]+$/.test(v)) return v.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
      if (key && /Id$/.test(key) && /^c[a-z0-9]{20,}$/.test(v)) return 'A record';
      return v.slice(0, 200);
    }
    if (typeof v === 'number') return v.toLocaleString('en-NG');
    return show(v);
  };
  for (const r of out) r.changes = (r.changes as Raw[]).map((c) => ({ field: c.field.replace(/ id$/i, ''), before: c.key ? readable(c.rawBefore, c.key) : c.before, after: c.key ? readable(c.rawAfter, c.key) : c.after }));
  for (const r of out) if (r.detail?.startsWith('Changed: ')) r.detail = r.detail.replace(/ id(,|$)/g, '$1');
  const refLinks = await resolveReferenceNumbers(out.flatMap((r) => [r.title, r.detail]));
  return { kind, rows: out, refLinks, nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null };
}

export async function listAuditUsers() {
  if (!(await canSeeAuditLogs())) return [];
  // The platform team is never listed to organisations (their entries show as "Platform support").
  const p = await getPrincipal();
  return prisma.user.findMany({ where: p.isSuperAdmin ? {} : { ...(await orgWhere()), roles: { none: { role: { isSuperAdmin: true } } } }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } });
}
