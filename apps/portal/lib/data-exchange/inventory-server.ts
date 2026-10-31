/**
 * Data Exchange — suppliers, parts and opening stock (v-A2). Server only
 * (never a 'use server' file): lib/actions/data-exchange.ts checks who is
 * asking, locks the import and calls these inside its transactions.
 *
 *  • Suppliers: the organisation's list, matched by SAP vendor number, then
 *    name. New ones added; matches left alone or their blanks filled.
 *  • Parts: one branch's catalogue, matched by SAP material number, then
 *    part number. New ones added with their alternative unit; matches left
 *    alone or their blanks filled (never their stock or tracking).
 *  • Opening stock: for parts with no stock history yet, as one
 *    opening-balance goods receipt per batch of lines, dated at the
 *    cut-over — so FIFO costs, stock value and the inventory analytics treat
 *    it like any delivery. Batches and serial numbers too. Reversal removes
 *    exactly those receipts, only while nothing has been issued from them.
 */
import { prisma, type Prisma } from '@ejo/database';
import { checkPartRow, checkStockRow, checkSupplierRow, partKey, type PartValues, type StockValues, type SupplierValues } from './check-inventory';
import type { Issue } from './check';
import type { EntityKey, Mapping } from './fields';
import { keyVal, newId, writeLoadResults, type LoadRow, type Result, type RowUpdate } from './rows-server';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type InventoryEntity = Extract<EntityKey, 'suppliers' | 'parts' | 'stock'>;
export const isInventoryEntity = (e: string): e is InventoryEntity => e === 'suppliers' || e === 'parts' || e === 'stock';

export type InvJob = { id: string; number: string; organisationId: string; branchId: string | null; sourceSystem: string; matchMode: string; createdById: string; approvedById: string | null; asOf: Date | null };

const src = (s: string) => (s === 'LEGACY' ? 'LEGACY' : 'SAP');

// ── Lookups ───────────────────────────────────────────────────────────

async function findSuppliers(db: Db, organisationId: string, source: string, ext: string[], names: string[]) {
  const [byExt, byName] = await Promise.all([
    ext.length ? db.supplier.findMany({ where: { organisationId, externalSource: source, externalId: { in: ext } }, select: { id: true, externalId: true } }) : [],
    names.length ? db.$queryRaw<{ id: string; k: string }[]>`SELECT id, upper(name) AS k FROM suppliers WHERE "organisationId" = ${organisationId} AND upper(name) = ANY(${names}::text[])` : [],
  ]);
  return { ext: new Map(byExt.map((x) => [String(x.externalId).toUpperCase(), x.id])), name: new Map(byName.map((x) => [x.k, x.id])) };
}

type PartHit = { id: string; trackingType: string; baseUnit: string; units: Map<string, number> };

/**
 * The branch's parts by part number and by SAP number, with their units.
 * Looked up through the (branch, part number) index — the number as written
 * and in capitals — so it stays fast with a catalogue of any size (a scan
 * that changed every row's case would slow down as the catalogue grows).
 */
async function findParts(db: Db, branchId: string, source: string, numbers: string[], ext: string[]) {
  const forms = [...new Set(numbers.flatMap((n) => [n, n.toUpperCase(), n.toLowerCase()]))];
  const [rawByNumber, byExt] = await Promise.all([
    forms.length ? db.part.findMany({ where: { branchId, partNumber: { in: forms } }, select: { id: true, partNumber: true } }) : [],
    ext.length ? db.part.findMany({ where: { branchId, externalSource: source, externalId: { in: ext } }, select: { id: true, externalId: true } }) : [],
  ]);
  const byNumber = rawByNumber.map((x) => ({ id: x.id, k: partKey(x.partNumber) ?? '' }));
  const ids = [...new Set([...byNumber.map((x) => x.id), ...byExt.map((x) => x.id)])];
  const details = ids.length ? await db.part.findMany({ where: { id: { in: ids } }, select: { id: true, trackingType: true, baseUnitOfMeasure: true, alternativeUnits: { select: { unitName: true, conversionFactor: true } } } }) : [];
  const hit = new Map<string, PartHit>(details.map((p) => [p.id, { id: p.id, trackingType: p.trackingType, baseUnit: p.baseUnitOfMeasure, units: new Map([[p.baseUnitOfMeasure.toUpperCase(), 1], ...p.alternativeUnits.map((u) => [u.unitName.toUpperCase(), Number(u.conversionFactor)] as [string, number])]) }]));
  return {
    number: new Map(byNumber.map((x) => [x.k, hit.get(x.id)!])),
    ext: new Map(byExt.map((x) => [String(x.externalId).toUpperCase(), hit.get(x.id)!])),
  };
}

