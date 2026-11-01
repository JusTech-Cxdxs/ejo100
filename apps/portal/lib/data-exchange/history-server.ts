/**
 * Data Exchange — SAP history (v-A3). Server only (never a 'use server'
 * file): lib/actions/data-exchange.ts checks who is asking, locks the import
 * and calls these inside its transactions.
 *
 *  • Invoice history: SAP invoices from before EJO 100, each linked to its
 *    customer (by SAP customer number, then phone) and, when its VIN is a
 *    vehicle in the system, to that vehicle. Read-only; counted in the
 *    customer's spend and last visit and in the CRM and Headquarters
 *    analytics, always labelled "from SAP, before EJO".
 *  • Registers: the plant's production, QC and PDI registers, one row per
 *    vehicle per check, shown on the vehicle by its VIN.
 *
 * Each invoice number (and each check: register, VIN, date, station) is
 * loaded once. Undo voids exactly what the import loaded (voidedAt) — never a
 * delete — and loading the same file again restores the voided rows.
 */
import { prisma, type Prisma } from '@ejo/database';
import { checkInvoiceRow, checkRegisterRow, type RegisterKind } from './check-history';
import type { Issue } from './check';
import type { EntityKey, Mapping } from './fields';
import { findCustomers } from './lookup-server';
import { newId, writeLoadResults, type LoadRow, type Result, type RowUpdate } from './rows-server';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type HistoryEntity = Extract<EntityKey, 'invoices' | 'registers'>;
export const isHistoryEntity = (e: string): e is HistoryEntity => e === 'invoices' || e === 'registers';

export type HistoryJob = { id: string; number: string; organisationId: string; branchId: string | null; sourceSystem: string; createdById: string; defaultKind: string | null };

const src = (s: string) => (s === 'LEGACY' ? 'LEGACY' : 'SAP');
const kindOf = (k: string | null): RegisterKind | null => (k === 'PRODUCTION' || k === 'QC' || k === 'PDI' ? k : null);
const dayDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

// ── Lookups ───────────────────────────────────────────────────────────

/** Invoices already in the history (voided ones too: a reload restores them). */
/** The numbering range an invoice row belongs to: "LEGACY" for an old system's file, else SAP's (with company code and year when given). */
const rangeOf = (job: HistoryJob, v: { source: string }) => (src(job.sourceSystem) === 'LEGACY' ? 'LEGACY' : v.source);
const invKey = (range: string, number: string) => `${range}|${number.toUpperCase()}`;

async function findInvoices(db: Db, organisationId: string, numbers: string[]) {
  if (!numbers.length) return new Map<string, { id: string; voided: boolean; importJobId: string | null }>();
  const rows = await db.historicalInvoice.findMany({ where: { organisationId, invoiceNumber: { in: [...new Set(numbers)] } }, select: { id: true, invoiceNumber: true, externalSource: true, voidedAt: true, importJobId: true } });
  return new Map(rows.map((r) => [invKey(r.externalSource, r.invoiceNumber), { id: r.id, voided: Boolean(r.voidedAt), importJobId: r.importJobId }]));
}

/** The organisation's vehicles with these chassis numbers (as stored: capitals, no spaces). */
async function findVehiclesByVin(db: Db, organisationId: string, vins: string[]) {
  if (!vins.length) return new Map<string, { id: string; customerId: string }>();
  const rows = await db.customerVehicle.findMany({ where: { chassisNumber: { in: vins }, customer: { organisationId } }, select: { id: true, chassisNumber: true, customerId: true } });
  return new Map(rows.map((r) => [String(r.chassisNumber).toUpperCase(), { id: r.id, customerId: r.customerId }]));
}

async function findChecks(db: Db, organisationId: string, keys: string[]) {
  if (!keys.length) return new Map<string, { id: string; voided: boolean; importJobId: string | null }>();
  const rows = await db.vehicleHistoryRecord.findMany({ where: { organisationId, dedupeKey: { in: keys } }, select: { id: true, dedupeKey: true, voidedAt: true, importJobId: true } });
  return new Map(rows.map((r) => [r.dedupeKey, { id: r.id, voided: Boolean(r.voidedAt), importJobId: r.importJobId }]));
}

