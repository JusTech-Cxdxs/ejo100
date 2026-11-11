'use server';

/**
 * C1a — the daily postings for SAP: the page's reconciliation, making a file,
 * reading SAP's return file, and sending a rejected posting again. Making and
 * downloading a branch's file need `dataexchange.export.run` at that branch
 * (the organisation's new-customers file, with people's names, phones and
 * emails, needs `dataexchange.export.sensitive`); SAP's answers and sending
 * again need `dataexchange.import.approve` there. Fenced to the person's own
 * organisation; refused during an assisted session; every step audited.
 */
import { prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { requireUser } from '@/lib/actions/workshop';
import { answerColumns, BRANCH_KINDS, isPostingKind, KINDS, readAnswer, type Answer, type PostingKind } from '@/lib/sap/postings';
import { applyAnswers, makeFile, tally, type Answered, type KindTally } from '@/lib/sap/postings-server';
import { lagosToday } from '@/lib/data-exchange/dates';

const ORG = 'organisation';

async function org(where: string) {
  const p = await getPrincipal();
  if (!(await allows('dataexchange.export.run')) && !(await allows('dataexchange.import.approve'))) await authorize('dataexchange.export.run', undefined, where, 'The postings for SAP are for the people who send records to SAP and confirm them.');
  const organisationId = p.organisationId ?? (await myOrganisationId());
  if (!organisationId) throw new Error('Your account is not placed in an organisation yet.');
  return organisationId;
}

/** A scope this person may act on: a branch of their organisation that posts, or the organisation's own file. */
async function scopeOf(organisationId: string, scope: string) {
  if (scope === ORG) return { branchId: null, name: 'The organisation', kinds: ['NEW_CUSTOMER'] as PostingKind[], sapPlant: null as string | null };
  const b = await prisma.branch.findFirst({ where: { id: String(scope).slice(0, 40), businessUnit: { organisationId }, isActive: true }, select: { id: true, name: true, type: true, sapPlant: true } });
  if (!b || !BRANCH_KINDS[b.type]) return null;
  return { branchId: b.id, name: b.name, kinds: BRANCH_KINDS[b.type]!, sapPlant: b.sapPlant };
}
const mayMake = (branchId: string | null) => (branchId ? allows('dataexchange.export.run', { branchId }) : allows('dataexchange.export.sensitive'));
const mayAnswer = (branchId: string | null) => (branchId ? allows('dataexchange.import.approve', { branchId }) : allows('dataexchange.import.approve'));

/** A postings file of this person's organisation (never another's), and what they may do with it; null when neither. */
async function sapPostingOf(organisationId: string, fileId: string) {
  const f = await prisma.sapPostingFile.findFirst({ where: { id: String(fileId).slice(0, 40), organisationId } });
  if (!f) return null;
  const [download, answer] = await Promise.all([mayMake(f.branchId), mayAnswer(f.branchId)]);
  return download || answer ? { f, may: { download, answer } } : null;
}

export type PostingScope = { id: string; name: string; sapPlant: string | null; start: Date | null; kinds: KindTally[]; may: { make: boolean; answer: boolean }; files: { id: string; number: string; kind: string; upTo: Date; lineCount: number; amount: number; createdAt: Date; downloadedAt: Date | null; acknowledgedAt: Date | null; open: number; rejected: number }[] };

/** Every branch that posts (and the organisation's new customers), each with its reconciliation and its latest files. */
export async function getSapPostings(): Promise<{ scopes: PostingScope[]; today: string }> {
  const organisationId = await org('getSapPostings');
  const branches = await prisma.branch.findMany({ where: { businessUnit: { organisationId }, isActive: true, type: { in: Object.keys(BRANCH_KINDS) as ('WORKSHOP' | 'WAREHOUSE' | 'ASSEMBLY_PLANT')[] } }, orderBy: { name: 'asc' }, select: { id: true } });
  const scopes: PostingScope[] = [];
  for (const id of [ORG, ...branches.map((b) => b.id)]) {
    const s = (await scopeOf(organisationId, id))!;
    const [make, answer] = await Promise.all([mayMake(s.branchId), mayAnswer(s.branchId)]);
    if (!make && !answer) continue;
    const [t, files] = await Promise.all([
      tally({ organisationId, branchId: s.branchId }, s.kinds),
      prisma.sapPostingFile.findMany({ where: { organisationId, branchId: s.branchId }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, number: true, kind: true, upTo: true, lineCount: true, amount: true, createdAt: true, downloadedAt: true, acknowledgedAt: true, _count: { select: { lines: { where: { status: 'SENT' } } } } } }),
    ]);
    const rejected = files.length ? await prisma.sapPostingLine.groupBy({ by: ['fileId'], where: { fileId: { in: files.map((f) => f.id) }, status: 'REJECTED' }, _count: { _all: true } }) : [];
    scopes.push({
      id, name: s.name, sapPlant: s.sapPlant, start: t.start, kinds: t.kinds, may: { make, answer },
      files: files.map((f) => ({ id: f.id, number: f.number, kind: f.kind, upTo: f.upTo, lineCount: f.lineCount, amount: Number(f.amount), createdAt: f.createdAt, downloadedAt: f.downloadedAt, acknowledgedAt: f.acknowledgedAt, open: f._count.lines, rejected: rejected.find((r) => r.fileId === f.id)?._count._all ?? 0 })),
    });
  }
  return { scopes, today: lagosToday() };
}

