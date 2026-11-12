/**
 * A4c3 — scheduled exports, run each morning (server only). For every active
 * schedule due today or earlier: its owner is checked — still an active
 * account of the organisation, still allowed to export that list — and a
 * fresh export is recorded for them, with a notice that it is ready. The
 * file itself is built only when they download it, signed in (as every
 * export). Nothing is attached to the email; nothing is stored.
 *
 * Each schedule is claimed first (compare-and-set on its due day), so two
 * runs of the job never make two exports. A schedule whose owner has left,
 * or may no longer export the list, pauses itself and says why.
 */
import { prisma } from '@ejo/database';
import { colleaguePrincipal } from '../authz/server';
import { decide } from '../authz/catalogue';
import { lagosToday } from '../data-exchange/dates';
import { lagosYear } from '../utils/format-date';
import { highestSequence } from '../recycle-bin/numbers';
import { emailColleagues } from '../workflow-notify';
import { logFailure } from '../log';
import { EXPORT_KINDS, type ExportKind } from './kinds';
import { EXPORT_LINK_HOURS } from './describe';
import { cadenceWords, nextRunAfter } from './schedule';

/** May this person export this list now? The same three questions as pressing Export. */
export async function ownerMayExport(userId: string, kind: ExportKind): Promise<boolean> {
  const p = await colleaguePrincipal(userId);
  if (!decide(p, 'dataexchange.export.run').allowed) return false;
  if (kind.sensitive && !decide(p, 'dataexchange.export.sensitive').allowed) return false;
  return kind.view.some((v) => decide(p, v).allowed);
}

async function recordExport(s: { organisationId: string; ownerId: string; kind: string; format: string; params: unknown; summary: string | null; sensitive: boolean }): Promise<{ id: string; number: string }> {
  const prefix = `EXP-${lagosYear()}-`;
  for (let attempt = 0; ; attempt++) {
    const rows = await prisma.exportJob.findMany({ where: { number: { startsWith: prefix } }, select: { number: true }, orderBy: { number: 'desc' }, take: 1 });
    const number = `${prefix}${String(highestSequence(prefix, rows.map((r) => r.number)) + 1).padStart(6, '0')}`;
    try {
      return await prisma.exportJob.create({
        data: { organisationId: s.organisationId, number, kind: s.kind, format: s.format, params: s.params as never, summary: s.summary, sensitive: s.sensitive, createdById: s.ownerId, expiresAt: new Date(Date.now() + EXPORT_LINK_HOURS * 3_600_000) },
        select: { id: true, number: true },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002' || attempt >= 4) throw e;
    }
  }
}

export type ScheduleRun = { due: number; made: number; paused: number; failed: number };

/** Runs every schedule due on `today` (Lagos) or earlier. Safe to run twice. */
export async function runDueExportSchedules(today = lagosToday()): Promise<ScheduleRun> {
  const out: ScheduleRun = { due: 0, made: 0, paused: 0, failed: 0 };
  const due = await prisma.exportSchedule.findMany({ where: { status: 'ACTIVE', nextRunOn: { lte: today } }, orderBy: { nextRunOn: 'asc' }, take: 500 });
  out.due = due.length;
  for (const s of due) {
    try {
      // Claim it: only the run that moves its due day on makes the export.
      const next = nextRunAfter(s, today);
      const claimed = await prisma.exportSchedule.updateMany({ where: { id: s.id, status: 'ACTIVE', nextRunOn: s.nextRunOn }, data: { nextRunOn: next } });
      if (!claimed.count) continue;
      const kind = EXPORT_KINDS[s.kind];
      const owner = await prisma.user.findFirst({ where: { id: s.ownerId, organisationId: s.organisationId, isActive: true }, select: { id: true, branchId: true } });
      const why = !kind ? 'This list can no longer be exported.' : !owner ? 'Its owner’s account is no longer active in this organisation.' : !(await ownerMayExport(owner.id, kind)) ? `Its owner may no longer export ${kind.label.toLowerCase()}.` : null;
      if (why || !kind || !owner) {
        await prisma.$transaction([
          prisma.exportSchedule.updateMany({ where: { id: s.id, status: 'ACTIVE' }, data: { status: 'PAUSED', pausedReason: why } }),
          prisma.auditLog.create({ data: { organisationId: s.organisationId, userId: null, action: 'data_exchange.export_schedule_paused', entityType: 'ExportSchedule', entityId: s.id, metadata: { reason: why, list: kind?.label ?? s.kind, by: 'schedule' } } }),
        ]);
        out.paused += 1;
        continue;
      }
      const job = await recordExport(s);
      await prisma.$transaction([
        prisma.exportSchedule.update({ where: { id: s.id }, data: { lastRunAt: new Date(), lastExportId: job.id, runs: { increment: 1 } } }),
        prisma.auditLog.create({ data: { organisationId: s.organisationId, userId: owner.id, action: 'data_exchange.export_created', entityType: 'ExportJob', entityId: job.id, metadata: { number: job.number, list: kind.label, format: s.format, filters: s.summary, sensitive: s.sensitive, scheduleId: s.id, scheduled: cadenceWords(s) } } }),
      ]);
      out.made += 1;
      await emailColleagues({
        branchId: owner.branchId, organisationId: s.organisationId, userIds: [owner.id], path: `/data-exchange/exports/${job.id}`, where: 'export.scheduled',
        notice: {
          subject: `Your scheduled export is ready — ${kind.label}`,
          heading: 'Your scheduled export is ready',
          intro: `${cadenceWords(s)}, EJO prepares your export of ${kind.label.toLowerCase()}. Today’s is ready to download.`,
          facts: [['Export', job.number], ['List', kind.label], ['Filters', s.summary ?? 'Everything in the list'], ['Format', s.format === 'csv' ? 'CSV' : 'Excel']],
          next: `Sign in and download it within ${EXPORT_LINK_HOURS} hours. The file is built when you download it, from the records as they are then; nothing is attached to this email.`,
          status: { label: 'Ready', tone: 'success' },
          ctaLabel: 'Open the export',
        },
      });
    } catch (err) {
      out.failed += 1;
      logFailure('A scheduled export could not be run', s.id, err);
    }
  }
  return out;
}
