/**
 * Data Exchange — updating records from an edited export (P10), the server
 * part of round-trip.ts. Server only (never a 'use server' file):
 * lib/actions/data-exchange.ts checks who is asking, locks the import and
 * calls these inside its transactions.
 *
 * Check: each row is found by its EJO record only, within the organisation
 * (a part within the import's branch); its changes are worked out against the
 * record as it is and kept on the row (import_rows.changes) for the preview.
 * Load: under a lock on the records, each change still true (the record still
 * holds its "from") is applied, values that must stay unique are checked
 * again, and each record changed gets one audit entry with every { from, to }
 * — the same entry as a change made on its page, naming the import. Nothing
 * is added; nobody is emailed. Undo: each field still holding what the import
 * wrote goes back to what it was; one changed since is kept and reported.
 */
import { Prisma, prisma } from '@ejo/database';
import { checkCustomerRow, checkVehicleRow, type Checked, type Issue } from './check';
import { checkPartRow, checkSupplierRow } from './check-inventory';
import type { Mapping } from './fields';
import { diffRecord, ejoRecordOf, UPDATABLE, type Change, type Plain, type RoundTripEntity } from './round-trip';
import { writeLoadResults, type LoadRow, type Result, type RowUpdate } from './rows-server';
import { lockRows } from '../integrity';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type RoundTripJob = { id: string; number: string; organisationId: string; branchId: string | null; sourceSystem: string; createdById: string; approvedById: string | null };

const AUDIT: Record<RoundTripEntity, { type: string; action: string; lock: 'customer' | 'customerVehicle' | 'part' | 'supplier'; noun: string }> = {
  customers: { type: 'Customer', action: 'customer.updated', lock: 'customer', noun: 'customer' },
  vehicles: { type: 'CustomerVehicle', action: 'vehicle.updated', lock: 'customerVehicle', noun: 'vehicle' },
  parts: { type: 'Part', action: 'part.updated', lock: 'part', noun: 'part' },
  suppliers: { type: 'Supplier', action: 'supplier.updated', lock: 'supplier', noun: 'supplier' },
};