/** Parts that already have stock history not made by this import (deliveries, batches, serials, issues). */
async function partsWithHistory(db: Db, partIds: string[], jobId: string): Promise<Set<string>> {
  if (!partIds.length) return new Set();
  const [lines, batches, serials, used] = await Promise.all([
    db.goodsReceiptLine.findMany({ where: { partId: { in: partIds }, NOT: { goodsReceipt: { importJobId: jobId } } }, select: { partId: true }, distinct: ['partId'] }),
    db.partBatch.findMany({ where: { partId: { in: partIds }, OR: [{ goodsReceiptLineId: null }, { goodsReceiptLine: { goodsReceipt: { NOT: { importJobId: jobId } } } }] }, select: { partId: true }, distinct: ['partId'] }),
    db.partSerial.findMany({ where: { partId: { in: partIds }, OR: [{ goodsReceiptLineId: null }, { goodsReceiptLine: { goodsReceipt: { NOT: { importJobId: jobId } } } }] }, select: { partId: true }, distinct: ['partId'] }),
    db.partStock.findMany({ where: { partId: { in: partIds }, OR: [{ quantityOnHand: { not: 0 } }, { quantityReserved: { not: 0 } }] }, select: { partId: true } }),
  ]);
  return new Set([...lines, ...batches, ...serials].map((x) => x.partId).concat(used.map((x) => x.partId)));
}

// ── Check (nothing live changes) ──────────────────────────────────────

