/**
 * Data Exchange — vehicle services open at the cut-over, and bookings
 * already in the diary (P6b). Server only (never a 'use server' file):
 * lib/actions/data-exchange.ts checks who is asking, locks the import and
 * calls these inside its transactions.
 *
 * Each row becomes an EJO Vehicle Service in the chosen workshop, on a
 * customer and vehicle already in EJO:
 *   • a booking (SCHEDULED) waits for the customer on its day and time
 *     (bookedFor); the front desk checks it in when the vehicle arrives;
 *   • a service already in the workshop carries on at its stage, accepted
 *     before EJO, with the day it came in;
 *   • its old number is kept (externalId) and searchable; EJO gives it its
 *     own SV number; staff are matched by employee ID (a name is tried);
 *   • nothing is emailed: the customer was told at the time.
 * One open visit per vehicle (a job card or a service), as on the desk.
 * Undo moves the services nobody has worked on since to the Recycle bin,
 * and keeps — and reports — the ones that have.
 */
import { prisma, type Prisma } from '@ejo/database';
import { checkOpenServiceRow, type OpenServiceValues } from './check-open-services';
import type { Issue } from './check';
import type { Mapping } from './fields';
import { findCustomers } from './lookup-server';
import { STAFF_AWAITING_INVITATION } from './check-staff';
import { newId, writeLoadResults, type LoadRow, type Result, type RowUpdate } from './rows-server';
import { highestSequence } from '../recycle-bin/numbers';
import { lagosYear } from '../utils/format-date';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type OpenServicesJob = { id: string; number: string; organisationId: string; branchId: string | null; sourceSystem: string; createdById: string; approvedById: string | null };

const src = (s: string) => (s === 'LEGACY' ? 'LEGACY' : 'SAP');
const dayDate = (d: string) => new Date(`${d}T09:00:00.000+01:00`);
/** A booking's moment, Lagos time (UTC+1, no daylight saving). */
export const bookedAt = (b: { day: string; time: string }) => new Date(`${b.day}T${b.time}:00.000+01:00`);
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
export const OPEN_SERVICE_STATUSES = ['SCHEDULED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION'] as const;

type Vehicle = { id: string; customerId: string; vehicleType: string | null };
type Lookups = {
  cust: Awaited<ReturnType<typeof findCustomers>>;
  byVin: Map<string, Vehicle>;
  byPlate: Map<string, Vehicle>;
  existing: Map<string, { id: string; serviceNumber: string }>;
  openOn: Map<string, string>;
  staff: Map<string, { id: string; fullName: string }>;
  staffByName: Map<string, { id: string; fullName: string }>;
  departments: Map<string, string>;
  branch: { name: string; sapPlant: string | null } | null;
};