function invoiceCustomers(db: Db, job: HistoryJob, checked: { c: ReturnType<typeof checkInvoiceRow> }[]) {
  return findCustomers(db, job.organisationId, src(job.sourceSystem), {
    ext: checked.map((x) => x.c.values?.customer.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)),
    email: [],
    phone: checked.map((x) => x.c.values?.customer.phone).filter((v): v is string => Boolean(v)),
  });
}

// ── Check (nothing live changes) ──────────────────────────────────────

export async function checkHistoryRows(entity: HistoryEntity, job: HistoryJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const out: RowUpdate[] = [];
  if (entity === 'invoices') {
    const checked = rows.map((r) => ({ r, c: checkInvoiceRow(r.cells as unknown[], mapping) }));
    const [cust, existing, vehicles] = await Promise.all([
      invoiceCustomers(prisma, job, checked),
      findInvoices(prisma, job.organisationId, checked.map((x) => x.c.values?.invoiceNumber).filter((v): v is string => Boolean(v))),
      findVehiclesByVin(prisma, job.organisationId, checked.map((x) => x.c.values?.vinKey).filter((v): v is string => Boolean(v))),
    ]);
    for (const { r, c } of checked) {
      const issues: Issue[] = [...c.issues];
      let status: string = c.status;
      let matchedId: string | null = null;
      let matchedBy: string | null = null;
      const v = c.values;
      if (v && status !== 'REJECTED') {
        const owner = (v.customer.externalId && cust.ext.get(v.customer.externalId.toUpperCase())) || (v.customer.phone && cust.phone.get(v.customer.phone.slice(-10))) || null;
        if (!owner) { issues.push({ field: 'customer', level: 'error', message: 'The customer was not found. Import the customers file first, or check the customer number.' }); status = 'REJECTED'; }
        else {
          const veh = v.vinKey ? vehicles.get(v.vinKey) : undefined;
          if (v.vinKey && !veh) { issues.push({ field: 'vin', level: 'warning', message: 'The vehicle is not in the system yet, so the invoice is kept on the customer only (it links to the vehicle once the vehicle is imported and the file loaded again).' }); }
          else if (veh && veh.customerId !== owner) { issues.push({ field: 'vin', level: 'warning', message: 'The vehicle now belongs to another customer; the invoice stays with this customer and on the vehicle’s history.' }); }
          const hit = existing.get(invKey(rangeOf(job, v), v.invoiceNumber));
          if (hit && !hit.voided && hit.importJobId !== job.id) { matchedId = hit.id; matchedBy = 'inv'; issues.push({ field: 'invoiceNumber', level: 'warning', message: 'Already in the history (loaded before); left as it is.' }); }
          if (status === 'GOOD' && issues.length) status = 'WARNING';
        }
      }
      out.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
    }
    return out;
  }
  const checked = rows.map((r) => ({ r, c: checkRegisterRow(r.cells as unknown[], mapping, kindOf(job.defaultKind)) }));
  const existing = await findChecks(prisma, job.organisationId, checked.map((x) => x.c.values?.dedupeKey).filter((v): v is string => Boolean(v)));
  for (const { r, c } of checked) {
    const issues: Issue[] = [...c.issues];
    let status: string = c.status;
    let matchedId: string | null = null;
    let matchedBy: string | null = null;
    const hit = c.values ? existing.get(c.values.dedupeKey) : undefined;
    if (hit && !hit.voided && hit.importJobId !== job.id && status !== 'REJECTED') {
      matchedId = hit.id; matchedBy = 'check';
      issues.push({ field: 'vin', level: 'warning', message: 'This check is already in the history (same register, VIN, date and station); left as it is.' });
      status = 'WARNING';
    }
    out.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
  }
  return out;
}