type Done<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Makes the next file of one kind: everything since the cut-over up to the day given that is not in a file yet. */
export async function makeSapPostingFile(scope: string, kind: string, upTo: string): Promise<Done<{ fileId?: string; message: string }>> {
  try { await refuseDuringAssist('makeSapPostingFile'); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const organisationId = await org('makeSapPostingFile');
  const s = await scopeOf(organisationId, scope);
  if (!s) return { ok: false, error: 'This branch does not post to SAP.' };
  if (!isPostingKind(kind) || !s.kinds.includes(kind)) return { ok: false, error: 'That is not a posting this branch makes.' };
  if (!(await mayMake(s.branchId))) return { ok: false, error: s.branchId ? 'Only someone who exports this branch’s records can make its files for SAP.' : 'The new customers file carries people’s names, phones and emails: it needs the right to export personal data.' };
  const today = lagosToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(upTo) || upTo > today) return { ok: false, error: 'Choose a day up to today.' };
  if (s.branchId && !s.sapPlant) return { ok: false, error: `${s.name} has no SAP plant code (WERKS) yet: add it on the branch’s page, so SAP knows where each posting belongs.` };
  const me = await requireUser();
  const made = await makeFile(kind, { organisationId, branchId: s.branchId }, upTo, me.id);
  if ('error' in made) return { ok: false, error: made.error };
  if ('empty' in made) return { ok: true, message: `Nothing to send: every ${KINDS[kind].label.toLowerCase()} up to ${upTo} is already in a file.` };
  return { ok: true, fileId: made.fileId, message: `${made.number}: ${made.lines.toLocaleString('en-NG')} line${made.lines === 1 ? '' : 's'}.${made.more ? ' More are waiting: make the next file after this one.' : ''}` };
}

export type FileView = {
  id: string; number: string; kind: PostingKind; scope: string; scopeName: string; upTo: Date; lineCount: number; quantity: number; amount: number; checksum: string; createdAt: Date; createdBy: string; downloadedAt: Date | null; acknowledgedAt: Date | null;
  counts: Record<string, number>; lines: { id: string; lineNo: number; ref: string; entityType: string; entityId: string; quantity: number | null; amount: number | null; status: string; sapDocument: string | null; message: string | null; summary: string }[];
  more: boolean; may: { download: boolean; answer: boolean };
};