async function lookups(db: Db, job: OpenServicesJob, vals: OpenServiceValues[]): Promise<Lookups> {
  const vins = [...new Set(vals.map((v) => v.vinKey).filter((v): v is string => Boolean(v)))];
  const plates = [...new Set(vals.map((v) => v.plateKey).filter((v): v is string => Boolean(v)))];
  const staffKeys = [...new Set(vals.flatMap((v) => [v.technician, v.supervisor]).filter((v): v is string => Boolean(v)))];
  const [cust, vehicles, plateRows, existing, staff, departments, branch] = await Promise.all([
    findCustomers(db, job.organisationId, src(job.sourceSystem), {
      ext: vals.map((v) => v.customer.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)),
      email: vals.map((v) => v.customer.email).filter((v): v is string => Boolean(v)),
      phone: vals.map((v) => v.customer.phone).filter((v): v is string => Boolean(v)),
    }),
    vins.length ? db.customerVehicle.findMany({ where: { chassisNumber: { in: vins }, customer: { organisationId: job.organisationId } }, select: { id: true, chassisNumber: true, customerId: true, vehicleType: true } }) : [],
    plates.length ? db.$queryRaw<{ id: string; customerId: string; vehicleType: string | null; k: string }[]>`
      SELECT v.id, v."customerId", v."vehicleType"::text AS "vehicleType", upper(regexp_replace(coalesce(v."plateNumber", ''), '[\\s-]', '', 'g')) AS k FROM customer_vehicles v JOIN customers c ON c.id = v."customerId"
       WHERE c."organisationId" = ${job.organisationId} AND upper(regexp_replace(coalesce(v."plateNumber", ''), '[\\s-]', '', 'g')) = ANY(${plates}::text[])` : [],
    job.branchId ? db.vehicleService.findMany({ where: { branchId: job.branchId, externalSource: src(job.sourceSystem), externalId: { in: vals.map((v) => v.serviceNumber) } }, select: { id: true, externalId: true, serviceNumber: true } }) : [],
    staffKeys.length ? db.user.findMany({ where: { organisationId: job.organisationId, AND: [{ OR: [{ isActive: true }, STAFF_AWAITING_INVITATION] }, { OR: [{ employeeId: { in: staffKeys } }, { fullName: { in: staffKeys, mode: 'insensitive' } }] }] }, select: { id: true, employeeId: true, fullName: true } }) : [],
    job.branchId ? db.department.findMany({ where: { branchId: job.branchId, slug: { in: ['workshop-passenger', 'workshop-commercial'] } }, select: { id: true, slug: true } }) : [],
    job.branchId ? db.branch.findUnique({ where: { id: job.branchId }, select: { name: true, sapPlant: true } }) : null,
  ]);
  const byVin = new Map(vehicles.map((v) => [String(v.chassisNumber).toUpperCase(), { id: v.id, customerId: v.customerId, vehicleType: v.vehicleType }]));
  const byPlate = new Map(plateRows.map((v) => [v.k, { id: v.id, customerId: v.customerId, vehicleType: v.vehicleType }]));
  const vehicleIds = [...new Set([...byVin.values(), ...byPlate.values()].map((v) => v.id))];
  // One open visit per vehicle: an open job card or an open service (a booking included).
  const [openJobs, openServices] = vehicleIds.length
    ? await Promise.all([
        db.jobCard.findMany({ where: { vehicleId: { in: vehicleIds }, status: { notIn: ['CANCELLED', 'CLOSED', 'CHECKED_OUT'] } }, select: { vehicleId: true, jobNumber: true } }),
        db.vehicleService.findMany({ where: { vehicleId: { in: vehicleIds }, status: { in: [...OPEN_SERVICE_STATUSES] } }, select: { vehicleId: true, serviceNumber: true } }),
      ])
    : [[], []];
  return {
    cust, byVin, byPlate,
    existing: new Map(existing.map((s) => [String(s.externalId).toUpperCase(), { id: s.id, serviceNumber: s.serviceNumber }])),
    openOn: new Map([...openJobs.map((j) => [j.vehicleId, j.jobNumber] as const), ...openServices.map((s) => [s.vehicleId, s.serviceNumber] as const)]),
    staff: new Map(staff.filter((u) => u.employeeId).map((u) => [norm(u.employeeId!), { id: u.id, fullName: u.fullName }])),
    staffByName: new Map(staff.map((u) => [norm(u.fullName), { id: u.id, fullName: u.fullName }])),
    departments: new Map(departments.map((d) => [d.slug, d.id])),
    branch,
  };
}

type Resolved = { owner: string | null; vehicle: Vehicle | null; technician: { id: string; fullName: string } | null; supervisor: { id: string; fullName: string } | null; errors: string[]; notes: string[] };

function resolve(v: OpenServiceValues, L: Lookups, job: OpenServicesJob, self: string | null): Resolved {
  const errors: string[] = [];
  const notes: string[] = [];
  const vehicle = (v.vinKey && L.byVin.get(v.vinKey)) || (v.plateKey && L.byPlate.get(v.plateKey)) || null;
  if (!vehicle) errors.push('The vehicle is not in EJO. Import the vehicles file first (a service or a booking is for a vehicle in EJO), or check the chassis number or plate.');
  const byEmail = v.customer.email ? L.cust.email.get(v.customer.email) : undefined;
  const named = (v.customer.externalId && L.cust.ext.get(v.customer.externalId.toUpperCase())) || (v.customer.phone && L.cust.phone.get(v.customer.phone.slice(-10))) || (byEmail && byEmail.sameOrg ? byEmail.id : null) || null;
  const owner = vehicle?.customerId ?? named;
  if (vehicle && named && named !== vehicle.customerId) notes.push('The customer named is not the vehicle’s owner in EJO; the service is booked for the owner.');
  if (v.branch && L.branch) {
    const plantCode = /^\d{1,4}$/.test(v.branch.trim());
    if (plantCode && !L.branch.sapPlant) notes.push(`SAP plant ${v.branch.trim()} could not be checked against ${L.branch.name}: the branch has no SAP plant code yet.`);
    else if (!(norm(v.branch) === norm(L.branch.name) || (L.branch.sapPlant ? v.branch.trim().replace(/^0+/, '') === L.branch.sapPlant.replace(/^0+/, '') : false) || norm(L.branch.name).includes(norm(v.branch)))) errors.push(`This row is for the branch “${v.branch}”, but this import loads into ${L.branch.name}. Import it into its own branch.`);
  }
  if (vehicle) {
    const open = L.openOn.get(vehicle.id);
    if (open && open !== self) errors.push(`This vehicle already has an open visit in EJO (${open}): a vehicle has one open job card or service at a time. Finish or cancel that one first, or leave this row out.`);
  }
  const person = (key: string | null, what: string) => {
    if (!key) return null;
    const hit = L.staff.get(norm(key)) ?? L.staffByName.get(norm(key)) ?? null;
    if (!hit) notes.push(`${what} “${key}” was not found by employee ID or name; left for the workshop to set.`);
    return hit;
  };
  const technician = person(v.technician, 'Technician');
  const supervisor = person(v.supervisor, 'Supervisor');
  if (technician && supervisor && technician.id === supervisor.id) notes.push('The technician and the supervisor are the same person; the supervisor is left for the workshop to set.');
  if (!job.branchId) errors.push('Choose the workshop this import loads into.');
  return { owner, vehicle, technician, supervisor: technician && supervisor && technician.id === supervisor.id ? null : supervisor, errors, notes };
}