function parse(entity: RoundTripEntity, cells: unknown[], mapping: Mapping, source: string): Checked<unknown> {
  if (entity === 'customers') return checkCustomerRow(cells, mapping);
  if (entity === 'vehicles') return checkVehicleRow(cells, mapping, new Date().getFullYear(), true);
  if (entity === 'parts') return checkPartRow(cells, mapping, source === 'LEGACY' ? 'LEGACY' : 'SAP');
  return checkSupplierRow(cells, mapping);
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dec = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

/** The records the rows name, fenced to the organisation (a part to the import's branch), as plain values. */
async function currentOf(db: Db, entity: RoundTripEntity, job: RoundTripJob, ids: string[]): Promise<Map<string, Record<string, Plain>>> {
  const out = new Map<string, Record<string, Plain>>();
  if (!ids.length) return out;
  if (entity === 'customers') {
    for (const c of await db.customer.findMany({ where: { id: { in: ids }, organisationId: job.organisationId }, select: { id: true, fullName: true, phone: true, altPhone: true, email: true, address: true, customerSince: true, externalId: true, externalSource: true } })) out.set(c.id, { fullName: c.fullName, phone: c.phone, altPhone: c.altPhone, email: c.email, address: c.address, customerSince: day(c.customerSince), externalId: c.externalId, externalSource: c.externalSource });
  } else if (entity === 'vehicles') {
    for (const v of await db.customerVehicle.findMany({ where: { id: { in: ids }, customer: { organisationId: job.organisationId } }, select: { id: true, plateNumber: true, chassisNumber: true, engineNumber: true, engineType: true, make: true, model: true, year: true, vehicleType: true, mileage: true, externalId: true, externalSource: true } })) out.set(v.id, { plateNumber: v.plateNumber, chassisNumber: v.chassisNumber, engineNumber: v.engineNumber, engineType: v.engineType, make: v.make, model: v.model, year: v.year, vehicleType: v.vehicleType, mileage: v.mileage, externalId: v.externalId, externalSource: v.externalSource });
  } else if (entity === 'parts') {
    if (!job.branchId) return out;
    for (const p of await db.part.findMany({ where: { id: { in: ids }, branchId: job.branchId }, select: { id: true, name: true, category: true, barcode: true, sellingPrice: true, reorderPoint: true, safetyStock: true, externalId: true, externalSource: true, partNumber: true, trackingType: true, baseUnitOfMeasure: true } })) out.set(p.id, { name: p.name, category: p.category, barcode: p.barcode, sellingPrice: dec(p.sellingPrice), reorderPoint: dec(p.reorderPoint), safetyStock: dec(p.safetyStock), externalId: p.externalId, externalSource: p.externalSource, partNumber: p.partNumber, trackingType: p.trackingType, baseUnitOfMeasure: p.baseUnitOfMeasure });
  } else {
    for (const s of await db.supplier.findMany({ where: { id: { in: ids }, organisationId: job.organisationId }, select: { id: true, name: true, contactName: true, phone: true, email: true, address: true, taxId: true, externalId: true, externalSource: true } })) out.set(s.id, { name: s.name, contactName: s.contactName, phone: s.phone, email: s.email, address: s.address, taxId: s.taxId, externalId: s.externalId, externalSource: s.externalSource });
  }
  return out;
}

/** A value another record already holds where it must be unique: why the change cannot be made, or null. */
async function taken(db: Db, entity: RoundTripEntity, job: RoundTripJob, id: string, cur: Record<string, Plain>, c: Change): Promise<string | null> {
  const to = String(c.to);
  const source = (cur.externalSource as string | null) ?? (job.sourceSystem === 'LEGACY' ? 'LEGACY' : 'SAP');
  if (entity === 'customers' && c.field === 'email') {
    const other = await db.customer.findUnique({ where: { email: to.toLowerCase() }, select: { id: true, organisationId: true } });
    if (other && other.id !== id) return other.organisationId === job.organisationId ? `Another customer already uses ${to}: open their page instead.` : `${to} is already registered on the platform: use another email for this customer.`;
  }
  if (c.field === 'externalId') {
    const ext = to.replace(/^0+(?=\d)/, '');
    const other = entity === 'customers' ? await db.customer.findFirst({ where: { organisationId: job.organisationId, externalSource: source, externalId: ext, id: { not: id } }, select: { id: true } })
      : entity === 'suppliers' ? await db.supplier.findFirst({ where: { organisationId: job.organisationId, externalSource: source, externalId: ext, id: { not: id } }, select: { id: true } })
      : entity === 'parts' ? await db.part.findFirst({ where: { branchId: job.branchId!, externalSource: source, externalId: ext, id: { not: id } }, select: { id: true } })
      : null;
    if (other) return `Number ${ext} is already another ${AUDIT[entity].noun}’s in EJO.`;
  }
  if (entity === 'vehicles' && (c.field === 'plateNumber' || c.field === 'chassisNumber')) {
    const key = to.toUpperCase().replace(/[\s-]/g, '');
    const rows = c.field === 'plateNumber'
      ? await db.$queryRaw<{ id: string }[]>`SELECT id FROM customer_vehicles WHERE id <> ${id} AND upper(regexp_replace(coalesce("plateNumber", ''), '[\\s-]', '', 'g')) = ${key} LIMIT 1`
      : await db.customerVehicle.findMany({ where: { chassisNumber: to, id: { not: id } }, select: { id: true }, take: 1 });
    if (rows.length) return `${c.field === 'plateNumber' ? 'Plate' : 'Chassis number'} ${to} is already another vehicle’s.`;
  }
  return null;
}

async function writeChanges(db: Db, rows: { id: string; changes: Change[] | null }[]): Promise<void> {
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  const json = rows.map((r) => (r.changes ? JSON.stringify(r.changes) : null));
  await db.$executeRaw`UPDATE import_rows AS r SET changes = v.c::jsonb FROM unnest(${ids}::text[], ${json}::text[]) AS v(id, c) WHERE r.id = v.id`;
}

/** The SAP number a row of SAP's own extract carries (KUNNR, EQUNR, LIFNR, MATNR), without SAP's leading zeros. */
function sapKeyOf(values: unknown): string | null {
  const v = String((values as { externalId?: unknown } | null)?.externalId ?? '').trim().replace(/^0+(?=\d)/, '');
  return v ? v.slice(0, 60) : null;
}

/**
 * C1b — SAP's master data back in: the records with these SAP numbers, fenced
 * to the organisation (a part to the import's branch, by its SAP number or,
 * kept as SAP's MATNR, its part number). 'MANY' when a number is on more than
 * one record (never guessed).
 */
async function sapMatches(db: Db, entity: RoundTripEntity, job: RoundTripJob, keys: string[]): Promise<Map<string, string | 'MANY'>> {
  const out = new Map<string, string | 'MANY'>();
  const want = [...new Set(keys)];
  if (!want.length) return out;
  const put = (k: string | null, id: string) => { if (!k) return; const key = k.replace(/^0+(?=\d)/, ''); const had = out.get(key); out.set(key, had && had !== id ? 'MANY' : id); };
  const sap = { externalSource: 'SAP', externalId: { in: want } };
  if (entity === 'customers') for (const r of await db.customer.findMany({ where: { organisationId: job.organisationId, ...sap }, select: { id: true, externalId: true } })) put(r.externalId, r.id);
  else if (entity === 'suppliers') for (const r of await db.supplier.findMany({ where: { organisationId: job.organisationId, ...sap }, select: { id: true, externalId: true } })) put(r.externalId, r.id);
  else if (entity === 'vehicles') for (const r of await db.customerVehicle.findMany({ where: { customer: { organisationId: job.organisationId }, ...sap }, select: { id: true, externalId: true } })) put(r.externalId, r.id);
  else if (job.branchId) {
    for (const r of await db.part.findMany({ where: { branchId: job.branchId, OR: [sap, { externalSource: 'SAP', externalId: null, partNumber: { in: want } }] }, select: { id: true, externalId: true, partNumber: true } })) put(r.externalId ?? r.partNumber, r.id);
  }
  return out;
}

/** Checks a block of rows: each found by its EJO record, its changes worked out and kept for the preview. */
export async function checkRoundTripRows(entity: RoundTripEntity, job: RoundTripJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const parsed = rows.map((r) => ({ r, c: parse(entity, r.cells as unknown[], mapping, job.sourceSystem), ejo: ejoRecordOf(r.cells as unknown[], mapping) }));
  // C1b — SAP's own extract (no EJO record column): each row found by its SAP number, and only by it.
  const bySap = mapping.ejoRecord == null && job.sourceSystem === 'SAP' ? await sapMatches(prisma, entity, job, parsed.map((x) => sapKeyOf(x.c.values)).filter((k): k is string => Boolean(k))) : null;
  const checked = parsed.map((x) => {
    const sap = bySap ? sapKeyOf(x.c.values) : null;
    const hit = sap ? bySap!.get(sap) : undefined;
    return { ...x, sap, id: x.ejo ?? (hit && hit !== 'MANY' ? hit : null), many: hit === 'MANY' };
  });
  const current = await currentOf(prisma, entity, job, [...new Set(checked.map((x) => x.id).filter((x): x is string => Boolean(x)))]);
  const updates: RowUpdate[] = [];
  const changes: { id: string; changes: Change[] | null }[] = [];
  for (const { r, c, ejo, sap, id, many } of checked) {
    const issues: Issue[] = [...c.issues];
    const fail = (message: string) => issues.push({ field: bySap ? 'externalId' : 'ejoRecord', level: 'error', message });
    let found: Change[] | null = null;
    const cur = id ? current.get(id) : undefined;
    if (bySap && !sap) fail(`No SAP number: an update from SAP’s file finds each ${AUDIT[entity].noun} by its SAP number only.`);
    else if (bySap && many) fail(`SAP number ${sap} is on more than one ${AUDIT[entity].noun} in EJO: put it right on their pages first.`);
    else if (bySap && !cur) fail(`No ${AUDIT[entity].noun} in EJO has SAP number ${sap}${entity === 'parts' ? ' in this branch’s catalogue' : ''}: to add new ones, import the file with “Add new only”.`);
    else if (!ejo && !bySap) fail('No EJO record: “Update records exported from EJO” changes only records exported from EJO (their “EJO record” column). To add new ones, import the file with “Add new only”.');
    else if (!cur) fail(entity === 'parts' ? 'This EJO record is not a part of this branch’s catalogue: export the branch’s own parts, or start the import in the part’s branch.' : `This EJO record is not one of your organisation’s ${entity}.`);
    else if (c.values) {
      const d = diffRecord(entity, cur, c.values as never, r.cells as unknown[], mapping);
      for (const e of d.errors) fail(e);
      issues.push(...d.notes);
      if (!d.errors.length) {
        for (const ch of d.changes) { const why = await taken(prisma, entity, job, id!, cur, ch); if (why) fail(why); }
        found = d.changes;
      }
    }
    const failed = issues.some((i) => i.level === 'error');
    changes.push({ id: r.id, changes: failed ? null : found });
    updates.push({ id: r.id, status: failed ? 'REJECTED' : issues.length ? 'WARNING' : 'GOOD', issues, matchedId: cur ? id : null, matchedBy: cur ? (ejo ? 'ejo' : 'sap') : null, keys: ejo ? [`ejo:${ejo}`] : sap ? [`sap:${sap}`] : [] });
  }
  await writeChanges(prisma, changes);
  return updates;
}

/** A change as the record stores it. */
function data(entity: RoundTripEntity, cur: Record<string, Plain>, changes: Change[], job: RoundTripJob): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of changes) {
    if (c.field === 'customerSince') out.customerSince = c.to === null ? null : new Date(`${c.to}T00:00:00.000Z`);
    else if (c.field === 'externalId') { out.externalId = c.to === null ? null : String(c.to).replace(/^0+(?=\d)/, ''); if (!cur.externalSource && c.to !== null) out.externalSource = job.sourceSystem === 'LEGACY' ? 'LEGACY' : 'SAP'; }
    else if (c.field === 'email') out.email = c.to === null ? null : String(c.to).toLowerCase();
    else out[c.field] = c.to;
  }
  return out;
}