/** One file: its control totals and checksum, and its lines (a status at a time, 200 per page). */
export async function getSapPostingFile(fileId: string, status = 'ALL', page = 0): Promise<FileView | null> {
  const organisationId = await org('getSapPostingFile');
  const found = await sapPostingOf(organisationId, fileId);
  if (!found) return null;
  const { f, may: { download, answer } } = found;
  const s = await scopeOf(organisationId, f.branchId ?? ORG);
  const where = { fileId: f.id, ...(['SENT', 'POSTED', 'REJECTED', 'RESEND', 'SUPERSEDED'].includes(status) ? { status } : {}) };
  const p = Number.isInteger(page) && page >= 0 && page < 1000 ? page : 0;
  const [lines, counts, by] = await Promise.all([
    prisma.sapPostingLine.findMany({ where, orderBy: { lineNo: 'asc' }, skip: p * 200, take: 201 }),
    prisma.sapPostingLine.groupBy({ by: ['status'], where: { fileId: f.id }, _count: { _all: true } }),
    prisma.user.findUnique({ where: { id: f.createdById }, select: { fullName: true } }),
  ]);
  const kind = f.kind as PostingKind;
  const summary = (payload: Record<string, string>) => KINDS[kind].columns.filter((c) => c !== 'ZZ_EJO_LINE' && c !== 'ZZ_EJO_ID' && payload[c]).slice(0, 6).map((c) => `${c} ${payload[c]}`).join(' · ');
  return {
    id: f.id, number: f.number, kind, scope: f.branchId ?? ORG, scopeName: s?.name ?? 'A branch', upTo: f.upTo, lineCount: f.lineCount, quantity: Number(f.quantity), amount: Number(f.amount), checksum: f.checksum, createdAt: f.createdAt, createdBy: by?.fullName ?? 'Someone', downloadedAt: f.downloadedAt, acknowledgedAt: f.acknowledgedAt,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    lines: lines.slice(0, 200).map((l) => ({ id: l.id, lineNo: l.lineNo, ref: l.ref, entityType: l.entityType, entityId: l.entityId, quantity: l.quantity === null ? null : Number(l.quantity), amount: l.amount === null ? null : Number(l.amount), status: l.status, sapDocument: l.sapDocument, message: l.message, summary: summary(l.payload as Record<string, string>) })),
    more: lines.length > 200, may: { download, answer },
  };
}

/**
 * SAP's return file for one EJO file, a block at a time (the header with each
 * block): each line found by ZZ_EJO_LINE, set once to posted or rejected.
 */
