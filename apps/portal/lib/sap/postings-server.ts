/**
 * C1a — the daily postings for SAP, the server part of postings.ts. Server
 * only (never a 'use server' file): lib/actions/sap-postings.ts checks who is
 * asking and calls these.
 *
 * What goes in: what happened at the branch from the day it was signed off
 * as cut over (P9) — never history brought in by an import, never an opening
 * balance, never the demo — and not yet in a file (a posting SAP rejected
 * goes again only once someone sends it again). One file per branch, kind and
 * run, under a lock per organisation, so nothing is ever in two files at once.
 * Its lines are kept as SAP's fields; the CSV is rebuilt from them byte for
 * byte, so its checksum always matches. SAP's return file sets each line's
 * status once (compare-and-set); a new customer's KUNNR from SAP fills in the
 * customer's SAP number when EJO has none.
 */
import { Prisma, prisma } from '@ejo/database';
import { newId as createId } from '../data-exchange/rows-server';
import { KINDS, MAX_LINES, PAYMENT_METHOD, checksumOf, lagosWindow, postingCsv, sapDay, sapMoney, sapNumber, sapQuantity, sapText, type Answer, type PostingKind } from './postings';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
type Scope = { organisationId: string; branchId: string | null };
export type Candidate = { ref: string; entityType: string; entityId: string; quantity: number | null; amount: number | null; payload: Record<string, string>; at: Date };

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));

/** The day postings start: the first time the branch (or, for the organisation's file, any branch) was signed off as cut over. */
export async function postingsStart(db: Db, s: Scope): Promise<Date | null> {
  const first = await db.auditLog.findFirst({
    where: { organisationId: s.organisationId, entityType: 'BranchCutover', action: 'data_exchange.cutover_signed_off', ...(s.branchId ? { entityId: s.branchId } : {}) },
    orderBy: { createdAt: 'asc' }, select: { createdAt: true },
  });
  return first?.createdAt ?? null;
}

/** Refs already in a file (sent, posted or rejected and not sent again): never collected again. */
async function taken(db: Db, organisationId: string, refs: string[]): Promise<Set<string>> {
  if (!refs.length) return new Set();
  const rows = await db.sapPostingLine.findMany({ where: { organisationId, ref: { in: refs }, status: { in: ['SENT', 'POSTED', 'REJECTED'] } }, select: { ref: true } });
  return new Set(rows.map((r) => r.ref));
}
async function demo(db: Db, organisationId: string, model: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  return new Set((await db.demoRecord.findMany({ where: { organisationId, model, recordId: { in: ids } }, select: { recordId: true } })).map((r) => r.recordId));
}
const material = (p: { externalSource: string | null; externalId: string | null; partNumber: string | null; id: string }) => (p.externalSource === 'SAP' && p.externalId ? p.externalId : p.partNumber ?? p.id);