/** Invoice history: how many invoices and how much will load (shown in the check, reconciled after loading). */
export async function invoiceTotalsOfRows(jobId: string, mapping: Mapping, statuses: string[]): Promise<{ lines: number; quantity: number; value: number; from: string | null; to: string | null }> {
  let after = 0; let lines = 0; let value = 0; let from: string | null = null; let to: string | null = null;
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, matchedBy: null, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const v = checkInvoiceRow(r.cells as unknown[], mapping).values;
      if (!v) continue;
      lines += 1; value += v.amount;
      if (!from || v.invoiceDate < from) from = v.invoiceDate;
      if (!to || v.invoiceDate > to) to = v.invoiceDate;
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: 0, value: Math.round(value * 100) / 100, from, to };
}

/** What an invoice-history import actually holds now (its loaded, not voided, invoices). */
export async function invoiceTotalsLoaded(jobId: string): Promise<{ lines: number; quantity: number; value: number }> {
  const agg = await prisma.historicalInvoice.aggregate({ where: { importJobId: jobId, voidedAt: null }, _sum: { amount: true }, _count: { _all: true } });
  return { lines: agg._count._all, quantity: 0, value: Math.round(Number(agg._sum.amount ?? 0) * 100) / 100 };
}

// ── Load ──────────────────────────────────────────────────────────────

export async function loadHistoryRows(tx: Tx, entity: HistoryEntity, job: HistoryJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  return entity === 'invoices' ? loadInvoices(tx, job, mapping, rows) : loadRegisters(tx, job, mapping, rows);
}

async function loadInvoices(tx: Tx, job: HistoryJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkInvoiceRow(r.cells as unknown[], mapping) }));
  // Matched again now: a customer or vehicle may have been added since the check.
  const [cust, existing, vehicles] = await Promise.all([
    invoiceCustomers(tx, job, checked),
    findInvoices(tx, job.organisationId, checked.map((x) => x.c.values?.invoiceNumber).filter((v): v is string => Boolean(v))),
    findVehiclesByVin(tx, job.organisationId, checked.map((x) => x.c.values?.vinKey).filter((v): v is string => Boolean(v))),
  ]);
  const results: Result[] = [];
  const creates: Prisma.HistoricalInvoiceCreateManyInput[] = [];
  const createRow = new Map<string, string>();
  const restore: { rowId: string; id: string }[] = [];
  const seen = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const owner = (v.customer.externalId && cust.ext.get(v.customer.externalId.toUpperCase())) || (v.customer.phone && cust.phone.get(v.customer.phone.slice(-10))) || null;
    if (!owner) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'The customer is no longer in the system; not loaded.' }); continue; }
    const k = invKey(rangeOf(job, v), v.invoiceNumber);
    const hit = existing.get(k);
    if (hit && !hit.voided) { results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: 'Already in the history; left as it is.' }); continue; }
    if (hit && hit.voided) { restore.push({ rowId: r.id, id: hit.id }); continue; }
    if (seen.has(k)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'The same invoice number appears earlier in the file; loaded once.' }); continue; }
    seen.add(k);
    const id = newId();
    createRow.set(id, r.id);
    creates.push({
      id, organisationId: job.organisationId, branchId: job.branchId, customerId: owner, vehicleId: v.vinKey ? vehicles.get(v.vinKey)?.id ?? null : null,
      vin: v.vin, vinKey: v.vinKey, invoiceNumber: v.invoiceNumber, invoiceDate: dayDate(v.invoiceDate), amount: v.amount,
      documentType: v.documentType, description: v.description, externalSource: rangeOf(job, v), companyCode: v.companyCode, fiscalYear: v.fiscalYear, importJobId: job.id,
    });
  }
  if (creates.length) {
    await tx.historicalInvoice.createMany({ data: creates, skipDuplicates: true });
    const made = new Set((await tx.historicalInvoice.findMany({ where: { id: { in: creates.map((x) => x.id!) } }, select: { id: true } })).map((x) => x.id));
    for (const c of creates) results.push(made.has(c.id!) ? { id: createRow.get(c.id!)!, status: 'CREATED', resultId: c.id! } : { id: createRow.get(c.id!)!, status: 'SKIPPED', resultId: null, note: 'The same invoice was loaded meanwhile; not loaded twice.' });
  }
  if (restore.length) {
    // An earlier import of this invoice was undone: the same row comes back (never a second copy), now belonging to this import.
    await tx.historicalInvoice.updateMany({ where: { id: { in: restore.map((x) => x.id) }, voidedAt: { not: null } }, data: { voidedAt: null, importJobId: job.id } });
    for (const x of restore) results.push({ id: x.rowId, status: 'CREATED', resultId: x.id, note: 'Restored: it had been loaded before by an import that was undone.' });
  }
  await writeLoadResults(tx, rows, results);
}

