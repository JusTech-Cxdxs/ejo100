/**
 * Exports — one download of one export, a part at a time (server only).
 *
 * The file is built when it is downloaded, from the export's stored filters,
 * for the person downloading it — their organisation, their branch, their
 * permissions today, not those of whoever pressed Export. Nothing but the
 * export record is stored: no copy of the data waits anywhere.
 *
 *  • The link works for 24 hours, and once per person: when someone has the
 *    whole file, it no longer works for them.
 *  • A large list comes in parts, each a complete file. A part stops at a
 *    clean row boundary after about 40 seconds, and "Download part 2"
 *    carries on exactly where it stopped, in the same order.
 *  • One part at a time per person (a double click, a second tab).
 *  • Every part is in the audit trail with its rows and size.
 */
import { prisma } from '@ejo/database';
import { getPrincipal, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { lagosDateTime } from './format';
import { describeParams, partMaxRows, PART_BUDGET_MS, PART_IN_FLIGHT_MS, isExportFormat, type ExportFormat } from './describe';
import { EXPORT_KINDS, mayExport, type ExportKind, type Params } from './kinds';
import { exportStream } from './stream';
import { portalBaseUrl } from '@/lib/portal-url';

export type PartRefusal = { status: 401 | 403 | 404 | 409 | 410; message: string };
export type ClaimedPart = {
  job: { id: string; number: string; kind: string; format: ExportFormat; params: Params; summary: string | null; createdAt: Date; createdById: string; organisationId: string };
  kind: ExportKind;
  downloadId: string;
  part: number;
  from: string | null;
  userId: string;
};

/** May this person take the next part of this export now? Claims it (one part at a time) or says why not. */
export async function claimPart(id: string): Promise<ClaimedPart | PartRefusal> {
  let p;
  try { p = await getPrincipal(); } catch { return { status: 401, message: 'Sign in to download this export.' }; }
  try { await refuseDuringAssist('export download'); } catch (e) { return { status: 403, message: (e as Error).message }; }
  if (!p.organisationId && !p.isSuperAdmin) return { status: 404, message: 'This export is not available.' };
  const job = await prisma.exportJob.findFirst({ where: { id: String(id).slice(0, 40), ...(p.isSuperAdmin ? {} : { organisationId: p.organisationId! }) } });
  if (!job) return { status: 404, message: 'This export is not available.' };
  const kind = EXPORT_KINDS[job.kind];
  if (!kind || !isExportFormat(job.format)) return { status: 404, message: 'This export is not available.' };
  if (!(await mayExport(kind))) {
    await writeAuditLog({ userId: p.userId, action: 'access.denied', entityType: 'ExportJob', entityId: job.id, metadata: { number: job.number, reason: 'May not export this list' } }).catch(() => undefined);
    return { status: 403, message: `You may not export ${kind.label.toLowerCase()}.` };
  }
  if (job.expiresAt.getTime() <= Date.now()) return { status: 410, message: `This link has expired (exports work for 24 hours). Export the list again for a fresh file.` };
  const now = new Date();
  const existing = await prisma.exportDownload.findUnique({ where: { exportJobId_userId: { exportJobId: job.id, userId: p.userId } } });
  let downloadId: string;
  if (!existing) {
    try {
      downloadId = (await prisma.exportDownload.create({ data: { exportJobId: job.id, userId: p.userId, startedAt: now }, select: { id: true } })).id;
    } catch {
      return { status: 409, message: 'This export is already downloading. Try again in a minute.' };
    }
  } else {
    if (existing.finishedAt) return { status: 410, message: 'You have already downloaded this export: each link works once per person. Export the list again for a fresh file.' };
    // A part is downloading while it started after the last one finished (and not so long ago that it must have failed).
    const inFlight = existing.startedAt.getTime() > (existing.partFinishedAt?.getTime() ?? 0) && now.getTime() - existing.startedAt.getTime() < PART_IN_FLIGHT_MS;
    if (inFlight) return { status: 409, message: 'A part of this export is already downloading. Try again in a minute.' };
    // Compare and set: only one request takes the part.
    const claimed = await prisma.exportDownload.updateMany({ where: { id: existing.id, finishedAt: null, startedAt: existing.startedAt, parts: existing.parts }, data: { startedAt: now } });
    if (claimed.count === 0) return { status: 409, message: 'A part of this export is already downloading. Try again in a minute.' };
    downloadId = existing.id;
  }
  const fresh = existing ?? { parts: 0, resumeFrom: null };
  return {
    job: { id: job.id, number: job.number, kind: job.kind, format: job.format, params: (job.params ?? {}) as Params, summary: job.summary, createdAt: job.createdAt, createdById: job.createdById, organisationId: job.organisationId },
    kind, downloadId, part: fresh.parts + 1, from: fresh.resumeFrom, userId: p.userId,
  };
}

/** The part as a stream of bytes; the download record and audit trail are written when the last byte is. */
export async function partStream(c: ClaimedPart): Promise<{ body: ReadableStream<Uint8Array>; fileName: string; contentType: string }> {
  const p = await getPrincipal();
  const [org, me, by, lens] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: c.job.organisationId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: c.userId }, select: { fullName: true } }),
    prisma.user.findUnique({ where: { id: c.job.createdById }, select: { fullName: true } }),
    p.lensBranchId ? prisma.branch.findUnique({ where: { id: p.lensBranchId }, select: { name: true } }) : null,
  ]);
  const ctx = { userId: c.userId, organisationId: c.job.organisationId };
  const started = Date.now();
  let next: string | null = c.from;
  let complete = false;
  const maxRows = partMaxRows();
  let written = 0;
  // Whole blocks only: a part always stops between two blocks, where the next part's `from` begins.
  async function* limited() {
    for await (const b of c.kind.rows(ctx, c.job.params, c.from)) {
      next = b.next;
      written += b.rows.length;
      if (b.rows.length) yield b.rows;
      if (b.next === 'end') { complete = true; return; }
      if (Date.now() - started > PART_BUDGET_MS || written >= maxRows) return;
    }
    complete = true;
  }
  const now = new Date();
  const about: [string, string][] = [
    ['List', c.kind.label],
    ['Organisation', org?.name ?? ''],
    ['Export', c.job.number],
    ['Filters', c.job.summary ?? describeParams(c.job.params as Record<string, string>)],
    ...(lens ? [['Branch lens', `${lens.name} only`] as [string, string]] : []),
    ['Exported by', `${by?.fullName ?? ''} · ${lagosDateTime(c.job.createdAt)}`],
    ['Downloaded by', `${me?.fullName ?? ''} · ${lagosDateTime(now)}`],
    ...(c.part > 1 || c.from ? [['Part', `${c.part} — carries on where part ${c.part - 1} stopped`] as [string, string]] : []),
    ['What is in it', `${c.kind.note ?? 'Every matching record you may see today, in the list’s order.'} Times are Lagos time; money is in naira (NGN), as numbers; record numbers are text, with SAP’s leading zeros kept.`],
    ['The list in EJO', `${portalBaseUrl().replace(/\/$/, '')}${c.kind.page}`],
  ];
  const body = exportStream({
    format: c.job.format,
    sheetName: c.kind.label,
    columns: c.kind.columns,
    rows: limited(),
    about,
    aboutAfter: () => (complete ? [] : [['More to come', `This is part ${c.part}. The list is longer than one download: open ${c.job.number} in EJO (Data Exchange → Exports) and download part ${c.part + 1}, which carries on from here.`]]),
    onDone: async ({ rows, bytes }) => {
      const resume = complete ? null : next;
      const done = new Date();
      const dl = await prisma.exportDownload.update({
        where: { id: c.downloadId },
        data: { parts: { increment: 1 }, resumeFrom: resume, partFinishedAt: done, finishedAt: complete ? done : null, rowCount: { increment: rows }, bytes: { increment: Math.min(bytes, 2_000_000_000) } },
        select: { rowCount: true, bytes: true },
      });
      if (complete) await prisma.exportJob.updateMany({ where: { id: c.job.id, rowCount: null }, data: { rowCount: dl.rowCount, bytes: dl.bytes } });
      await writeAuditLog({ userId: c.userId, action: 'data_exchange.exported', entityType: 'ExportJob', entityId: c.job.id, metadata: { number: c.job.number, list: c.kind.label, format: c.job.format, part: c.part, rows, bytes, complete, filters: c.job.summary } });
    },
  });
  // Part 1 is named for its part only when a part 2 follows (known once it is written, so: from part 2 on, and in the About sheet).
  const suffix = c.part > 1 ? `-part${c.part}` : '';
  return {
    body,
    fileName: `EJO-${c.job.kind}-${lagosDateTime(now).slice(0, 10)}-${c.job.number}${suffix}.${c.job.format}`,
    contentType: c.job.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