// ── Check ─────────────────────────────────────────────────────────────

export async function checkOpenServiceRows(job: OpenServicesJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const checked = rows.map((r) => ({ r, c: checkOpenServiceRow(r.cells as unknown[], mapping) }));
  const L = await lookups(prisma, job, checked.map((x) => x.c.values).filter((v): v is OpenServiceValues => Boolean(v)));
  const out: RowUpdate[] = [];
  for (const { r, c } of checked) {
    const issues: Issue[] = [...c.issues];
    let status: string = c.status;
    let matchedId: string | null = null;
    let matchedBy: string | null = null;
    const v = c.values;
    if (v && status !== 'REJECTED') {
      const hit = L.existing.get(v.serviceNumber.toUpperCase());
      const res = resolve(v, L, job, hit?.serviceNumber ?? null);
      if (hit) { matchedId = hit.id; matchedBy = 'svc'; issues.push({ field: 'serviceNumber', level: 'warning', message: `Already brought into EJO as ${hit.serviceNumber}; left as it is.` }); status = 'WARNING'; }
      else {
        for (const e of res.errors) issues.push({ field: 'vehicle', level: 'error', message: e });
        for (const n of res.notes) issues.push({ field: 'staff', level: 'warning', message: n });
        if (res.errors.length) status = 'REJECTED';
        else if (status === 'GOOD' && issues.length) status = 'WARNING';
      }
    }
    out.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
  }
  return out;
}

/** What will load: bookings (and over which days) and services already in the workshop. */
export async function openServiceTotalsOfRows(jobId: string, mapping: Mapping, statuses: string[]): Promise<{ lines: number; quantity: number; value: number; bookings: number; inWorkshop: number; from: string | null; to: string | null }> {
  let after = 0; let lines = 0; let bookings = 0; let inWorkshop = 0; let first: string | null = null; let last: string | null = null;
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, matchedBy: null, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const v = checkOpenServiceRow(r.cells as unknown[], mapping).values;
      if (!v) continue;
      lines += 1;
      if (v.bookedFor) {
        bookings += 1;
        if (!first || v.bookedFor.day < first) first = v.bookedFor.day;
        if (!last || v.bookedFor.day > last) last = v.bookedFor.day;
      } else inWorkshop += 1;
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: 0, value: 0, bookings, inWorkshop, from: first, to: last };
}

export async function openServiceTotalsLoaded(jobId: string): Promise<{ lines: number; quantity: number; value: number }> {
  return { lines: await prisma.vehicleService.count({ where: { importJobId: jobId } }), quantity: 0, value: 0 };
}

// ── Load ──────────────────────────────────────────────────────────────

/** The next SV numbers, counting from the highest in use or binned this year (the same rule as the desk). */
async function nextServiceNumbers(tx: Tx, count: number): Promise<string[]> {
  const prefix = `SV-${lagosYear()}-`;
  const [latest, binned] = await Promise.all([
    tx.vehicleService.findFirst({ where: { serviceNumber: { startsWith: prefix } }, orderBy: { serviceNumber: 'desc' }, select: { serviceNumber: true } }),
    tx.recycleBinItem.findFirst({ where: { entityType: 'VehicleService', reference: { startsWith: prefix } }, orderBy: { reference: 'desc' }, select: { reference: true } }),
  ]);
  const from = highestSequence(prefix, [latest?.serviceNumber, binned?.reference]);
  return Array.from({ length: count }, (_, i) => `${prefix}${String(from + 1 + i).padStart(6, '0')}`);
}