async function update(tx: Tx, entity: RoundTripEntity, id: string, d: Record<string, unknown>) {
  if (entity === 'customers') await tx.customer.update({ where: { id }, data: d });
  else if (entity === 'vehicles') await tx.customerVehicle.update({ where: { id }, data: d });
  else if (entity === 'parts') await tx.part.update({ where: { id }, data: d });
  else await tx.supplier.update({ where: { id }, data: d });
}

const sameAs = (entity: RoundTripEntity, field: string) => (a: Plain, b: Plain) => {
  const s = UPDATABLE[entity].find((x) => x.field === field);
  const t = (v: Plain) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
  return s?.same ? s.same(a, b) : t(a) === t(b);
};

/** Loads a block: each previewed change still true is applied under a lock, unique values checked again, one audit entry per record. */
export async function loadRoundTripRows(tx: Tx, entity: RoundTripEntity, job: RoundTripJob, rows: LoadRow[]): Promise<void> {
  const stored = new Map((await tx.importRow.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, matchedId: true, changes: true } })).map((r) => [r.id, r]));
  const ids = [...new Set([...stored.values()].map((r) => r.matchedId).filter((x): x is string => Boolean(x)))];
  if (ids.length) await lockRows(tx, AUDIT[entity].lock, ids);
  const current = await currentOf(tx, entity, job, ids);
  const actor = job.approvedById ?? job.createdById;
  const results: Result[] = [];
  const applied: { id: string; changes: Change[] | null }[] = [];
  for (const r of rows) {
    const s = stored.get(r.id);
    const id = s?.matchedId ?? null;
    const cur = id ? current.get(id) : undefined;
    const want = (s?.changes as Change[] | null) ?? [];
    if (!id || !cur) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: `The ${AUDIT[entity].noun} is no longer in EJO.` }); continue; }
    if (!want.length) { results.push({ id: r.id, status: 'SKIPPED', resultId: id, note: 'No change.' }); continue; }
    const notes: string[] = [];
    const ok: Change[] = [];
    for (const c of want) {
      if (!sameAs(entity, c.field)(cur[c.field] ?? null, c.from)) { notes.push(`${c.label} was changed in EJO since the check: left as it is.`); continue; }
      const why = await taken(tx, entity, job, id, cur, c);
      if (why) { notes.push(`${c.label} not changed: ${why}`); continue; }
      ok.push(c);
    }
    applied.push({ id: r.id, changes: ok });
    if (!ok.length) { results.push({ id: r.id, status: 'SKIPPED', resultId: id, note: notes.join(' ') || 'No change.' }); continue; }
    await update(tx, entity, id, data(entity, cur, ok, job));
    for (const c of ok) cur[c.field] = c.to;
    await tx.auditLog.create({
      data: {
        organisationId: job.organisationId, userId: actor, action: AUDIT[entity].action, entityType: AUDIT[entity].type, entityId: id,
        metadata: { via: 'import', import: job.number, changes: Object.fromEntries(ok.map((c) => [c.field, { from: c.from, to: c.to }])) } as Prisma.InputJsonValue,
      },
    });
    results.push({ id: r.id, status: 'UPDATED', resultId: id, filled: ok.map((c) => c.field), note: [`Changed ${ok.length} field${ok.length === 1 ? '' : 's'} from the file.`, ...notes].join(' ') });
  }
  await writeChanges(tx, applied);
  await writeLoadResults(tx, rows, results);
}

