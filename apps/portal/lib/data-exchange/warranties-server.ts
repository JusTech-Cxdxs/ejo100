/**
 * Data Exchange — warranties and open warranty claims at the cut-over (P6).
 * Server only (never a 'use server' file): lib/actions/data-exchange.ts
 * checks who is asking, locks the import and calls these inside its
 * transactions.
 *
 * Warranties: each row becomes an EJO warranty (WR number) under one of the
 * organisation's warranty policies, on a customer and (for a vehicle) a
 * vehicle already in EJO. Its old number is kept (externalId) and
 * searchable; its dates are the old system's (or worked out from the
 * policy); it is active from the day it started — the import's two people
 * (who ran it, who approved it) are its registration and its verification,
 * the same two-person rule as a warranty registered at the desk.
 *
 * Open claims: each row becomes a live EJO claim (WC number) at its stage,
 * on its warranty, its old number kept. The approvals and the provider's
 * decision before EJO are recorded as such (dated, "before EJO"), not
 * replayed; from its stage on, the claim carries on in EJO as any other.
 *
 * Nothing is emailed: the customer, the provider and the staff were told at
 * the time. Undo moves to the Recycle bin only what nobody has used since
 * (a claim, a covered estimate line, a status change); the rest is kept and
 * reported.
 */
import { prisma, type Prisma } from '@ejo/database';
import { checkClaimRow, checkWarrantyRow, atOrPast, kindWord, norm, pickPolicy, STATUS_WORD, type ClaimValues, type Policy, type WarrantyValues } from './check-warranties';
import type { Issue } from './check';
import type { Mapping } from './fields';
import { findCustomers } from './lookup-server';
import { newId, writeLoadResults, type LoadRow, type Result, type RowUpdate } from './rows-server';
import { highestSequence } from '../recycle-bin/numbers';
import { lagosYear } from '../utils/format-date';
import { warrantyEndDate } from '../warranty-state';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type WarrantyImportJob = { id: string; number: string; organisationId: string; sourceSystem: string; createdById: string; approvedById: string | null };

export const BEFORE_EJO = 'before EJO';
const src = (s: string) => (s === 'LEGACY' ? 'LEGACY' : 'SAP');
const from = (s: string) => (src(s) === 'LEGACY' ? 'the old system' : 'SAP');
const dayDate = (d: string) => new Date(`${d}T09:00:00.000+01:00`);
const DAY = 86_400_000;

type Vehicle = { id: string; customerId: string; make: string | null; model: string | null; year: number | null; plateNumber: string | null; chassisNumber: string | null };

async function vehiclesFor(db: Db, organisationId: string, vins: string[], plates: string[]) {
  const [byVinRows, plateIds] = await Promise.all([
    vins.length ? db.customerVehicle.findMany({ where: { chassisNumber: { in: vins }, customer: { organisationId } }, select: { id: true, customerId: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true } }) : [],
    plates.length ? db.$queryRaw<{ id: string; k: string }[]>`
      SELECT v.id, upper(regexp_replace(coalesce(v."plateNumber", ''), '[\\s-]', '', 'g')) AS k FROM customer_vehicles v JOIN customers c ON c.id = v."customerId"
       WHERE c."organisationId" = ${organisationId} AND upper(regexp_replace(coalesce(v."plateNumber", ''), '[\\s-]', '', 'g')) = ANY(${plates}::text[])` : [],
  ]);
  const plateRows = plateIds.length ? await db.customerVehicle.findMany({ where: { id: { in: plateIds.map((p) => p.id) } }, select: { id: true, customerId: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true } }) : [];
  const byId = new Map(plateRows.map((v) => [v.id, v]));
  return {
    byVin: new Map(byVinRows.map((v) => [String(v.chassisNumber).toUpperCase(), v as Vehicle])),
    byPlate: new Map(plateIds.map((p) => [p.k, byId.get(p.id)!]).filter((x): x is [string, Vehicle] => Boolean(x[1]))),
  };
}