export async function checkInventoryRows(entity: InventoryEntity, job: InvJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const source = src(job.sourceSystem);
  const out: RowUpdate[] = [];
  if (entity === 'suppliers') {
    const checked = rows.map((r) => ({ r, c: checkSupplierRow(r.cells as unknown[], mapping) }));
    const found = await findSuppliers(prisma, job.organisationId, source, checked.map((x) => keyVal(x.c.keys, 'ext')).filter((v): v is string => Boolean(v)), checked.map((x) => keyVal(x.c.keys, 'name')).filter((v): v is string => Boolean(v)));
    for (const { r, c } of checked) {
      const ext = keyVal(c.keys, 'ext');
      const name = keyVal(c.keys, 'name');
      const hit = (ext && found.ext.get(ext)) ? { id: found.ext.get(ext)!, by: 'ext' } : (name && found.name.get(name)) ? { id: found.name.get(name)!, by: 'name' } : null;
      out.push({ id: r.id, status: c.status, issues: c.issues, matchedId: c.status === 'REJECTED' ? null : hit?.id ?? null, matchedBy: c.status === 'REJECTED' ? null : hit?.by ?? null, keys: c.keys });
    }
    return out;
  }
  if (!job.branchId) throw new Error('This import has no branch.');
  if (entity === 'parts') {
    const checked = rows.map((r) => ({ r, c: checkPartRow(r.cells as unknown[], mapping, source) }));
    const found = await findParts(prisma, job.branchId, source, checked.map((x) => x.c.values?.partNumber).filter((v): v is string => Boolean(v)), checked.map((x) => x.c.values?.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)));
    for (const { r, c } of checked) {
      const ext = c.values?.externalId?.toUpperCase();
      const num = keyVal(c.keys, 'part');
      const hit = (ext && found.ext.get(ext)) ? { id: found.ext.get(ext)!.id, by: 'ext' } : (num && found.number.get(num)) ? { id: found.number.get(num)!.id, by: 'part' } : null;
      out.push({ id: r.id, status: c.status, issues: c.issues, matchedId: c.status === 'REJECTED' ? null : hit?.id ?? null, matchedBy: c.status === 'REJECTED' ? null : hit?.by ?? null, keys: c.keys });
    }
    return out;
  }
  // Opening stock: the part must be in the branch's catalogue, with no stock history yet.
  const checked = rows.map((r) => ({ r, c: checkStockRow(r.cells as unknown[], mapping) }));
  const found = await findParts(prisma, job.branchId, source, checked.map((x) => x.c.values?.partNumber).filter((v): v is string => Boolean(v)), []);
  const history = await partsWithHistory(prisma, [...new Set([...found.number.values()].map((p) => p.id))], job.id);
  const serialsInFile = checked.flatMap((x) => x.c.values?.serials ?? []);
  const takenSerials = serialsInFile.length ? new Set((await prisma.partSerial.findMany({ where: { serialNumber: { in: serialsInFile } }, select: { serialNumber: true } })).map((s) => s.serialNumber)) : new Set<string>();
  for (const { r, c } of checked) {
    const issues: Issue[] = [...c.issues];
    let status: string = c.status;
    const fail = (field: string, message: string) => { issues.push({ field, level: 'error', message }); status = 'REJECTED'; };
    const v = c.values;
    const part = v ? found.number.get(partKey(v.partNumber)!) : undefined;
    if (v && status !== 'REJECTED') {
      if (!part) fail('partNumber', `Part ${v.partNumber} is not in this branch’s catalogue. Import the parts file first, or check the number.`);
      else if (history.has(part.id)) fail('partNumber', 'This part already has stock history (deliveries, stock on hand or issues). Opening stock is only for parts with none yet; record a goods receipt instead.');
      else {
        if (v.unit && !part.units.has(v.unit.toUpperCase())) fail('unit', `“${v.unit}” is not one of this part’s units (${[...part.units.keys()].map((u) => u.toLowerCase()).join(', ')}).`);
        if (part.trackingType === 'BATCH' && !v.batch) fail('batch', 'This part is batch-tracked: give the batch number (SAP CHARG).');
        if (part.trackingType === 'SERIALIZED') {
          if (!v.serials.length) fail('serials', 'This part is serial-tracked: list its serial numbers (one per unit).');
          const clash = v.serials.filter((s) => takenSerials.has(s));
          if (clash.length) fail('serials', `Serial number${clash.length === 1 ? '' : 's'} already in the system: ${clash.slice(0, 5).join(', ')}.`);
          const factor = part.units.get((v.unit ?? part.baseUnit).toUpperCase()) ?? 1;
          if (v.serials.length && v.serials.length !== v.quantity * factor) fail('serials', `${v.serials.length} serial numbers for ${v.quantity * factor} units.`);
        }
        if (part.trackingType === 'QUANTITY' && v.serials.length) issues.push({ field: 'serials', level: 'warning', message: 'This part is counted by quantity, so the serial numbers were not kept.' });
        if (part.trackingType !== 'BATCH' && v.batch) issues.push({ field: 'batch', level: 'warning', message: 'This part is not batch-tracked, so the batch was not kept.' });
        if (status === 'GOOD' && issues.length) status = 'WARNING';
      }
    }
    out.push({ id: r.id, status, issues, matchedId: status === 'REJECTED' ? null : part?.id ?? null, matchedBy: status === 'REJECTED' || !part ? null : 'part', keys: c.keys });
  }
  return out;
}

/** Opening stock: the quantity and value of the lines that will load (shown in the check and reconciled after loading). */
export async function stockTotalsOfRows(jobId: string, mapping: Mapping, statuses: string[]): Promise<{ lines: number; quantity: number; value: number }> {
  let after = 0; let lines = 0; let quantity = 0; let value = 0;
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const v = checkStockRow(r.cells as unknown[], mapping).values;
      if (v) { lines += 1; quantity += v.quantity; value += v.totalValue; }
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: Math.round(quantity * 1000) / 1000, value: Math.round(value * 100) / 100 };
}

// ── Load ──────────────────────────────────────────────────────────────

export async function loadInventoryRows(tx: Tx, entity: InventoryEntity, job: InvJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  if (entity === 'suppliers') return loadSuppliers(tx, job, mapping, rows);
  if (entity === 'parts') return loadParts(tx, job, mapping, rows);
  return loadStock(tx, job, mapping, rows);
}