export async function answerSapPostings(fileId: string, header: string[], rows: { rowNumber: number; cells: string[] }[]): Promise<Done<Answered & { problems: string[] }>> {
  try { await refuseDuringAssist('answerSapPostings'); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const organisationId = await org('answerSapPostings');
  const found = await sapPostingOf(organisationId, fileId);
  if (!found) return { ok: false, error: 'This file was not found.' };
  const { f } = found;
  if (!found.may.answer) return { ok: false, error: 'Only someone who approves imports at this branch can record SAP’s answers.' };
  if (!Array.isArray(header) || !Array.isArray(rows) || rows.length > 2000) return { ok: false, error: 'Send SAP’s answers 2,000 lines at a time.' };
  const cols = answerColumns(header.map((h) => String(h ?? '')));
  if (!cols) return { ok: false, error: 'SAP’s return file needs a ZZ_EJO_LINE column (the line EJO wrote) and a STATUS column (S posted, E rejected).' };
  const answers: Answer[] = [];
  const problems: string[] = [];
  for (const r of rows) {
    const a = readAnswer((r.cells ?? []).map((c) => String(c ?? '')), cols);
    if ('error' in a) { if (problems.length < 50) problems.push(`Row ${r.rowNumber}: ${a.error}`); continue; }
    answers.push(a);
  }
  const me = await requireUser();
  const done = await applyAnswers(f.id, organisationId, answers, me.id);
  return { ok: true, ...done, problems };
}

/** A posting SAP rejected, once fixed (in EJO or in SAP): it goes in the next file of its kind. */
export async function sendPostingAgain(lineId: string): Promise<Done> {
  try { await refuseDuringAssist('sendPostingAgain'); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const organisationId = await org('sendPostingAgain');
  const l = await prisma.sapPostingLine.findFirst({ where: { id: String(lineId).slice(0, 40), organisationId }, select: { id: true, ref: true, status: true, fileId: true, file: { select: { number: true } } } });
  const found = l ? await sapPostingOf(organisationId, l.fileId) : null;
  if (!l || !found) return { ok: false, error: 'This posting was not found.' };
  if (!found.may.answer) return { ok: false, error: 'Only someone who approves imports at this branch can send a posting again.' };
  const me = await requireUser();
  const done = await prisma.sapPostingLine.updateMany({ where: { id: l.id, status: 'REJECTED' }, data: { status: 'RESEND' } });
  if (!done.count) return { ok: false, error: 'Only a posting SAP rejected can be sent again.' };
  await prisma.auditLog.create({ data: { organisationId, userId: me.id, action: 'sap.posting_resend', entityType: 'SapPostingLine', entityId: l.id, metadata: { file: l.file.number, ref: l.ref } } });
  return { ok: true };
}

export type TrailLine = { id: string; kind: PostingKind; fileId: string; fileNumber: string; madeAt: Date; status: string; sapDocument: string | null; message: string | null; answeredAt: Date | null; amount: number | null };

/**
 * Where an EJO record stands in SAP — the record (a job card, a service, a
 * PDI, a customer) found inside the person's organisation, with the events
 * that are posted for it: a job card's billing, its payments, refunds and the
 * parts issued to it; a PDI's usage decisions and its vehicle received into
 * the yard. Null when it is not theirs or they may not see the postings at
 * its branch (export.run or import.approve there; a customer: the
 * organisation's file).
 */
async function sapTrailOf(organisationId: string, entityType: string, entityId: string): Promise<{ branchId: string | null; refs: { entityType: string; entityId: string }[] } | null> {
  const id = String(entityId).slice(0, 40);
  if (entityType === 'JobCard' || entityType === 'VehicleService') {
    const job = entityType === 'JobCard'
      ? await prisma.jobCard.findFirst({ where: { id, branch: { businessUnit: { organisationId } } }, select: { id: true, branchId: true, payments: { select: { id: true } }, refunds: { select: { id: true } }, partRequestSlips: { select: { lines: { select: { id: true } } } } } })
      : await prisma.vehicleService.findFirst({ where: { id, branch: { businessUnit: { organisationId } } }, select: { id: true, branchId: true, payments: { select: { id: true } }, refunds: { select: { id: true } }, partRequestSlips: { select: { lines: { select: { id: true } } } } } });
    if (!job) return null;
    return { branchId: job.branchId, refs: [{ entityType, entityId: job.id }, ...job.payments.map((p) => ({ entityType: 'Payment', entityId: p.id })), ...job.refunds.map((r) => ({ entityType: 'Refund', entityId: r.id })), ...job.partRequestSlips.flatMap((s) => s.lines.map((l) => ({ entityType: 'PartRequestSlipLine', entityId: l.id })))] };
  }
  if (entityType === 'PdiInspection') {
    const p = await prisma.pdiInspection.findFirst({ where: { id, organisationId }, select: { id: true, branchId: true, plantVehicleId: true } });
    return p ? { branchId: p.branchId, refs: [{ entityType, entityId: p.id }, { entityType: 'PlantVehicle', entityId: p.plantVehicleId }] } : null;
  }
  if (entityType === 'Customer') {
    const c = await prisma.customer.findFirst({ where: { id, organisationId }, select: { id: true } });
    return c ? { branchId: null, refs: [{ entityType, entityId: c.id }] } : null;
  }
  return null;
}

/** "Sent to SAP" on a record's page: its postings, newest first (at most 50); null when the person may not see them. */
export async function getSapTrail(entityType: string, entityId: string): Promise<TrailLine[] | null> {
  const p = await getPrincipal();
  const organisationId = p.organisationId ?? (await myOrganisationId());
  if (!organisationId) return null;
  const found = await sapTrailOf(organisationId, String(entityType), entityId);
  if (!found) return null;
  const [make, answer] = await Promise.all([mayMake(found.branchId), mayAnswer(found.branchId)]);
  if (!make && !answer) return null;
  const byType = new Map<string, string[]>();
  for (const r of found.refs) byType.set(r.entityType, [...(byType.get(r.entityType) ?? []), r.entityId]);
  const lines = await prisma.sapPostingLine.findMany({
    where: { organisationId, OR: [...byType].map(([t, ids]) => ({ entityType: t, entityId: { in: ids.slice(0, 2000) } })) },
    orderBy: [{ file: { createdAt: 'desc' } }, { lineNo: 'asc' }], take: 50,
    select: { id: true, status: true, sapDocument: true, message: true, answeredAt: true, amount: true, file: { select: { id: true, number: true, kind: true, createdAt: true } } },
  });
  return lines.map((l) => ({ id: l.id, kind: l.file.kind as PostingKind, fileId: l.file.id, fileNumber: l.file.number, madeAt: l.file.createdAt, status: l.status, sapDocument: l.sapDocument, message: l.message, answeredAt: l.answeredAt, amount: l.amount === null ? null : Number(l.amount) }));
}
