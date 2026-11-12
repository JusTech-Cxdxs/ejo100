'use server';

/**
 * A4c3 — scheduled exports: repeat one of your own exports every day, week
 * or month. A schedule keeps the list, the format and the filters — never
 * data. When it is due, EJO records a fresh export for its owner and tells
 * them; the file is built only when they download it, signed in, within
 * their permissions then (lib/exports/schedule-server). A schedule is its
 * owner's alone: only they see, pause, resume or end it. Not during an
 * assisted session. Ended schedules are kept, never deleted.
 */
import { prisma } from '@ejo/database';
import { authorize, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { lagosToday } from '@/lib/data-exchange/dates';
import { EXPORT_KINDS, mayExport } from '@/lib/exports/kinds';
import { cadenceWords, checkWhen, MAX_SCHEDULES, nextRunAfter } from '@/lib/exports/schedule';

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

/** The person, allowed to export, with their organisation. */
async function exportScheduler(where: string) {
  await authorize('dataexchange.export.run', undefined, where, 'Exporting lists is not part of your role.');
  const p = await getPrincipal();
  const organisationId = p.organisationId ?? (await myOrganisationId());
  if (!organisationId) throw new Error('Exports belong to an organisation: you are not in one.');
  return { userId: p.userId, organisationId };
}

/** An export the person made themselves, in their organisation, or null. */
async function myExportOf(organisationId: string, userId: string, exportId: string) {
  return prisma.exportJob.findFirst({ where: { id: String(exportId).slice(0, 40), organisationId, createdById: userId } });
}

/** One of the person's own schedules in their organisation, or null. */
async function myScheduleOf(organisationId: string, userId: string, id: string) {
  return prisma.exportSchedule.findFirst({ where: { id: String(id).slice(0, 40), organisationId, ownerId: userId } });
}

export type ScheduleRow = { id: string; list: string; format: string; summary: string; sensitive: boolean; when: string; status: string; pausedReason: string | null; nextRunOn: string; lastRunAt: Date | null; lastExportId: string | null; runs: number };

/** The person's own schedules: running first, then paused; ended ones last. */
export async function listMyExportSchedules(): Promise<ScheduleRow[]> {
  const { userId, organisationId } = await exportScheduler('listMyExportSchedules');
  const order: Record<string, number> = { ACTIVE: 0, PAUSED: 1, ENDED: 2 };
  const rows = (await prisma.exportSchedule.findMany({ where: { organisationId, ownerId: userId }, orderBy: { createdAt: 'desc' }, take: 100 })).sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  return rows.map((s) => ({ id: s.id, list: EXPORT_KINDS[s.kind]?.label ?? s.kind, format: s.format, summary: s.summary ?? 'Everything in the list', sensitive: s.sensitive, when: cadenceWords(s), status: s.status, pausedReason: s.pausedReason, nextRunOn: s.nextRunOn, lastRunAt: s.lastRunAt, lastExportId: s.lastExportId, runs: s.runs }));
}

/** Repeat one of your own exports: the same list, format and filters, on a schedule. */
export async function scheduleExport(exportId: string, input: { cadence: string; dayOfWeek?: number; dayOfMonth?: number }): Promise<{ ok: true; id: string; when: string; nextRunOn: string } | Fail> {
  const { userId, organisationId } = await exportScheduler('scheduleExport');
  try { await refuseDuringAssist('scheduleExport'); } catch (e) { return fail((e as Error).message); }
  const when = checkWhen(input.cadence, input.dayOfWeek, input.dayOfMonth);
  if (!when.ok) return when;
  const job = await myExportOf(organisationId, userId, exportId);
  if (!job) return fail('Only an export you made yourself can be repeated.');
  const kind = EXPORT_KINDS[job.kind];
  if (!kind || !(await mayExport(kind))) return fail('You may no longer export this list.');
  const params = (job.params ?? {}) as Record<string, string>;
  // One customer's records are a one-off request, never a standing report.
  if (params.customerId) return fail('An export of one customer’s records cannot be scheduled.');
  const mine = await prisma.exportSchedule.findMany({ where: { organisationId, ownerId: userId, status: { not: 'ENDED' } }, select: { kind: true, format: true, params: true, cadence: true, dayOfWeek: true, dayOfMonth: true } });
  if (mine.length >= MAX_SCHEDULES) return fail(`You have ${mine.length} scheduled exports already (the most one person may keep). End one first.`);
  const same = JSON.stringify(params);
  if (mine.some((m) => m.kind === job.kind && m.format === job.format && m.cadence === when.cadence && m.dayOfWeek === when.dayOfWeek && m.dayOfMonth === when.dayOfMonth && JSON.stringify(m.params ?? {}) === same)) return fail('You already have this export scheduled on these days.');
  const nextRunOn = nextRunAfter(when, lagosToday());
  const made = await prisma.$transaction(async (tx) => {
    const s = await tx.exportSchedule.create({ data: { organisationId, ownerId: userId, kind: job.kind, format: job.format, params, summary: job.summary, sensitive: kind.sensitive, cadence: when.cadence, dayOfWeek: when.dayOfWeek, dayOfMonth: when.dayOfMonth, nextRunOn }, select: { id: true } });
    await tx.auditLog.create({ data: { organisationId, userId, action: 'data_exchange.export_scheduled', entityType: 'ExportSchedule', entityId: s.id, metadata: { list: kind.label, format: job.format, filters: job.summary, when: cadenceWords(when), from: job.number, sensitive: kind.sensitive } } });
    return s;
  });
  return { ok: true, id: made.id, when: cadenceWords(when), nextRunOn };
}

/** Pause, resume or end one of your own schedules (each change once: compare-and-set on its status). */
export async function changeExportSchedule(id: string, to: 'PAUSED' | 'ACTIVE' | 'ENDED'): Promise<{ ok: true } | Fail> {
  const { userId, organisationId } = await exportScheduler('changeExportSchedule');
  try { await refuseDuringAssist('changeExportSchedule'); } catch (e) { return fail((e as Error).message); }
  if (!['PAUSED', 'ACTIVE', 'ENDED'].includes(to)) return fail('Choose pause, resume or end.');
  const s = await myScheduleOf(organisationId, userId, id);
  if (!s) return fail('This scheduled export was not found.');
  if (s.status === 'ENDED') return fail('This scheduled export has ended.');
  if (s.status === to) return { ok: true };
  if (to === 'ACTIVE') {
    const kind = EXPORT_KINDS[s.kind];
    if (!kind || !(await mayExport(kind))) return fail('You may not export this list, so its schedule cannot run.');
  }
  const done = await prisma.$transaction(async (tx) => {
    // Resumed: due from tomorrow (never a backlog of missed days).
    const n = await tx.exportSchedule.updateMany({ where: { id: s.id, status: s.status }, data: to === 'ACTIVE' ? { status: 'ACTIVE', pausedReason: null, nextRunOn: nextRunAfter(s, lagosToday()) } : { status: to, pausedReason: null } });
    if (!n.count) return false;
    await tx.auditLog.create({ data: { organisationId, userId, action: to === 'ACTIVE' ? 'data_exchange.export_schedule_resumed' : to === 'PAUSED' ? 'data_exchange.export_schedule_paused' : 'data_exchange.export_schedule_ended', entityType: 'ExportSchedule', entityId: s.id, metadata: { list: EXPORT_KINDS[s.kind]?.label ?? s.kind, when: cadenceWords(s), by: 'owner' } } });
    return true;
  });
  return done ? { ok: true } : fail('This scheduled export changed meanwhile. Refresh the page.');
}