/** The next numbers of a kind (WR-, WC-), counting from the highest in use or binned this year, as the desk does. */
async function nextNumbers(tx: Tx, kind: 'WR' | 'WC', count: number): Promise<string[]> {
  const prefix = `${kind}-${lagosYear()}-`;
  const [latest, binned] = await Promise.all([
    kind === 'WR'
      ? tx.warranty.findFirst({ where: { warrantyNumber: { startsWith: prefix } }, orderBy: { warrantyNumber: 'desc' }, select: { warrantyNumber: true } }).then((x) => x?.warrantyNumber)
      : tx.warrantyClaim.findFirst({ where: { claimNumber: { startsWith: prefix } }, orderBy: { claimNumber: 'desc' }, select: { claimNumber: true } }).then((x) => x?.claimNumber),
    tx.recycleBinItem.findFirst({ where: { entityType: kind === 'WR' ? 'Warranty' : 'WarrantyClaim', reference: { startsWith: prefix } }, orderBy: { reference: 'desc' }, select: { reference: true } }),
  ]);
  const start = highestSequence(prefix, [latest, binned?.reference]);
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + 1 + i).padStart(6, '0')}`);
}

// ══ Warranties ════════════════════════════════════════════════════════


type WLookups = {
  cust: Awaited<ReturnType<typeof findCustomers>>;
  byVin: Map<string, Vehicle>;
  byPlate: Map<string, Vehicle>;
  policies: Policy[];
  existing: Map<string, { id: string; warrantyNumber: string }>;
  held: Map<string, string>;
  parts: Map<string, { id: string; name: string; partNumber: string | null }>;
  serials: Map<string, { id: string; partId: string }>;
};

async function warrantyLookups(db: Db, job: WarrantyImportJob, vals: WarrantyValues[]): Promise<WLookups> {
  const org = job.organisationId;
  const vins = [...new Set(vals.map((v) => v.vinKey).filter((v): v is string => Boolean(v)))];
  const plates = [...new Set(vals.map((v) => v.plateKey).filter((v): v is string => Boolean(v)))];
  const partNumbers = [...new Set(vals.map((v) => v.partNumber).filter((v): v is string => Boolean(v)))];
  const [cust, veh, policies, existing, parts] = await Promise.all([
    findCustomers(db, org, src(job.sourceSystem), {
      ext: vals.map((v) => v.customer.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)),
      email: vals.map((v) => v.customer.email).filter((v): v is string => Boolean(v)),
      phone: vals.map((v) => v.customer.phone).filter((v): v is string => Boolean(v)),
    }),
    vehiclesFor(db, org, vins, plates),
    db.warrantyPolicy.findMany({ where: { OR: [{ organisationId: org }, { organisationId: null }] }, select: { id: true, code: true, name: true, kind: true, providerId: true, durationMonths: true, durationUnit: true, distanceLimit: true, coverageSummary: true, exclusions: true, conditions: true, isActive: true, archivedAt: true, provider: { select: { name: true } } } }),
    db.warranty.findMany({ where: { externalSource: src(job.sourceSystem), externalId: { in: vals.map((v) => v.warrantyNumber) }, customer: { organisationId: org } }, select: { id: true, externalId: true, warrantyNumber: true } }),
    partNumbers.length ? db.part.findMany({ where: { partNumber: { in: partNumbers, mode: 'insensitive' }, branch: { businessUnit: { organisationId: org } } }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, partNumber: true } }) : [],
  ]);
  const vehicleIds = [...new Set([...veh.byVin.values(), ...veh.byPlate.values()].map((v) => v.id))];
  const serialNumbers = [...new Set(vals.map((v) => v.serialNumber).filter((v): v is string => Boolean(v)))];
  const [held, serials] = await Promise.all([
    vehicleIds.length ? db.warranty.findMany({ where: { vehicleId: { in: vehicleIds }, kind: 'ASSET', status: { in: ['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED'] } }, select: { vehicleId: true, policyId: true, warrantyNumber: true } }) : [],
    serialNumbers.length && parts.length ? db.partSerial.findMany({ where: { serialNumber: { in: serialNumbers, mode: 'insensitive' }, partId: { in: parts.map((p) => p.id) } }, select: { id: true, partId: true, serialNumber: true } }) : [],
  ]);
  const partMap = new Map<string, { id: string; name: string; partNumber: string | null }>();
  for (const p of parts) { const k = String(p.partNumber ?? '').toUpperCase(); if (!partMap.has(k)) partMap.set(k, p); }
  return {
    cust, byVin: veh.byVin, byPlate: veh.byPlate,
    policies: policies.map((p) => ({ ...p, providerName: p.provider.name })),
    existing: new Map(existing.map((w) => [String(w.externalId).toUpperCase(), { id: w.id, warrantyNumber: w.warrantyNumber }])),
    held: new Map(held.map((w) => [`${w.vehicleId}:${w.policyId}`, w.warrantyNumber])),
    parts: partMap,
    serials: new Map(serials.map((s) => [`${s.partId}:${s.serialNumber.toUpperCase()}`, { id: s.id, partId: s.partId }])),
  };
}

type WResolved = { owner: string | null; vehicle: Vehicle | null; policy: Policy | null; part: { id: string; name: string; partNumber: string | null } | null; serialId: string | null; errors: string[]; notes: string[] };

function resolveWarranty(v: WarrantyValues, L: WLookups): WResolved {
  const errors: string[] = [];
  const notes: string[] = [];
  const vehicle = (v.vinKey && L.byVin.get(v.vinKey)) || (v.plateKey && L.byPlate.get(v.plateKey)) || null;
  if (!vehicle && v.kind === 'ASSET') errors.push('The vehicle is not in EJO. Import the vehicles file first (a vehicle warranty needs the vehicle it covers), or check the chassis number or plate.');
  if (!vehicle && v.kind === 'PART' && (v.vinKey || v.plateKey)) notes.push('The vehicle it is fitted to is not in EJO; the part warranty is kept on the customer.');
  const byEmail = v.customer.email ? L.cust.email.get(v.customer.email) : undefined;
  const named = (v.customer.externalId && L.cust.ext.get(v.customer.externalId.toUpperCase())) || (v.customer.phone && L.cust.phone.get(v.customer.phone.slice(-10))) || (byEmail && byEmail.sameOrg ? byEmail.id : null) || null;
  const owner = vehicle?.customerId ?? named;
  if (vehicle && named && named !== vehicle.customerId) notes.push('The customer named is not the vehicle’s owner in EJO; the warranty is kept on the owner.');
  if (!owner && !errors.length) errors.push('The customer is not in EJO. Import the customers file first, or check their number, phone or email.');

  const pick = pickPolicy(v, L.policies);
  if (pick.error) errors.push(pick.error);
  if (pick.note) notes.push(pick.note);
  const policy = pick.policy;
  if (policy) {
    if (policy.kind !== v.kind) errors.push(`${policy.code} is a ${kindWord(policy.kind)} policy, but this row is a ${kindWord(v.kind)} warranty.`);
    if (v.provider && norm(v.provider) !== norm(policy.providerName)) errors.push(`The provider “${v.provider}” is not ${policy.code}’s provider (${policy.providerName}).`);
    if (v.policy && v.months !== null && policy.durationUnit === 'MONTHS' && v.months !== policy.durationMonths) notes.push(`${policy.code} runs ${policy.durationMonths} months, the file says ${v.months}${v.endsAt ? '; the end date in the file is kept' : '; the policy’s length is used'}.`);
    if (policy.archivedAt) notes.push(`${policy.code} is archived: the warranty is brought in under it, for its history.`);
    else if (!policy.isActive) notes.push(`${policy.code} is switched off for new warranties: this one is brought in under it, as it was sold.`);
    if (vehicle && v.kind === 'ASSET') {
      const holds = L.held.get(`${vehicle.id}:${policy.id}`);
      if (holds) errors.push(`This vehicle already holds ${holds} under ${policy.code}: one warranty per vehicle and policy.`);
    }
  }
  let part: WResolved['part'] = null;
  let serialId: string | null = null;
  if (v.kind === 'PART' && v.partNumber) {
    part = L.parts.get(v.partNumber) ?? null;
    if (!part) errors.push(`Part ${v.partNumber} is not in EJO’s parts catalogue. Import the parts file first, or check the part number.`);
    else if (v.serialNumber) {
      serialId = L.serials.get(`${part.id}:${v.serialNumber}`)?.id ?? null;
      if (!serialId) notes.push(`Serial ${v.serialNumber} is not in EJO’s stock records (it was fitted before EJO); kept on the warranty in words.`);
    }
  }
  return { owner, vehicle, policy, part, serialId, errors, notes };
}

export async function checkWarrantyRows(job: WarrantyImportJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const checked = rows.map((r) => ({ r, c: checkWarrantyRow(r.cells as unknown[], mapping) }));
  const L = await warrantyLookups(prisma, job, checked.map((x) => x.c.values).filter((v): v is WarrantyValues => Boolean(v)));
  const out: RowUpdate[] = [];
  for (const { r, c } of checked) {
    const issues: Issue[] = [...c.issues];
    let status: string = c.status;
    let matchedId: string | null = null;
    let matchedBy: string | null = null;
    const v = c.values;
    if (v && status !== 'REJECTED') {
      const hit = L.existing.get(v.warrantyNumber.toUpperCase());
      if (hit) {
        matchedId = hit.id; matchedBy = 'warranty';
        issues.push({ field: 'warrantyNumber', level: 'warning', message: `Already brought into EJO as ${hit.warrantyNumber}; left as it is.` });
        status = 'WARNING';
      } else {
        const res = resolveWarranty(v, L);
        for (const e of res.errors) issues.push({ field: 'warranty', level: 'error', message: e });
        for (const n of res.notes) issues.push({ field: 'warranty', level: 'warning', message: n });
        if (res.errors.length) status = 'REJECTED';
        else if (status === 'GOOD' && issues.length) status = 'WARNING';
      }
    }
    out.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
  }
  return out;
}

/** What will load: warranties, how many cover vehicles and parts, how many are suspended, void or transferred, over which start dates (no money). */
export async function warrantyTotalsOfRows(jobId: string, mapping: Mapping, statuses: string[]): Promise<{ lines: number; quantity: number; value: number; vehicles: number; parts: number; notActive: number; from: string | null; to: string | null }> {
  let after = 0; let lines = 0; let vehicles = 0; let parts = 0; let notActive = 0; let first: string | null = null; let last: string | null = null;
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, matchedBy: null, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const v = checkWarrantyRow(r.cells as unknown[], mapping).values;
      if (!v) continue;
      lines += 1;
      if (v.kind === 'PART') parts += 1; else vehicles += 1;
      if (v.status !== 'ACTIVE') notActive += 1;
      if (!first || v.startsAt < first) first = v.startsAt;
      if (!last || v.startsAt > last) last = v.startsAt;
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: 0, value: 0, vehicles, parts, notActive, from: first, to: last };
}

export async function warrantyTotalsLoaded(jobId: string): Promise<{ lines: number; quantity: number; value: number }> {
  return { lines: await prisma.warranty.count({ where: { importJobId: jobId } }), quantity: 0, value: 0 };
}

export async function loadWarrantyRows(tx: Tx, job: WarrantyImportJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkWarrantyRow(r.cells as unknown[], mapping) }));
  // Matched again now: a vehicle, a customer, a policy or a warranty may have been added since the check.
  const L = await warrantyLookups(tx, job, checked.map((x) => x.c.values).filter((v): v is WarrantyValues => Boolean(v)));
  const results: Result[] = [];
  const todo: { r: LoadRow; v: WarrantyValues; res: WResolved }[] = [];
  const seen = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const hit = L.existing.get(v.warrantyNumber.toUpperCase());
    if (hit) { results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: `Already brought into EJO as ${hit.warrantyNumber}; left as it is.` }); continue; }
    const res = resolveWarranty(v, L);
    if (res.errors.length || !res.owner || !res.policy) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: res.errors[0] ?? 'The customer or the policy is no longer in EJO; not loaded.' }); continue; }
    if (res.vehicle && v.kind === 'ASSET') {
      const k = `${res.vehicle.id}:${res.policy.id}`;
      if (seen.has(k)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Another row of this file already brought in this vehicle’s warranty under the same policy.' }); continue; }
      seen.add(k);
    }
    todo.push({ r, v, res });
  }
  const numbers = await nextNumbers(tx, 'WR', todo.length);
  const range = src(job.sourceSystem);
  const verifiedAt = new Date();
  for (const [i, { r, v, res }] of todo.entries()) {
    const p = res.policy!;
    const start = dayDate(v.startsAt);
    const subject = v.kind === 'PART'
      ? `${res.part ? `${res.part.name} (${res.part.partNumber ?? v.partNumber})` : v.partNumber}${v.serialNumber ? ` — serial ${v.serialNumber}` : ''}`
      : `${[res.vehicle!.year, res.vehicle!.make, res.vehicle!.model].filter(Boolean).join(' ') || 'Vehicle'}${res.vehicle!.chassisNumber ? ` — VIN ${res.vehicle!.chassisNumber}` : ''}${res.vehicle!.plateNumber ? ` — ${res.vehicle!.plateNumber}` : ''}`;
    const id = newId();
    await tx.warranty.create({
      data: {
        id, warrantyNumber: numbers[i]!, kind: v.kind, status: v.status, policyId: p.id, providerId: p.providerId, customerId: res.owner!,
        vehicleId: res.vehicle?.id ?? null, partId: res.part?.id ?? null, partSerialId: res.serialId, quantity: v.kind === 'PART' ? 1 : null,
        subjectDescription: subject, startsAt: start, endsAt: v.endsAt ? new Date(`${v.endsAt}T23:59:59.000+01:00`) : warrantyEndDate(start, p.durationMonths, p.durationUnit),
        startReading: v.startReading, distanceLimit: v.distanceLimit ?? p.distanceLimit,
        coverageSnapshot: p.coverageSummary, exclusionsSnapshot: p.exclusions, conditionsSnapshot: p.conditions,
        origin: 'IMPORT', evidenceNote: [v.evidence, `Brought into EJO from ${from(job.sourceSystem)} (warranty ${v.warrantyNumber}) by import ${job.number}.`].filter(Boolean).join(' · '),
        issuedById: job.createdById, issuedAt: start, verifiedById: job.approvedById, verifiedAt,
        statusReason: v.status === 'ACTIVE' ? null : (v.notes ?? `${STATUS_WORD[v.status]} ${BEFORE_EJO}.`),
        externalSource: range, externalId: v.warrantyNumber, importJobId: job.id,
      },
    });
    results.push({ id: r.id, status: 'CREATED', resultId: id, note: res.notes.length ? res.notes.join(' ') : undefined });
  }
  await writeLoadResults(tx, rows, results);
}

/** An imported warranty nobody has used since the import: no claim, no estimate line it covers, its status as the import left it. */
export async function warrantyUntouchedSinceImport(db: Db, id: string, jobId: string, loadedAt: Date): Promise<boolean> {
  const w = await db.warranty.findFirst({ where: { id, importJobId: jobId }, select: { updatedAt: true, _count: { select: { claims: true, coveredEstimateLines: true } } } });
  if (!w || w._count.claims || w._count.coveredEstimateLines) return false;
  return w.updatedAt.getTime() <= loadedAt.getTime() + 60_000;
}

// ══ Open claims ═══════════════════════════════════════════════════════

type WarrantyHit = { id: string; warrantyNumber: string; externalId: string | null; status: string; providerId: string; customerId: string; vehicleId: string | null; startsAt: Date; endsAt: Date; provider: { claimSubmissionDays: number | null; partRetentionDays: number | null }; policy: { defaultRemedy: string } };

type CLookups = {
  byNumber: Map<string, WarrantyHit>;
  byVehicle: Map<string, WarrantyHit[]>;
  byVin: Map<string, Vehicle>;
  byPlate: Map<string, Vehicle>;
  existing: Map<string, { id: string; claimNumber: string }>;
};

const WARRANTY_SELECT = { id: true, warrantyNumber: true, externalId: true, status: true, providerId: true, customerId: true, vehicleId: true, startsAt: true, endsAt: true, provider: { select: { claimSubmissionDays: true, partRetentionDays: true } }, policy: { select: { defaultRemedy: true } } } as const;

async function claimLookups(db: Db, job: WarrantyImportJob, vals: ClaimValues[]): Promise<CLookups> {
  const org = job.organisationId;
  const numbers = [...new Set(vals.map((v) => v.warrantyNumber).filter((v): v is string => Boolean(v)))];
  const vins = [...new Set(vals.filter((v) => !v.warrantyNumber).map((v) => v.vinKey).filter((v): v is string => Boolean(v)))];
  const plates = [...new Set(vals.filter((v) => !v.warrantyNumber).map((v) => v.plateKey).filter((v): v is string => Boolean(v)))];
  const [named, veh, existing] = await Promise.all([
    numbers.length ? db.warranty.findMany({ where: { customer: { organisationId: org }, OR: [{ externalId: { in: numbers, mode: 'insensitive' } }, { warrantyNumber: { in: numbers.map((n) => n.toUpperCase()) } }] }, select: WARRANTY_SELECT }) : [],
    vehiclesFor(db, org, vins, plates),
    db.warrantyClaim.findMany({ where: { externalSource: src(job.sourceSystem), externalId: { in: vals.map((v) => v.claimNumber) }, customer: { organisationId: org } }, select: { id: true, externalId: true, claimNumber: true } }),
  ]);
  const vehicleIds = [...new Set([...veh.byVin.values(), ...veh.byPlate.values()].map((v) => v.id))];
  const onVehicles = vehicleIds.length ? await db.warranty.findMany({ where: { vehicleId: { in: vehicleIds }, status: { in: ['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'] } }, select: WARRANTY_SELECT }) : [];
  const byNumber = new Map<string, WarrantyHit>();
  for (const w of named) { byNumber.set(w.warrantyNumber.toUpperCase(), w); if (w.externalId) byNumber.set(w.externalId.toUpperCase(), w); }
  const byVehicle = new Map<string, WarrantyHit[]>();
  for (const w of onVehicles) { const list = byVehicle.get(w.vehicleId!) ?? []; list.push(w); byVehicle.set(w.vehicleId!, list); }
  return { byNumber, byVehicle, byVin: veh.byVin, byPlate: veh.byPlate, existing: new Map(existing.map((c) => [String(c.externalId).toUpperCase(), { id: c.id, claimNumber: c.claimNumber }])) };
}

function resolveClaim(v: ClaimValues, L: CLookups): { warranty: WarrantyHit | null; errors: string[]; notes: string[] } {
  const errors: string[] = [];
  const notes: string[] = [];
  const failure = dayDate(v.failureDate);
  let warranty: WarrantyHit | null = null;
  if (v.warrantyNumber) {
    warranty = L.byNumber.get(v.warrantyNumber.toUpperCase()) ?? null;
    if (!warranty) errors.push(`Warranty ${v.warrantyNumber} is not in EJO. Import the warranties file first (the claim is on a warranty), or check the number.`);
  } else {
    const vehicle = (v.vinKey && L.byVin.get(v.vinKey)) || (v.plateKey && L.byPlate.get(v.plateKey)) || null;
    if (!vehicle) errors.push('The vehicle is not in EJO, and no warranty number is given. Import the vehicles and warranties files first.');
    else {
      const inForce = (L.byVehicle.get(vehicle.id) ?? []).filter((w) => w.startsAt.getTime() <= failure.getTime() + DAY && w.endsAt.getTime() >= failure.getTime() - DAY);
      if (inForce.length === 1) { warranty = inForce[0]!; notes.push(`No warranty number given: ${warranty.warrantyNumber} is the vehicle’s warranty on ${v.failureDate}.`); }
      else if (!inForce.length) errors.push(`The vehicle has no warranty in EJO in force on ${v.failureDate}. Import its warranty first, or give the warranty number.`);
      else errors.push(`The vehicle has ${inForce.length} warranties in force on ${v.failureDate} (${inForce.map((w) => w.warrantyNumber).join(', ')}): give the warranty number.`);
    }
  }
  if (warranty) {
    if (warranty.status === 'VOID' || warranty.status === 'TRANSFERRED') errors.push(`${warranty.warrantyNumber} is ${warranty.status.toLowerCase()}: a claim cannot be on it.`);
    if (warranty.status === 'PENDING_VERIFICATION') notes.push(`${warranty.warrantyNumber} is still waiting to be verified; the claim waits with it.`);
    if (failure.getTime() < warranty.startsAt.getTime() - DAY) errors.push(`The failure on ${v.failureDate} is before ${warranty.warrantyNumber} started.`);
    else if (failure.getTime() > warranty.endsAt.getTime() + DAY) notes.push(`The failure on ${v.failureDate} is after ${warranty.warrantyNumber} ended; brought in as it stood (the provider may decline it).`);
  }
  return { warranty, errors, notes };
}

export async function checkClaimRows(job: WarrantyImportJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const checked = rows.map((r) => ({ r, c: checkClaimRow(r.cells as unknown[], mapping) }));
  const L = await claimLookups(prisma, job, checked.map((x) => x.c.values).filter((v): v is ClaimValues => Boolean(v)));
  const out: RowUpdate[] = [];
  for (const { r, c } of checked) {
    const issues: Issue[] = [...c.issues];
    let status: string = c.status;
    let matchedId: string | null = null;
    let matchedBy: string | null = null;
    const v = c.values;
    if (v && status !== 'REJECTED') {
      const hit = L.existing.get(v.claimNumber.toUpperCase());
      if (hit) {
        matchedId = hit.id; matchedBy = 'claim';
        issues.push({ field: 'claimNumber', level: 'warning', message: `Already brought into EJO as ${hit.claimNumber}; left as it is.` });
        status = 'WARNING';
      } else {
        const res = resolveClaim(v, L);
        for (const e of res.errors) issues.push({ field: 'warrantyNumber', level: 'error', message: e });
        for (const n of res.notes) issues.push({ field: 'warrantyNumber', level: 'warning', message: n });
        if (res.errors.length) status = 'REJECTED';
        else if (status === 'GOOD' && issues.length) status = 'WARNING';
      }
    }
    out.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
  }
  return out;
}

/** What will load: claims, the amount claimed and the amount the providers have accepted (receivable). */
export async function claimTotalsOfRows(jobId: string, mapping: Mapping, statuses: string[]): Promise<{ lines: number; quantity: number; value: number; accepted: number; withProvider: number; from: string | null; to: string | null }> {
  let after = 0; let lines = 0; let value = 0; let accepted = 0; let withProvider = 0; let first: string | null = null; let last: string | null = null;
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, matchedBy: null, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const v = checkClaimRow(r.cells as unknown[], mapping).values;
      if (!v) continue;
      lines += 1; value += v.claimedAmount; accepted += v.approvedAmount ?? 0;
      if (v.stage === 'SUBMITTED') withProvider += 1;
      if (!first || v.failureDate < first) first = v.failureDate;
      if (!last || v.failureDate > last) last = v.failureDate;
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: 0, value: Math.round(value * 100) / 100, accepted: Math.round(accepted * 100) / 100, withProvider, from: first, to: last };
}

export async function claimTotalsLoaded(jobId: string): Promise<{ lines: number; quantity: number; value: number }> {
  const agg = await prisma.warrantyClaim.aggregate({ where: { importJobId: jobId }, _count: { _all: true }, _sum: { claimedAmount: true } });
  return { lines: agg._count._all, quantity: 0, value: Math.round(Number(agg._sum.claimedAmount ?? 0) * 100) / 100 };
}

export async function loadClaimRows(tx: Tx, job: WarrantyImportJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkClaimRow(r.cells as unknown[], mapping) }));
  const L = await claimLookups(tx, job, checked.map((x) => x.c.values).filter((v): v is ClaimValues => Boolean(v)));
  const results: Result[] = [];
  const todo: { r: LoadRow; v: ClaimValues; w: WarrantyHit; notes: string[] }[] = [];
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const hit = L.existing.get(v.claimNumber.toUpperCase());
    if (hit) { results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: `Already brought into EJO as ${hit.claimNumber}; left as it is.` }); continue; }
    const res = resolveClaim(v, L);
    if (res.errors.length || !res.warranty) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: res.errors[0] ?? 'The warranty is no longer in EJO; not loaded.' }); continue; }
    todo.push({ r, v, w: res.warranty, notes: res.notes });
  }
  const numbers = await nextNumbers(tx, 'WC', todo.length);
  const range = src(job.sourceSystem);
  for (const [i, { r, v, w, notes }] of todo.entries()) {
    const failure = dayDate(v.failureDate);
    const submitted = v.submittedOn ? dayDate(v.submittedOn) : failure;
    const decided = v.decidedOn ? dayDate(v.decidedOn) : submitted;
    const s = v.stage;
    const withProvider = atOrPast(s, 'SUBMITTED');
    const decidedYet = s === 'ACCEPTED' || s === 'PARTIALLY_ACCEPTED' || s === 'REJECTED';
    const returnRequired = v.partReturn ? v.partReturn.required : w.provider.partRetentionDays !== null;
    const returnStatus = !returnRequired ? null : (v.partReturn?.status ?? 'AWAITING');
    const id = newId();
    await tx.warrantyClaim.create({
      data: {
        id, claimNumber: numbers[i]!, status: s, warrantyId: w.id, providerId: w.providerId, customerId: w.customerId, vehicleId: w.vehicleId,
        complaint: v.complaint, cause: v.cause, correction: v.correction, causalPart: v.causalPart, causalPartNumber: v.causalPartNumber,
        failureDate: failure, failureReading: v.failureReading,
        labourAmount: v.labourAmount, partsAmount: v.partsAmount, otherAmount: v.otherAmount, logisticsAmount: v.logisticsAmount, claimedAmount: v.claimedAmount,
        approvedAmount: decidedYet ? (s === 'REJECTED' ? 0 : v.approvedAmount) : null,
        deadlineAt: w.provider.claimSubmissionDays ? new Date(failure.getTime() + w.provider.claimSubmissionDays * DAY) : null,
        providerReference: withProvider ? v.providerReference : null,
        decisionNotes: v.decisionNotes,
        remedy: (v.remedy ?? w.policy.defaultRemedy) as 'REIMBURSEMENT' | 'REPLACEMENT' | 'REPAIR',
        partReturnRequired: returnRequired, partReturnStatus: returnStatus,
        partSentAt: returnStatus === 'SENT' || returnStatus === 'RECEIVED_BY_PROVIDER' ? submitted : null,
        partReceivedAt: returnStatus === 'RECEIVED_BY_PROVIDER' ? decided : null,
        createdById: job.createdById,
        // The steps taken before EJO, dated, by nobody in EJO: they are not replayed, and the claim carries on from here.
        reviewRequestedAt: atOrPast(s, 'PENDING_HOD') ? failure : null,
        hodApprovedAt: atOrPast(s, 'PENDING_MANAGER') ? failure : null,
        managerApprovedAt: atOrPast(s, 'APPROVED_TO_SUBMIT') ? failure : null,
        submittedAt: withProvider ? submitted : null,
        decidedAt: decidedYet ? decided : null,
        externalSource: range, externalId: v.claimNumber, importJobId: job.id,
      },
    });
    results.push({ id: r.id, status: 'CREATED', resultId: id, note: notes.length ? notes.join(' ') : undefined });
  }
  await writeLoadResults(tx, rows, results);
}

/** An imported claim nobody has moved since the import: its stage, amounts and notes as the import left them. */
export async function claimUntouchedSinceImport(db: Db, id: string, jobId: string, loadedAt: Date): Promise<boolean> {
  const c = await db.warrantyClaim.findFirst({ where: { id, importJobId: jobId }, select: { updatedAt: true } });
  return Boolean(c) && c!.updatedAt.getTime() <= loadedAt.getTime() + 60_000;
}