/** Everything of one kind that happened in the window and is not in a file yet, oldest first. */
export async function collect(db: Db, kind: PostingKind, s: Scope, start: Date, end: Date): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const branch = s.branchId ? await db.branch.findUnique({ where: { id: s.branchId }, select: { sapPlant: true } }) : null;
  const WERKS = branch?.sapPlant ?? '';
  if (kind === 'NEW_CUSTOMER') {
    const rows = await db.customer.findMany({
      where: { organisationId: s.organisationId, externalId: null, importJobId: null, createdAt: { gte: start, lt: end }, OR: [{ externalSource: null }, { externalSource: { notIn: ['EJO-DEMO'] } }] },
      orderBy: { createdAt: 'asc' }, take: MAX_LINES * 2, select: { id: true, fullName: true, phone: true, email: true, address: true, createdAt: true },
    });
    const skip = await demo(db, s.organisationId, 'Customer', rows.map((r) => r.id));
    for (const c of rows) if (!skip.has(c.id)) out.push({ ref: `NC:${c.id}`, entityType: 'Customer', entityId: c.id, quantity: null, amount: null, at: c.createdAt, payload: { ZZ_EJO_ID: c.id, KUNNR: '', NAME1: sapText(c.fullName, 35), TELF1: sapText(c.phone, 16), SMTP_ADDR: sapText(c.email, 241), STRAS: sapText(c.address, 35), ERDAT: sapDay(c.createdAt) } });
  } else if (kind === 'GOODS_RECEIPT') {
    const rows = await db.goodsReceiptLine.findMany({
      where: { goodsReceipt: { branchId: s.branchId!, isOpeningBalance: false, importJobId: null, receivedAt: { gte: start, lt: end } } },
      orderBy: [{ goodsReceipt: { receivedAt: 'asc' } }, { id: 'asc' }], take: MAX_LINES * 2,
      select: { id: true, quantityInBaseUnit: true, totalCost: true, batchNumber: true, part: { select: { id: true, partNumber: true, externalId: true, externalSource: true, baseUnitOfMeasure: true } }, goodsReceipt: { select: { id: true, referenceNumber: true, receivedAt: true, supplier: { select: { externalId: true, externalSource: true } } } } },
    });
    const skip = await demo(db, s.organisationId, 'GoodsReceipt', [...new Set(rows.map((r) => r.goodsReceipt.id))]);
    for (const l of rows) {
      if (skip.has(l.goodsReceipt.id)) continue;
      const g = l.goodsReceipt;
      out.push({ ref: `GR:${l.id}`, entityType: 'GoodsReceiptLine', entityId: l.id, quantity: num(l.quantityInBaseUnit), amount: num(l.totalCost), at: g.receivedAt, payload: {
        ZZ_EJO_ID: l.id, BWART: '101', BLDAT: sapDay(g.receivedAt), BUDAT: sapDay(g.receivedAt), WERKS, MATNR: sapText(material(l.part), 40), MENGE: sapQuantity(num(l.quantityInBaseUnit)), MEINS: sapText(l.part.baseUnitOfMeasure, 3).toUpperCase(),
        CHARG: sapText(l.batchNumber, 10), LIFNR: g.supplier?.externalSource === 'SAP' ? sapNumber('LIFNR', g.supplier.externalId) : '', XBLNR: sapText(g.referenceNumber, 16), DMBTR: sapMoney(num(l.totalCost)), WAERS: l.totalCost === null ? '' : 'NGN',
      } });
    }
  } else if (kind === 'GOODS_ISSUE') {
    const rows = await db.partRequestSlipLine.findMany({
      where: { quantityReleased: { gt: 0 }, slip: { branchId: s.branchId!, status: 'RELEASED', releasedAt: { gte: start, lt: end } } },
      orderBy: [{ slip: { releasedAt: 'asc' } }, { id: 'asc' }], take: MAX_LINES * 2,
      select: { id: true, quantityReleased: true, part: { select: { id: true, partNumber: true, externalId: true, externalSource: true, baseUnitOfMeasure: true } }, slip: { select: { id: true, releasedAt: true, jobCard: { select: { id: true, jobNumber: true, externalSource: true, externalId: true } }, vehicleService: { select: { id: true, serviceNumber: true, externalSource: true, externalId: true } } } } },
    });
    const skip = new Set([...(await demo(db, s.organisationId, 'PartRequestSlip', [...new Set(rows.map((r) => r.slip.id))])), ...(await demo(db, s.organisationId, 'JobCard', rows.map((r) => r.slip.jobCard?.id).filter((x): x is string => Boolean(x)))), ...(await demo(db, s.organisationId, 'VehicleService', rows.map((r) => r.slip.vehicleService?.id).filter((x): x is string => Boolean(x))))]);
    for (const l of rows) {
      const job = l.slip.jobCard ?? l.slip.vehicleService;
      if (skip.has(l.slip.id) || (job && skip.has(job.id))) continue;
      const aufnr = job?.externalSource === 'SAP' ? job.externalId ?? '' : '';
      out.push({ ref: `GI:${l.id}`, entityType: 'PartRequestSlipLine', entityId: l.id, quantity: num(l.quantityReleased), amount: null, at: l.slip.releasedAt!, payload: {
        ZZ_EJO_ID: l.id, BWART: aufnr ? '261' : '201', BUDAT: sapDay(l.slip.releasedAt), WERKS, MATNR: sapText(material(l.part), 40), MENGE: sapQuantity(num(l.quantityReleased)), MEINS: sapText(l.part.baseUnitOfMeasure, 3).toUpperCase(),
        AUFNR: sapText(aufnr, 12), ZZ_EJO_REF: l.slip.jobCard?.jobNumber ?? l.slip.vehicleService?.serviceNumber ?? '',
      } });
    }
  } else if (kind === 'BILLING') {
    const [jobs, services] = await Promise.all([
      db.jobCard.findMany({ where: { branchId: s.branchId!, status: 'CLOSED', importJobId: null, closedAt: { gte: start, lt: end } }, orderBy: { closedAt: 'asc' }, take: MAX_LINES, select: { id: true, jobNumber: true, closedAt: true, customer: { select: { externalId: true, externalSource: true } }, estimate: { select: { lineItems: { select: { amount: true, billTo: true } } } } } }),
      db.vehicleService.findMany({ where: { branchId: s.branchId!, status: { in: ['CLOSED', 'COLLECTED'] }, importJobId: null, closedAt: { gte: start, lt: end } }, orderBy: { closedAt: 'asc' }, take: MAX_LINES, select: { id: true, serviceNumber: true, closedAt: true, customer: { select: { externalId: true, externalSource: true } }, serviceEstimate: { select: { lineItems: { select: { amount: true } } } } } }),
    ]);
    const skipJ = await demo(db, s.organisationId, 'JobCard', jobs.map((j) => j.id));
    const skipS = await demo(db, s.organisationId, 'VehicleService', services.map((j) => j.id));
    const kunnr = (c: { externalId: string | null; externalSource: string | null }) => (c.externalSource === 'SAP' ? sapNumber('KUNNR', c.externalId) : '');
    for (const j of jobs) {
      if (skipJ.has(j.id)) continue;
      const by: Record<string, number> = { CUSTOMER: 0, WARRANTY: 0, GOODWILL: 0, INTERNAL: 0 };
      for (const li of j.estimate?.lineItems ?? []) by[li.billTo] = (by[li.billTo] ?? 0) + (num(li.amount) ?? 0);
      if (!by.CUSTOMER && !by.WARRANTY && !by.GOODWILL && !by.INTERNAL) continue;
      out.push({ ref: `BL:JC:${j.id}`, entityType: 'JobCard', entityId: j.id, quantity: null, amount: by.CUSTOMER!, at: j.closedAt!, payload: { ZZ_EJO_ID: j.id, FKDAT: sapDay(j.closedAt), WERKS, KUNNR: kunnr(j.customer), ZZ_EJO_REF: j.jobNumber, NETWR: sapMoney(by.CUSTOMER), ZZ_WARRANTY: sapMoney(by.WARRANTY), ZZ_GOODWILL: sapMoney(by.GOODWILL), ZZ_INTERNAL: sapMoney(by.INTERNAL), WAERK: 'NGN' } });
    }
    for (const v of services) {
      if (skipS.has(v.id)) continue;
      const total = (v.serviceEstimate?.lineItems ?? []).reduce((n, li) => n + (num(li.amount) ?? 0), 0);
      if (!total) continue;
      out.push({ ref: `BL:SV:${v.id}`, entityType: 'VehicleService', entityId: v.id, quantity: null, amount: total, at: v.closedAt!, payload: { ZZ_EJO_ID: v.id, FKDAT: sapDay(v.closedAt), WERKS, KUNNR: kunnr(v.customer), ZZ_EJO_REF: v.serviceNumber, NETWR: sapMoney(total), ZZ_WARRANTY: sapMoney(0), ZZ_GOODWILL: sapMoney(0), ZZ_INTERNAL: sapMoney(0), WAERK: 'NGN' } });
    }
    out.sort((a, b) => +a.at - +b.at);
  } else {
    const rows = await db.payment.findMany({
      where: { recordedAt: { gte: start, lt: end }, OR: [{ jobCard: { branchId: s.branchId!, importJobId: null } }, { vehicleService: { branchId: s.branchId!, importJobId: null } }] },
      orderBy: { recordedAt: 'asc' }, take: MAX_LINES * 2,
      select: { id: true, amount: true, method: true, recordedAt: true, jobCard: { select: { id: true, jobNumber: true, customer: { select: { externalId: true, externalSource: true } } } }, vehicleService: { select: { id: true, serviceNumber: true, customer: { select: { externalId: true, externalSource: true } } } } },
    });
    const jobIds = rows.map((r) => r.jobCard?.id ?? r.vehicleService?.id).filter((x): x is string => Boolean(x));
    const skip = new Set([...(await demo(db, s.organisationId, 'Payment', rows.map((r) => r.id))), ...(await demo(db, s.organisationId, 'JobCard', jobIds)), ...(await demo(db, s.organisationId, 'VehicleService', jobIds))]);
    for (const p of rows) {
      const job = p.jobCard ?? p.vehicleService;
      if (skip.has(p.id) || (job && skip.has(job.id))) continue;
      const c = p.jobCard?.customer ?? p.vehicleService?.customer;
      out.push({ ref: `PY:${p.id}`, entityType: 'Payment', entityId: p.id, quantity: null, amount: num(p.amount), at: p.recordedAt, payload: {
        ZZ_EJO_ID: p.id, BUDAT: sapDay(p.recordedAt), WERKS, KUNNR: c?.externalSource === 'SAP' ? sapNumber('KUNNR', c.externalId) : '', WRBTR: sapMoney(num(p.amount)), WAERS: 'NGN', ZLSCH: PAYMENT_METHOD[p.method] ?? '', XBLNR: p.jobCard?.jobNumber ?? p.vehicleService?.serviceNumber ?? '',
      } });
    }
  }
  const done = await taken(db, s.organisationId, out.map((c) => c.ref));
  return out.filter((c) => !done.has(c.ref));
}