async function loadSuppliers(tx: Tx, job: InvJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const source = src(job.sourceSystem);
  const checked = rows.map((r) => ({ r, c: checkSupplierRow(r.cells as unknown[], mapping) }));
  const found = await findSuppliers(tx, job.organisationId, source, checked.map((x) => keyVal(x.c.keys, 'ext')).filter((v): v is string => Boolean(v)), checked.map((x) => keyVal(x.c.keys, 'name')).filter((v): v is string => Boolean(v)));
  const results: Result[] = [];
  const creates: { rowId: string; id: string; v: SupplierValues }[] = [];
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const ext = keyVal(c.keys, 'ext'); const name = keyVal(c.keys, 'name');
    const hit = (ext && found.ext.get(ext)) || (name && found.name.get(name)) || null;
    if (hit) {
      if (job.matchMode !== 'FILL_BLANKS') { results.push({ id: r.id, status: 'SKIPPED', resultId: hit, note: 'Already a supplier; left as it is.' }); continue; }
      const cur = await tx.supplier.findUnique({ where: { id: hit }, select: { contactName: true, phone: true, email: true, address: true, taxId: true, externalId: true } });
      const data: Prisma.SupplierUpdateInput = {}; const filled: string[] = [];
      for (const k of ['contactName', 'phone', 'email', 'address', 'taxId'] as const) if (cur && !cur[k] && v[k]) { data[k] = v[k]; filled.push(k); }
      if (cur && !cur.externalId && v.externalId) { data.externalId = v.externalId; data.externalSource = source; filled.push('externalId'); }
      if (filled.length) { await tx.supplier.update({ where: { id: hit }, data }); results.push({ id: r.id, status: 'UPDATED', resultId: hit, filled, note: `Already a supplier; filled in what was empty (${filled.length}).` }); }
      else results.push({ id: r.id, status: 'SKIPPED', resultId: hit, note: 'Already a supplier with these details.' });
      continue;
    }
    creates.push({ rowId: r.id, id: newId(), v });
  }
  if (creates.length) {
    await tx.supplier.createMany({ skipDuplicates: true, data: creates.map(({ id, v }) => ({ id, organisationId: job.organisationId, name: v.name, contactName: v.contactName, phone: v.phone, email: v.email, address: v.address, taxId: v.taxId, externalSource: v.externalId ? source : null, externalId: v.externalId, importJobId: job.id, createdById: job.createdById })) });
    const made = new Set((await tx.supplier.findMany({ where: { id: { in: creates.map((x) => x.id) } }, select: { id: true } })).map((x) => x.id));
    for (const x of creates) results.push(made.has(x.id) ? { id: x.rowId, status: 'CREATED', resultId: x.id } : { id: x.rowId, status: 'SKIPPED', resultId: null, note: 'A supplier with the same number was added meanwhile.' });
  }
  await writeLoadResults(tx, rows, results);
}