async function loadRegisters(tx: Tx, job: HistoryJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkRegisterRow(r.cells as unknown[], mapping, kindOf(job.defaultKind)) }));
  const existing = await findChecks(tx, job.organisationId, checked.map((x) => x.c.values?.dedupeKey).filter((v): v is string => Boolean(v)));
  const results: Result[] = [];
  const creates: Prisma.VehicleHistoryRecordCreateManyInput[] = [];
  const createRow = new Map<string, string>();
  const restore: { rowId: string; id: string }[] = [];
  const seen = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const hit = existing.get(v.dedupeKey);
    if (hit && !hit.voided) { results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: 'This check is already in the history; left as it is.' }); continue; }
    if (hit && hit.voided) { restore.push({ rowId: r.id, id: hit.id }); continue; }
    if (seen.has(v.dedupeKey)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'The same check appears earlier in the file; loaded once.' }); continue; }
    seen.add(v.dedupeKey);
    const id = newId();
    createRow.set(id, r.id);
    creates.push({
      id, organisationId: job.organisationId, vin: v.vin, vinKey: v.vinKey, model: v.model, kind: v.kind, eventDate: dayDate(v.eventDate), stage: v.stage,
      result: v.result, inspector: v.inspector, reference: v.reference, notes: v.notes, dedupeKey: v.dedupeKey, importJobId: job.id,
    });
  }
  if (creates.length) {
    await tx.vehicleHistoryRecord.createMany({ data: creates, skipDuplicates: true });
    const made = new Set((await tx.vehicleHistoryRecord.findMany({ where: { id: { in: creates.map((x) => x.id!) } }, select: { id: true } })).map((x) => x.id));
    for (const c of creates) results.push(made.has(c.id!) ? { id: createRow.get(c.id!)!, status: 'CREATED', resultId: c.id! } : { id: createRow.get(c.id!)!, status: 'SKIPPED', resultId: null, note: 'The same check was loaded meanwhile; not loaded twice.' });
  }
  if (restore.length) {
    await tx.vehicleHistoryRecord.updateMany({ where: { id: { in: restore.map((x) => x.id) }, voidedAt: { not: null } }, data: { voidedAt: null, importJobId: job.id } });
    for (const x of restore) results.push({ id: x.rowId, status: 'CREATED', resultId: x.id, note: 'Restored: it had been loaded before by an import that was undone.' });
  }
  await writeLoadResults(tx, rows, results);
}

// ── Undo: void, never delete ──────────────────────────────────────────

/** Voids what this import loaded (kept, and restored if the file is loaded again), then marks its rows undone. Returns 0 when finished. */
export async function voidHistoryBatch(tx: Tx, entity: HistoryEntity, jobId: string, at = new Date()): Promise<number> {
  if (entity === 'invoices') await tx.historicalInvoice.updateMany({ where: { importJobId: jobId, voidedAt: null }, data: { voidedAt: at } });
  else await tx.vehicleHistoryRecord.updateMany({ where: { importJobId: jobId, voidedAt: null }, data: { voidedAt: at } });
  await tx.importRow.updateMany({ where: { jobId, status: { in: ['CREATED', 'UPDATED'] } }, data: { status: 'UNDONE' } });
  return 0;
}