async function nextNumber(tx: Tx): Promise<string> {
  const prefix = `SAP-${new Date(Date.now() + 3_600_000).getUTCFullYear()}-`;
  const last = await tx.sapPostingFile.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(6, '0')}`;
}

export type Made = { fileId: string; number: string; lines: number; more: boolean } | { empty: true } | { error: string };

/**
 * Makes the next file of one kind for a branch (or the organisation's new
 * customers), covering every day from the start up to `upTo`: what is not in
 * a file yet, at most MAX_LINES. Under a lock per organisation; a posting
 * sent again replaces its rejected line (retryOf).
 */
export async function makeFile(kind: PostingKind, s: Scope, upTo: string, actorId: string): Promise<Made> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sap-postings:${s.organisationId}`}))`;
    const startAt = await postingsStart(tx, s);
    if (!startAt) return { error: KINDS[kind].organisation ? 'No branch is signed off as cut over yet: postings start the day the first one is (Data Exchange → Cut-over checklist).' : 'This branch is not signed off as cut over yet: postings start that day (Data Exchange → Cut-over checklist).' };
    const { end } = lagosWindow(upTo, upTo);
    const all = await collect(tx, kind, s, startAt, end);
    if (!all.length) return { empty: true };
    const lines = all.slice(0, MAX_LINES);
    const ids = lines.map(() => createId());
    const payloads = lines.map((c, i) => ({ ZZ_EJO_LINE: ids[i]!, ...c.payload }));
    const csv = postingCsv(kind, payloads.map((p) => ({ payload: p })));
    const number = await nextNumber(tx);
    const qty = lines.reduce((n, c) => n + (c.quantity ?? 0), 0);
    const amt = lines.reduce((n, c) => n + (c.amount ?? 0), 0);
    const file = await tx.sapPostingFile.create({ data: { number, organisationId: s.organisationId, branchId: s.branchId, kind, upTo: new Date(`${upTo}T00:00:00.000Z`), lineCount: lines.length, quantity: qty, amount: Math.round(amt * 100) / 100, checksum: checksumOf(csv), createdById: actorId } });
    // A posting sent again: its rejected line (marked to send again) is replaced by the new one.
    const again = new Map((await tx.sapPostingLine.findMany({ where: { organisationId: s.organisationId, ref: { in: lines.map((c) => c.ref) }, status: 'RESEND' }, select: { id: true, ref: true } })).map((l) => [l.ref, l.id]));
    await tx.sapPostingLine.createMany({
      data: lines.map((c, i) => ({ id: ids[i]!, fileId: file.id, organisationId: s.organisationId, lineNo: i + 1, ref: c.ref, entityType: c.entityType, entityId: c.entityId, quantity: c.quantity, amount: c.amount, payload: payloads[i]! as Prisma.InputJsonValue, retryOf: again.get(c.ref) ?? null })),
    });
    if (again.size) await tx.sapPostingLine.updateMany({ where: { id: { in: [...again.values()] }, status: 'RESEND' }, data: { status: 'SUPERSEDED' } });
    await tx.auditLog.create({ data: { organisationId: s.organisationId, userId: actorId, action: 'sap.postings_made', entityType: 'SapPostingFile', entityId: file.id, metadata: { number, kind, branchId: s.branchId, upTo, lines: lines.length, quantity: qty, amount: amt, checksum: file.checksum, sentAgain: again.size } } });
    return { fileId: file.id, number, lines: lines.length, more: all.length > lines.length };
  }, { timeout: 60_000 });
}

/** The file's CSV, rebuilt from its lines (the same bytes every time, so its checksum matches). */
export async function fileCsv(fileId: string): Promise<string> {
  const f = await prisma.sapPostingFile.findUniqueOrThrow({ where: { id: fileId }, select: { kind: true } });
  const lines = await prisma.sapPostingLine.findMany({ where: { fileId }, orderBy: { lineNo: 'asc' }, select: { payload: true } });
  return postingCsv(f.kind as PostingKind, lines.map((l) => ({ payload: l.payload as Record<string, string> })));
}

export type Answered = { posted: number; rejected: number; same: number; conflicts: string[]; notInFile: number; customersNumbered: number };

/**
 * SAP's answers for a file's lines: each line set once, SENT → POSTED or
 * REJECTED (compare-and-set); the same answer twice changes nothing; a
 * different answer for a line already answered is reported, never applied.
 * A new customer posted with its KUNNR gets that SAP number when EJO has none.
 */
export async function applyAnswers(fileId: string, organisationId: string, answers: Answer[], actorId: string): Promise<Answered> {
  return prisma.$transaction(async (tx) => {
    const r: Answered = { posted: 0, rejected: 0, same: 0, conflicts: [], notInFile: 0, customersNumbered: 0 };
    const file = await tx.sapPostingFile.findFirstOrThrow({ where: { id: fileId, organisationId }, select: { id: true, number: true, kind: true } });
    const lines = new Map((await tx.sapPostingLine.findMany({ where: { fileId, id: { in: answers.map((a) => a.lineId) } }, select: { id: true, lineNo: true, status: true, sapDocument: true, entityId: true } })).map((l) => [l.id, l]));
    const now = new Date();
    for (const a of answers) {
      const l = lines.get(a.lineId);
      if (!l) { r.notInFile += 1; continue; }
      if (l.status !== 'SENT') {
        const same = (l.status === 'POSTED' && a.outcome === 'POSTED' && (!a.document || a.document === l.sapDocument)) || (l.status !== 'POSTED' && a.outcome === 'REJECTED');
        if (same) r.same += 1;
        else if (r.conflicts.length < 50) r.conflicts.push(`Line ${l.lineNo}: SAP now says ${a.outcome === 'POSTED' ? 'posted' : 'rejected'}, but it was already ${l.status === 'POSTED' ? `posted (${l.sapDocument ?? 'no document'})` : l.status.toLowerCase()}: left as it was.`);
        continue;
      }
      const done = await tx.sapPostingLine.updateMany({ where: { id: l.id, status: 'SENT' }, data: { status: a.outcome, sapDocument: a.document, message: a.message, answeredAt: now, answeredById: actorId } });
      if (!done.count) continue;
      if (a.outcome === 'POSTED') r.posted += 1; else r.rejected += 1;
      // A new customer SAP has created: its KUNNR becomes the customer's SAP number, when EJO has none and no other customer has it.
      if (a.outcome === 'POSTED' && file.kind === 'NEW_CUSTOMER' && a.document && /^\d{1,10}$/.test(a.document)) {
        const kunnr = a.document.replace(/^0+(?=\d)/, '');
        const clash = await tx.customer.findFirst({ where: { organisationId, externalSource: 'SAP', externalId: kunnr }, select: { id: true } });
        const set = clash ? { count: 0 } : await tx.customer.updateMany({ where: { id: l.entityId, organisationId, externalId: null }, data: { externalSource: 'SAP', externalId: kunnr } });
        if (set.count) {
          r.customersNumbered += 1;
          await tx.auditLog.create({ data: { organisationId, userId: actorId, action: 'customer.updated', entityType: 'Customer', entityId: l.entityId, metadata: { via: 'SAP return file', file: file.number, changes: { externalId: { from: null, to: kunnr } } } } });
        }
      }
    }
    const open = await tx.sapPostingLine.count({ where: { fileId, status: 'SENT' } });
    if (!open) await tx.sapPostingFile.updateMany({ where: { id: fileId, acknowledgedAt: null }, data: { acknowledgedAt: now } });
    if (r.posted || r.rejected || r.conflicts.length) await tx.auditLog.create({ data: { organisationId, userId: actorId, action: 'sap.postings_answered', entityType: 'SapPostingFile', entityId: fileId, metadata: { number: file.number, posted: r.posted, rejected: r.rejected, conflicts: r.conflicts.length, customersNumbered: r.customersNumbered } } });
    return r;
  }, { timeout: 60_000 });
}

export type KindTally = { kind: PostingKind; notSent: { count: number; amount: number; more: boolean }; sent: { count: number; amount: number }; posted: { count: number; amount: number }; rejected: { count: number; amount: number }; resend: { count: number } };

/** The reconciliation of one branch (or the organisation's file) since postings started: every event is not sent yet, sent, posted or rejected. */
export async function tally(s: Scope, kinds: PostingKind[]): Promise<{ start: Date | null; kinds: KindTally[] }> {
  const start = await postingsStart(prisma, s);
  const out: KindTally[] = [];
  const now = new Date();
  for (const kind of kinds) {
    const notSent = start ? await collect(prisma, kind, s, start, new Date(now.getTime() + 60_000)) : [];
    const by = await prisma.$queryRaw<{ status: string; n: bigint; amount: Prisma.Decimal | null }[]>`
      SELECT l.status, count(*)::bigint AS n, sum(l.amount) AS amount
        FROM sap_posting_lines l JOIN sap_posting_files f ON f.id = l."fileId"
       WHERE f."organisationId" = ${s.organisationId} AND f.kind = ${kind} AND f."branchId" IS NOT DISTINCT FROM ${s.branchId}
       GROUP BY l.status`;
    const g = (st: string) => { const x = by.find((b) => b.status === st); return { count: Number(x?.n ?? 0), amount: Number(x?.amount ?? 0) }; };
    out.push({ kind, notSent: { count: notSent.length, amount: notSent.reduce((n, c) => n + (c.amount ?? 0), 0), more: notSent.length >= MAX_LINES * 2 }, sent: g('SENT'), posted: g('POSTED'), rejected: g('REJECTED'), resend: { count: g('RESEND').count } });
  }
  return { start, kinds: out };
}