async function loadParts(tx: Tx, job: InvJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const source = src(job.sourceSystem);
  const branchId = job.branchId!;
  const checked = rows.map((r) => ({ r, c: checkPartRow(r.cells as unknown[], mapping, source) }));
  const found = await findParts(tx, branchId, source, checked.map((x) => x.c.values?.partNumber).filter((v): v is string => Boolean(v)), checked.map((x) => x.c.values?.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)));
  const results: Result[] = [];
  const creates: { rowId: string; id: string; v: PartValues }[] = [];
  const fills: { rowId: string; id: string; v: PartValues }[] = [];
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const hit = (v.externalId && found.ext.get(v.externalId.toUpperCase())) || found.number.get(partKey(v.partNumber)!) || null;
    if (hit) {
      if (job.matchMode === 'FILL_BLANKS') fills.push({ rowId: r.id, id: hit.id, v });
      else results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: 'Already in this branch’s catalogue (same part number); left as it is.' });
      continue;
    }
    creates.push({ rowId: r.id, id: newId(), v });
  }
  if (creates.length) {
    await tx.part.createMany({
      skipDuplicates: true,
      data: creates.map(({ id, v }) => ({
        id, branchId, name: v.name, partNumber: v.partNumber, category: v.category, barcode: v.barcode, trackingType: v.trackingType, baseUnitOfMeasure: v.baseUnit,
        sellingPrice: v.sellingPrice, reorderPoint: v.reorderPoint, safetyStock: v.safetyStock, externalSource: v.externalId ? source : null, externalId: v.externalId,
        importJobId: job.id, createdById: job.createdById,
      })),
    });
    const made = new Set((await tx.part.findMany({ where: { id: { in: creates.map((x) => x.id) } }, select: { id: true } })).map((x) => x.id));
    const units = creates.filter((x) => made.has(x.id) && x.v.altUnit).map((x) => ({ partId: x.id, unitName: x.v.altUnit!.name, conversionFactor: x.v.altUnit!.factor }));
    if (units.length) await tx.partUnitOfMeasure.createMany({ data: units, skipDuplicates: true });
    for (const x of creates) results.push(made.has(x.id) ? { id: x.rowId, status: 'CREATED', resultId: x.id } : { id: x.rowId, status: 'SKIPPED', resultId: null, note: 'A part with the same part number was added meanwhile; not added twice.' });
  }
  for (const f of fills) {
    const cur = await tx.part.findUnique({ where: { id: f.id }, select: { category: true, barcode: true, sellingPrice: true, reorderPoint: true, safetyStock: true, externalId: true } });
    if (!cur) { results.push({ id: f.rowId, status: 'SKIPPED', resultId: null }); continue; }
    const data: Prisma.PartUpdateInput = {}; const filled: string[] = [];
    if (!cur.category && f.v.category) { data.category = f.v.category; filled.push('category'); }
    if (!cur.barcode && f.v.barcode) { data.barcode = f.v.barcode; filled.push('barcode'); }
    if (cur.sellingPrice === null && f.v.sellingPrice !== null) { data.sellingPrice = f.v.sellingPrice; filled.push('sellingPrice'); }
    if (cur.reorderPoint === null && f.v.reorderPoint !== null) { data.reorderPoint = f.v.reorderPoint; filled.push('reorderPoint'); }
    if (cur.safetyStock === null && f.v.safetyStock !== null) { data.safetyStock = f.v.safetyStock; filled.push('safetyStock'); }
    if (!cur.externalId && f.v.externalId) { data.externalId = f.v.externalId; data.externalSource = source; filled.push('externalId'); }
    if (filled.length) { await tx.part.update({ where: { id: f.id }, data }); results.push({ id: f.rowId, status: 'UPDATED', resultId: f.id, filled, note: `Already in the catalogue; filled in what was empty (${filled.length}).` }); }
    else results.push({ id: f.rowId, status: 'SKIPPED', resultId: f.id, note: 'Already in the catalogue with these details.' });
  }
  await writeLoadResults(tx, rows, results);
}