/**
 * Undoes a block of an update import: each field still holding what the import
 * wrote goes back to what it was; one changed since is kept and named. Returns
 * how many rows it handled (0 when done).
 */
export async function undoRoundTripBatch(tx: Tx, entity: RoundTripEntity, job: RoundTripJob, actorId: string, take = 200): Promise<number> {
  const rows = await tx.importRow.findMany({ where: { jobId: job.id, status: { in: ['CREATED', 'UPDATED'] } }, orderBy: { rowNumber: 'asc' }, take, select: { id: true, resultId: true, changes: true, issues: true } });
  if (!rows.length) return 0;
  const ids = [...new Set(rows.map((r) => r.resultId).filter((x): x is string => Boolean(x)))];
  if (ids.length) await lockRows(tx, AUDIT[entity].lock, ids);
  const current = await currentOf(tx, entity, job, ids);
  for (const r of rows) {
    const cur = r.resultId ? current.get(r.resultId) : undefined;
    const done = (r.changes as Change[] | null) ?? [];
    const back: Change[] = [];
    const kept: string[] = [];
    if (cur) for (const c of done) {
      if (sameAs(entity, c.field)(cur[c.field] ?? null, c.to)) back.push({ ...c, from: c.to, to: c.from });
      else kept.push(c.label);
    }
    // An empty "from" is put back as empty: the import filled it, the undo empties it again (unique values never clash: they were empty).
    const okBack: Change[] = [];
    for (const c of back) { if (c.to !== null && cur && (await taken(tx, entity, job, r.resultId!, cur, c))) kept.push(c.label); else okBack.push(c); }
    if (cur && okBack.length) {
      await update(tx, entity, r.resultId!, data(entity, cur, okBack, job));
      await tx.auditLog.create({
        data: {
          organisationId: job.organisationId, userId: actorId, action: AUDIT[entity].action, entityType: AUDIT[entity].type, entityId: r.resultId!,
          metadata: { via: 'undo of import', import: job.number, changes: Object.fromEntries(okBack.map((c) => [c.field, { from: c.from, to: c.to }])) } as Prisma.InputJsonValue,
        },
      });
    }
    const issues = [...(((r.issues as Issue[] | null) ?? []))];
    if (!cur) issues.push({ field: 'row', level: 'warning', message: `Undo: the ${AUDIT[entity].noun} is no longer in EJO.` });
    else if (kept.length) issues.push({ field: 'row', level: 'warning', message: `Undo: changed in EJO since the import, so kept as it is now: ${kept.join(', ')}.` });
    await tx.importRow.updateMany({ where: { id: r.id, status: { in: ['CREATED', 'UPDATED'] } }, data: { status: 'UNDONE', issues: issues.length ? (issues as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
  }
  return rows.length;
}

/** What the update will change: records and fields, with the fields counted by name. */
export async function roundTripTotals(jobId: string): Promise<{ lines: number; quantity: number; value: number; counts: Record<string, number> }> {
  const rows = await prisma.$queryRaw<{ field: string; n: bigint }[]>`
    SELECT c->>'label' AS field, count(*)::bigint AS n
      FROM import_rows r, jsonb_array_elements(r.changes) AS c
     WHERE r."jobId" = ${jobId} AND r.status IN ('GOOD', 'WARNING') AND jsonb_typeof(r.changes) = 'array'
     GROUP BY 1`;
  const [rec] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM import_rows WHERE "jobId" = ${jobId} AND status IN ('GOOD', 'WARNING') AND jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) > 0`;
  const counts = Object.fromEntries(rows.map((r) => [r.field, Number(r.n)]));
  return { lines: Number(rec?.n ?? 0), quantity: Object.values(counts).reduce((a, b) => a + b, 0), value: 0, counts };
}

/** The previewed (or, once loaded, applied) changes, a page at a time. */
export async function roundTripChanges(jobId: string, page = 0, size = 50): Promise<{ rows: { rowNumber: number; recordId: string | null; status: string; changes: Change[] }[]; more: boolean }> {
  const rows = await prisma.$queryRaw<{ rowNumber: number; matchedId: string | null; status: string; changes: Change[] }[]>`
    SELECT "rowNumber", "matchedId", status, changes FROM import_rows
     WHERE "jobId" = ${jobId} AND jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) > 0
     ORDER BY "rowNumber" LIMIT ${size + 1} OFFSET ${page * size}`;
  return { rows: rows.slice(0, size).map((r) => ({ rowNumber: r.rowNumber, recordId: r.matchedId, status: r.status, changes: r.changes })), more: rows.length > size };
}