export async function loadOpenServiceRows(tx: Tx, job: OpenServicesJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkOpenServiceRow(r.cells as unknown[], mapping) }));
  // Matched again now: a vehicle, a customer or a colleague may have been added since the check; a visit may have been opened on the vehicle.
  const L = await lookups(tx, job, checked.map((x) => x.c.values).filter((v): v is OpenServiceValues => Boolean(v)));
  const results: Result[] = [];
  const todo: { r: LoadRow; v: OpenServiceValues; res: Resolved }[] = [];
  const seenVehicles = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const hit = L.existing.get(v.serviceNumber.toUpperCase());
    if (hit) { results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: `Already brought into EJO as ${hit.serviceNumber}; left as it is.` }); continue; }
    const res = resolve(v, L, job, null);
    if (res.errors.length || !res.vehicle || !res.owner) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: res.errors[0] ?? 'The vehicle or customer is no longer in the system; not loaded.' }); continue; }
    if (seenVehicles.has(res.vehicle.id)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Another row of this file already opened a visit for this vehicle; a vehicle has one open visit at a time.' }); continue; }
    seenVehicles.add(res.vehicle.id);
    todo.push({ r, v, res });
  }
  const numbers = await nextServiceNumbers(tx, todo.length);
  const range = src(job.sourceSystem);
  const actor = job.approvedById ?? job.createdById;
  const now = new Date();
  for (const [i, { r, v, res }] of todo.entries()) {
    const vehicle = res.vehicle!;
    const inWorkshop = v.stage !== 'SCHEDULED';
    const cameIn = v.checkedInOn ? dayDate(v.checkedInOn) : null;
    const departmentId = L.departments.get(vehicle.vehicleType === 'PASSENGER' ? 'workshop-passenger' : 'workshop-commercial') ?? L.departments.get('workshop-commercial') ?? null;
    const where = `${range === 'LEGACY' ? 'the old system' : 'SAP'} (${v.stage === 'SCHEDULED' ? 'booking' : 'service'} ${v.serviceNumber})`;
    const id = newId();
    await tx.vehicleService.create({
      data: {
        id, serviceNumber: numbers[i]!, branchId: job.branchId!, departmentId, customerId: res.owner!, vehicleId: vehicle.id, status: v.stage,
        bookedFor: v.bookedFor ? bookedAt(v.bookedFor) : null, odometerAtService: v.mileage,
        assignedTechnicianId: res.technician?.id ?? null, technicianAcceptanceStatus: res.technician ? 'ACCEPTED' : null, technicianRespondedAt: res.technician ? cameIn : null,
        supervisorId: res.supervisor?.id ?? null, createdById: actor,
        // In the workshop: accepted before EJO (EJO's approval is not asked again). A booking waits for the workshop's own.
        approvalStatus: inWorkshop ? 'APPROVED' : 'PENDING', approvedAt: inWorkshop ? cameIn : null,
        approvalNotes: [`${inWorkshop ? 'Accepted before EJO' : 'Booked before EJO'}: brought in from ${where} by import ${job.number}.`, v.notes].filter(Boolean).join('\n'),
        checkedInAt: cameIn, workStartedAt: ['IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION'].includes(v.stage) ? cameIn : null,
        completedAt: ['COMPLETED', 'READY_FOR_COLLECTION'].includes(v.stage) ? cameIn : null, readyForCollectionAt: v.stage === 'READY_FOR_COLLECTION' ? cameIn : null,
        externalSource: range, externalId: v.serviceNumber, importJobId: job.id, createdAt: cameIn ?? now,
        complaints: { create: v.complaints.map((description, k) => ({ sequenceNumber: k + 1, description })) },
      },
    });
    results.push({ id: r.id, status: 'CREATED', resultId: id, note: res.notes.length ? res.notes.join(' ') : undefined });
  }
  await writeLoadResults(tx, rows, results);
}

// ── Undo: to the Recycle bin, only what nobody has touched since ──────

/** An imported service nobody has worked on since the import: nothing recorded on it, and no step in its history
 * since (a service has no updatedAt: every step it takes — check-in, a technician, a status — is audited). */
export async function serviceUntouchedSinceImport(db: Db, id: string, jobId: string, loadedAt: Date): Promise<boolean> {
  const s = await db.vehicleService.findFirst({
    where: { id, importJobId: jobId },
    select: {
      escalatedToJobCardId: true,
      _count: { select: { partRequestSlips: true, payments: true, refunds: true, closeRequests: true, cancellationRequests: true, warranties: true, warrantyClaims: true, roadTestPermits: true } },
      inspection: { select: { id: true } }, serviceEstimate: { select: { id: true } }, gateExit: { select: { id: true } },
    },
  });
  if (!s) return false;
  const c = s._count;
  if (c.partRequestSlips || c.payments || c.refunds || c.closeRequests || c.cancellationRequests || c.warranties || c.warrantyClaims || c.roadTestPermits) return false;
  if (s.escalatedToJobCardId || s.inspection || s.serviceEstimate || s.gateExit) return false;
  const since = await db.auditLog.count({ where: { entityType: 'VehicleService', entityId: id, createdAt: { gt: new Date(loadedAt.getTime() + 60_000) } } });
  return since === 0;
}