/** GRN-2026-000123, the Store's own numbering (an opening balance is a goods receipt). */
async function nextGrnNumber(tx: Tx, year: number): Promise<string> {
  const prefix = `GRN-${year}-`;
  const latest = await tx.goodsReceipt.findFirst({ where: { referenceNumber: { startsWith: prefix } }, orderBy: { referenceNumber: 'desc' }, select: { referenceNumber: true } });
  const next = latest ? parseInt(latest.referenceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

async function loadStock(tx: Tx, job: InvJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const branchId = job.branchId!;
  const checked = rows.map((r) => ({ r, v: checkStockRow(r.cells as unknown[], mapping).values }));
  const found = await findParts(tx, branchId, src(job.sourceSystem), checked.map((x) => x.v?.partNumber).filter((v): v is string => Boolean(v)), []);
  // Checked again under the lock: stock recorded since the check means the part is no longer a clean opening balance.
  const history = await partsWithHistory(tx, [...new Set([...found.number.values()].map((p) => p.id))], job.id);
  const results: Result[] = [];
  const lines: { rowId: string; lineId: string; part: PartHit; v: StockValues; factor: number; unit: string }[] = [];
  for (const { r, v } of checked) {
    const part = v ? found.number.get(partKey(v.partNumber)!) : undefined;
    if (!v || !part) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'The part was not found when loading.' }); continue; }
    if (history.has(part.id)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Stock was recorded for this part after the check; not added, so nothing is counted twice.' }); continue; }
    const unit = v.unit && part.units.has(v.unit.toUpperCase()) ? [...part.units.keys()].find((u) => u === v.unit!.toUpperCase())! : part.baseUnit.toUpperCase();
    const factor = part.units.get(unit) ?? 1;
    const unitName = unit === part.baseUnit.toUpperCase() ? part.baseUnit : (v.unit ?? part.baseUnit);
    lines.push({ rowId: r.id, lineId: newId(), part, v, factor, unit: unitName });
  }
  if (lines.length) {
    const receivedAt = job.asOf ?? new Date();
    const lagosYear = Number(new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'Africa/Lagos' }).format(receivedAt));
    const locations = [...new Set(lines.map((l) => l.v.storageLocation).filter(Boolean))].slice(0, 20);
    const receiptId = newId();
    await tx.goodsReceipt.create({
      data: {
        id: receiptId, branchId, referenceNumber: await nextGrnNumber(tx, lagosYear),
        supplierName: `Opening balance — ${job.sourceSystem === 'LEGACY' ? 'old system' : 'SAP'} (${job.number})`,
        receivedById: job.approvedById ?? job.createdById, receivedAt, isOpeningBalance: true, importJobId: job.id,
        notes: `Stock the branch held at the cut-over, brought in by import ${job.number}.${locations.length ? ` Storage locations: ${locations.join(', ')}.` : ''}`,
      },
    });
    await tx.goodsReceiptLine.createMany({
      data: lines.map((l) => ({
        id: l.lineId, goodsReceiptId: receiptId, partId: l.part.id, quantityReceivedInUnit: l.v.quantity, unitUsed: l.unit, quantityInBaseUnit: Math.round(l.v.quantity * l.factor * 10000) / 10000,
        totalCost: l.v.totalValue, unitCost: Math.round((l.v.totalValue / (l.v.quantity * l.factor)) * 1_000_000) / 1_000_000,
        batchNumber: l.part.trackingType === 'BATCH' ? l.v.batch : null,
      })),
    });
    // One batch per part and batch number: SAP lists a batch once per storage location, so those are added together.
    const batchGroups = new Map<string, { partId: string; batchNumber: string; qty: number; lineId: string }>();
    for (const l of lines.filter((x) => x.part.trackingType === 'BATCH' && x.v.batch)) {
      const k = `${l.part.id}|${l.v.batch}`;
      const g = batchGroups.get(k);
      if (g) g.qty += l.v.quantity * l.factor; else batchGroups.set(k, { partId: l.part.id, batchNumber: l.v.batch!, qty: l.v.quantity * l.factor, lineId: l.lineId });
    }
    for (const g of batchGroups.values()) {
      const q = Math.round(g.qty * 10000) / 10000;
      await tx.partBatch.upsert({
        where: { partId_batchNumber: { partId: g.partId, batchNumber: g.batchNumber } },
        create: { partId: g.partId, batchNumber: g.batchNumber, receivedQuantity: q, remainingQuantity: q, receivedAt, goodsReceiptLineId: g.lineId },
        update: { receivedQuantity: { increment: q }, remainingQuantity: { increment: q } },
      });
    }
    const serials = lines.filter((l) => l.part.trackingType === 'SERIALIZED').flatMap((l) => l.v.serials.map((serialNumber) => ({ partId: l.part.id, serialNumber, status: 'IN_STOCK' as const, receivedAt, goodsReceiptLineId: l.lineId })));
    if (serials.length) await tx.partSerial.createMany({ data: serials });
    // Stock on hand, one statement for the whole batch (parts listed twice — two storage locations — are added together).
    const perPart = new Map<string, number>();
    for (const l of lines) perPart.set(l.part.id, (perPart.get(l.part.id) ?? 0) + l.v.quantity * l.factor);
    const partIds = [...perPart.keys()];
    const quantities = partIds.map((id) => String(Math.round(perPart.get(id)! * 10000) / 10000));
    const stockIds = partIds.map(() => newId());
    await tx.$executeRaw`
      INSERT INTO part_stock (id, "partId", "quantityOnHand", "quantityReserved", "updatedAt")
      SELECT v.id, v.pid, v.q::numeric, 0, now() FROM unnest(${stockIds}::text[], ${partIds}::text[], ${quantities}::text[]) AS v(id, pid, q)
      ON CONFLICT ("partId") DO UPDATE SET "quantityOnHand" = part_stock."quantityOnHand" + EXCLUDED."quantityOnHand", "updatedAt" = now()`;
    for (const l of lines) results.push({ id: l.rowId, status: 'CREATED', resultId: l.lineId });
  }
  await writeLoadResults(tx, rows, results);
}

