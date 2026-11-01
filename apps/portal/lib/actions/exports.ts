'use server';

/**
 * Exports — Excel or CSV of any list, following the list's own filters,
 * search and order, within the person's permissions.
 *
 * Pressing Export records an export (EXP-2026-000012: which list, which
 * filters, who, when) and hands back its download link. The file itself is
 * built when it is downloaded (lib/exports/download-server.ts) — for the
 * person downloading it, never a stored copy. The link works for 24 hours and
 * once per person; a long list comes in parts. Contact details and payments
 * (customers, SAP invoices) need dataexchange.export.sensitive as well.
 * Not during an assisted session: data leaving EJO is the person's own act.
 */
import { prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { lagosYear } from '@/lib/utils/format-date';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { EXPORT_KINDS, mayExport } from '@/lib/exports/kinds';
import { cleanParams, describeParams, EXPORT_LINK_HOURS, EXPORTS_PER_HOUR, isExportFormat, PART_IN_FLIGHT_MS } from '@/lib/exports/describe';

export type ExportStart = { ok: true; id: string; number: string; href: string; downloadHref: string } | { ok: false; error: string };

async function nextExportNumber(): Promise<string> {
  const prefix = `EXP-${lagosYear()}-`;
  const rows = await prisma.exportJob.findMany({ where: { number: { startsWith: prefix } }, select: { number: true }, orderBy: { number: 'desc' }, take: 1 });
  return `${prefix}${String(highestSequence(prefix, rows.map((r) => r.number)) + 1).padStart(6, '0')}`;
}

/** Export a list: records the export and returns its link (the browser starts the download at once). */
export async function createExport(input: { kind: string; format: string; params?: Record<string, unknown> }): Promise<ExportStart> {
  await authorize('dataexchange.export.run', undefined, 'createExport', 'Exporting lists is not part of your role.');
  try { await refuseDuringAssist('createExport'); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const kind = EXPORT_KINDS[String(input.kind)];
  if (!kind) return { ok: false, error: 'This list cannot be exported.' };
  if (!isExportFormat(input.format)) return { ok: false, error: 'Choose Excel or CSV.' };
  if (!(await mayExport(kind))) {
    return { ok: false, error: kind.sensitive ? `${kind.label} hold contact details or payments: exporting them needs the permission to export sensitive lists.` : `You may not export ${kind.label.toLowerCase()}.` };
  }
  const p = await getPrincipal();
  const organisationId = await myOrganisationId();
  if (!organisationId) return { ok: false, error: 'Exports belong to an organisation: you are not in one.' };
  const recent = await prisma.exportJob.count({ where: { createdById: p.userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent >= EXPORTS_PER_HOUR) return { ok: false, error: `You have exported ${recent} lists in the last hour. Use one of them, or try again later.` };
  const params = cleanParams(input.params);
  // One customer's records: that customer, inside this organisation, named in the export's description.
  let who: string | null = null;
  if (params.customerId) {
    const c = await prisma.customer.findFirst({ where: { id: params.customerId, organisationId }, select: { fullName: true } });
    if (!c) return { ok: false, error: 'That customer is not in your organisation.' };
    who = c.fullName;
  }
  const summary = who ? `Customer: ${who}${Object.keys(params).length > 1 ? ` · ${describeParams(params)}` : ''}` : describeParams(params);
  for (let attempt = 0; attempt < 4; attempt++) {
    const number = await nextExportNumber();
    try {
      const job = await prisma.exportJob.create({
        data: { organisationId, number, kind: kind.key, format: input.format, params, summary, sensitive: kind.sensitive, createdById: p.userId, expiresAt: new Date(Date.now() + EXPORT_LINK_HOURS * 3_600_000) },
        select: { id: true, number: true },
      });
      await writeAuditLog({ userId: p.userId, action: 'data_exchange.export_created', entityType: 'ExportJob', entityId: job.id, metadata: { number: job.number, list: kind.label, format: input.format, filters: summary, sensitive: kind.sensitive } });
      return { ok: true, id: job.id, number: job.number, href: `/data-exchange/exports/${job.id}`, downloadHref: `/data-exchange/exports/${job.id}/download` };
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  return { ok: false, error: 'EJO is busy numbering exports. Try again.' };
}

export type ExportProgress = {
  number: string; list: string; format: string; summary: string; expiresAt: Date; expired: boolean;
  /** This person's download: parts so far, rows so far, whether more parts follow, whether one is downloading now. */
  mine: { parts: number; rows: number; bytes: number; finished: boolean; more: boolean; downloading: boolean } | null;
};

/** Where this person's download of an export stands (the Export button and the export's page ask while it downloads). */
export async function getExportProgress(id: string): Promise<ExportProgress | null> {
  await authorize('dataexchange.export.run', undefined, 'getExportProgress');
  const job = await myExportJob(id);
  if (!job) return null;
  const kind = EXPORT_KINDS[job.kind];
  if (!kind || !(await mayExport(kind))) return null;
  const p = await getPrincipal();
  const dl = await prisma.exportDownload.findUnique({ where: { exportJobId_userId: { exportJobId: job.id, userId: p.userId } } });
  return {
    number: job.number, list: kind.label, format: job.format, summary: job.summary ?? '', expiresAt: job.expiresAt, expired: job.expiresAt.getTime() <= Date.now(),
    mine: dl ? {
      parts: dl.parts, rows: dl.rowCount, bytes: dl.bytes, finished: Boolean(dl.finishedAt), more: !dl.finishedAt && dl.parts > 0,
      downloading: dl.startedAt.getTime() > (dl.partFinishedAt?.getTime() ?? 0) && Date.now() - dl.startedAt.getTime() < PART_IN_FLIGHT_MS,
    } : null,
  };
}

/** The export, inside the person's own organisation (the platform team: any). */
async function myExportJob(id: string) {
  const p = await getPrincipal();
  const organisationId = p.isSuperAdmin ? undefined : await myOrganisationId();
  if (!p.isSuperAdmin && !organisationId) return null;
  return prisma.exportJob.findFirst({ where: { id: String(id).slice(0, 40), ...(organisationId ? { organisationId } : {}) } });
}

export type ExportRow = {
  id: string; number: string; kind: string; list: string; format: string; summary: string; sensitive: boolean;
  createdAt: Date; expiresAt: Date; createdBy: string; rowCount: number | null; bytes: number | null;
  downloads: { by: string; at: Date; parts: number; rows: number; finished: boolean }[];
};

/**
 * Exports, newest first: the person's own — or, for those who read the audit
 * trail, everyone's in the organisation (who exported what, and who
 * downloaded it).
 */
export async function listExports(opts: { take?: number } = {}): Promise<{ rows: ExportRow[]; everyone: boolean }> {
  await authorize('dataexchange.export.run', undefined, 'listExports');
  const p = await getPrincipal();
  const organisationId = await myOrganisationId();
  if (!organisationId) return { rows: [], everyone: false };
  const everyone = await allows('audit.view');
  const jobs = await prisma.exportJob.findMany({
    where: { organisationId, ...(everyone ? {} : { createdById: p.userId }) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(opts.take ?? 100, 1), 500),
    include: { downloads: { orderBy: { startedAt: 'asc' } } },
  });
  const ids = [...new Set(jobs.flatMap((j) => [j.createdById, ...j.downloads.map((d) => d.userId)]))];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  return {
    everyone,
    rows: jobs.map((j) => ({
      id: j.id, number: j.number, kind: j.kind, list: EXPORT_KINDS[j.kind]?.label ?? j.kind, format: j.format, summary: j.summary ?? '', sensitive: j.sensitive,
      createdAt: j.createdAt, expiresAt: j.expiresAt, createdBy: names.get(j.createdById) ?? 'Someone', rowCount: j.rowCount, bytes: j.bytes,
      downloads: j.downloads.map((d) => ({ by: names.get(d.userId) ?? 'Someone', at: d.partFinishedAt ?? d.startedAt, parts: d.parts, rows: d.rowCount, finished: Boolean(d.finishedAt) })),
    })),
  };
}

/** One export, for its page: what it holds, and this person's download. */
export async function getExportDetail(id: string): Promise<(ExportRow & { page: string; mayDownload: boolean; progress: ExportProgress | null }) | null> {
  await authorize('dataexchange.export.run', undefined, 'getExportDetail');
  const job = await myExportJob(id);
  if (!job) return null;
  const p = await getPrincipal();
  const kind = EXPORT_KINDS[job.kind];
  const may = Boolean(kind && (await mayExport(kind)));
  // Someone else's export opens for its creator, for those who read the audit trail, and for anyone who may export that list (the link was shared with them).
  if (job.createdById !== p.userId && !may && !(await allows('audit.view'))) return null;
  const downloads = await prisma.exportDownload.findMany({ where: { exportJobId: job.id }, orderBy: { startedAt: 'asc' } });
  const ids = [...new Set([job.createdById, ...downloads.map((d) => d.userId)])];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]));
  return {
    id: job.id, number: job.number, kind: job.kind, list: kind?.label ?? job.kind, format: job.format, summary: job.summary ?? '', sensitive: job.sensitive,
    createdAt: job.createdAt, expiresAt: job.expiresAt, createdBy: names.get(job.createdById) ?? 'Someone', rowCount: job.rowCount, bytes: job.bytes,
    downloads: downloads.map((d) => ({ by: names.get(d.userId) ?? 'Someone', at: d.partFinishedAt ?? d.startedAt, parts: d.parts, rows: d.rowCount, finished: Boolean(d.finishedAt) })),
    page: kind?.page ?? '/data-exchange', mayDownload: may,
    progress: may ? await getExportProgress(job.id) : null,
  };
}