// ── Reversal ──────────────────────────────────────────────────────────

/** Opening stock that cannot be reversed any more: something issued, reserved or moved from it since. */
export async function stockReversalBlockers(jobId: string): Promise<{ label: string; href: string; why: string }[]> {
  const lines = await prisma.goodsReceiptLine.findMany({
    where: {
      goodsReceipt: { importJobId: jobId },
      OR: [
        { quantityConsumptions: { some: {} } },
        { batches: { some: { consumptions: { some: {} } } } },
        { serials: { some: { status: { not: 'IN_STOCK' } } } },
        { part: { stock: { quantityReserved: { not: 0 } } } },
      ],
    },
    take: 20,
    select: { part: { select: { id: true, partNumber: true, name: true } } },
  });
  return lines.map((l) => ({ label: [l.part.partNumber, l.part.name].filter(Boolean).join(' · '), href: `/inventory/parts/${l.part.id}`, why: 'stock from the opening balance has been issued or reserved since' }));
}

/**
 * Reverses opening stock, one receipt at a time (call until done): takes the
 * quantities back off stock on hand and removes the opening-balance receipt
 * with its lines, batches and serials — only while nothing has been issued
 * or reserved from it. The staged file stays, so it can be checked and
 * loaded again. Returns how many receipts are left.
 */
export async function reverseStockBatch(tx: Tx, jobId: string): Promise<number> {
  const receipt = await tx.goodsReceipt.findFirst({ where: { importJobId: jobId, isOpeningBalance: true }, orderBy: { createdAt: 'asc' }, select: { id: true, lines: { select: { id: true, partId: true, quantityInBaseUnit: true } } } });
  if (!receipt) return 0;
  const partIds = [...new Set(receipt.lines.map((l) => l.partId))];
  await tx.$executeRaw`SELECT 1 FROM part_stock WHERE "partId" = ANY(${partIds}::text[]) FOR UPDATE`;
  const blocked = await tx.goodsReceiptLine.count({ where: { goodsReceiptId: receipt.id, OR: [{ quantityConsumptions: { some: {} } }, { batches: { some: { consumptions: { some: {} } } } }, { serials: { some: { status: { not: 'IN_STOCK' } } } }, { part: { stock: { quantityReserved: { not: 0 } } } }] } });
  if (blocked) throw new Error('Stock from this opening balance has been issued or reserved since, so it cannot be reversed.');
  const perPart = new Map<string, number>();
  for (const l of receipt.lines) perPart.set(l.partId, (perPart.get(l.partId) ?? 0) + Number(l.quantityInBaseUnit));
  const ids = [...perPart.keys()];
  const qty = ids.map((id) => String(perPart.get(id)!));
  await tx.$executeRaw`
    UPDATE part_stock AS s SET "quantityOnHand" = s."quantityOnHand" - v.q::numeric, "updatedAt" = now()
      FROM unnest(${ids}::text[], ${qty}::text[]) AS v(pid, q) WHERE s."partId" = v.pid`;
  const lineIds = receipt.lines.map((l) => l.id);
  await tx.partSerial.deleteMany({ where: { goodsReceiptLineId: { in: lineIds } } });
  await tx.partBatch.deleteMany({ where: { goodsReceiptLineId: { in: lineIds } } });
  await tx.pricingAlert.deleteMany({ where: { goodsReceiptLineId: { in: lineIds } } });
  await tx.goodsReceipt.delete({ where: { id: receipt.id } }); // its lines cascade
  return tx.goodsReceipt.count({ where: { importJobId: jobId, isOpeningBalance: true } });
}
