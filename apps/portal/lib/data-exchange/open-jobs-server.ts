/**
 * Data Exchange — the open job cards at the cut-over (P5). Server only
 * (never a 'use server' file): lib/actions/data-exchange.ts checks who is
 * asking, locks the import and calls these inside its transactions.
 *
 * Each row becomes a live EJO job card in the chosen workshop, at the stage
 * the file says, on a customer and a vehicle already in EJO:
 *   • its old number is kept (externalId) and searchable; EJO gives it its
 *     own JC number; its opening date is the day it came in;
 *   • the estimate (labour, parts, the parts already issued) is recorded as
 *     approved before EJO — EJO's own approval flow is not replayed;
 *   • a deposit taken before EJO becomes an opening payment, which Finance
 *     confirms after the load (the import's totals);
 *   • the technician and supervisor are matched by employee ID (a name is
 *     tried too); nobody found leaves them unset for the workshop;
 *   • nothing is emailed: the customer and the staff were told at the time.
 * One open job card per vehicle, as on the desk. Undo moves the job cards
 * that have not been worked on since to the Recycle bin (with their
 * estimate and payments), and keeps — and reports — the ones that have.
 */
import { prisma, type Prisma } from '@ejo/database';
import { checkOpenJobRow, type OpenJobValues } from './check-open-jobs';
import type { Issue } from './check';
import type { Mapping } from './fields';
import { findCustomers } from './lookup-server';
import { STAFF_AWAITING_INVITATION } from './check-staff';
import { newId, writeLoadResults, type LoadRow, type Result, type RowUpdate } from './rows-server';
import { highestSequence } from '../recycle-bin/numbers';
import { lagosYear } from '../utils/format-date';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
export type OpenJobsJob = { id: string; number: string; organisationId: string; branchId: string | null; sourceSystem: string; createdById: string; approvedById: string | null };

const src = (s: string) => (s === 'LEGACY' ? 'LEGACY' : 'SAP');
const dayDate = (d: string) => new Date(`${d}T09:00:00.000+01:00`);
export const BEFORE_EJO = 'before EJO';

type Lookups = {
  cust: Awaited<ReturnType<typeof findCustomers>>;
  byVin: Map<string, { id: string; customerId: string; vehicleType: string | null }>;
  byPlate: Map<string, { id: string; customerId: string; vehicleType: string | null }>;
  existing: Map<string, { id: string; jobNumber: string }>;
  openOn: Map<string, string>;
  staff: Map<string, { id: string; fullName: string }>;
  staffByName: Map<string, { id: string; fullName: string }>;
  parts: Map<string, { id: string; name: string }>;
  departments: Map<string, string>;
  branch: { name: string; sapPlant: string | null } | null;
};

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');

async function lookups(db: Db, job: OpenJobsJob, checked: { c: ReturnType<typeof checkOpenJobRow> }[]): Promise<Lookups> {
  const vals = checked.map((x) => x.c.values).filter((v): v is OpenJobValues => Boolean(v));
  const vins = [...new Set(vals.map((v) => v.vinKey).filter((v): v is string => Boolean(v)))];
  const plates = [...new Set(vals.map((v) => v.plateKey).filter((v): v is string => Boolean(v)))];
  const staffKeys = [...new Set(vals.flatMap((v) => [v.technician, v.supervisor]).filter((v): v is string => Boolean(v)))];
  const partNumbers = [...new Set(vals.flatMap((v) => v.partsIssued.map((p) => p.partNumber)).filter((v): v is string => Boolean(v)))];
  const [cust, vehicles, plateRows, existing, staff, parts, departments, branch] = await Promise.all([
    findCustomers(db, job.organisationId, src(job.sourceSystem), {
      ext: vals.map((v) => v.customer.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)),
      email: vals.map((v) => v.customer.email).filter((v): v is string => Boolean(v)),
      phone: vals.map((v) => v.customer.phone).filter((v): v is string => Boolean(v)),
    }),
    vins.length ? db.customerVehicle.findMany({ where: { chassisNumber: { in: vins }, customer: { organisationId: job.organisationId } }, select: { id: true, chassisNumber: true, customerId: true, vehicleType: true } }) : [],
    plates.length ? db.$queryRaw<{ id: string; customerId: string; vehicleType: string | null; k: string }[]>`
      SELECT v.id, v."customerId", v."vehicleType"::text AS "vehicleType", upper(regexp_replace(coalesce(v."plateNumber", ''), '[\\s-]', '', 'g')) AS k FROM customer_vehicles v JOIN customers c ON c.id = v."customerId"
       WHERE c."organisationId" = ${job.organisationId} AND upper(regexp_replace(coalesce(v."plateNumber", ''), '[\\s-]', '', 'g')) = ANY(${plates}::text[])` : [],
    job.branchId ? db.jobCard.findMany({ where: { branchId: job.branchId, externalSource: src(job.sourceSystem), externalId: { in: vals.map((v) => v.jobNumber) } }, select: { id: true, externalId: true, jobNumber: true } }) : [],
    staffKeys.length ? db.user.findMany({ where: { organisationId: job.organisationId, AND: [{ OR: [{ isActive: true }, STAFF_AWAITING_INVITATION] }, { OR: [{ employeeId: { in: staffKeys } }, { fullName: { in: staffKeys, mode: 'insensitive' } }] }] }, select: { id: true, employeeId: true, fullName: true } }) : [],
    partNumbers.length && job.branchId ? db.part.findMany({ where: { branchId: job.branchId, partNumber: { in: partNumbers, mode: 'insensitive' } }, select: { id: true, partNumber: true, name: true } }) : [],
    job.branchId ? db.department.findMany({ where: { branchId: job.branchId, slug: { in: ['workshop-passenger', 'workshop-commercial'] } }, select: { id: true, slug: true } }) : [],
    job.branchId ? db.branch.findUnique({ where: { id: job.branchId }, select: { name: true, sapPlant: true } }) : null,
  ]);
  const byVin = new Map(vehicles.map((v) => [String(v.chassisNumber).toUpperCase(), { id: v.id, customerId: v.customerId, vehicleType: v.vehicleType }]));
  const byPlate = new Map(plateRows.map((v) => [v.k, { id: v.id, customerId: v.customerId, vehicleType: v.vehicleType }]));
  const vehicleIds = [...new Set([...byVin.values(), ...byPlate.values()].map((v) => v.id))];
  const open = vehicleIds.length ? await db.jobCard.findMany({ where: { vehicleId: { in: vehicleIds }, status: { notIn: ['CANCELLED', 'CLOSED', 'CHECKED_OUT'] } }, select: { vehicleId: true, jobNumber: true } }) : [];
  return {
    cust, byVin, byPlate,
    existing: new Map(existing.map((j) => [String(j.externalId).toUpperCase(), { id: j.id, jobNumber: j.jobNumber }])),
    openOn: new Map(open.map((j) => [j.vehicleId, j.jobNumber])),
    staff: new Map(staff.filter((u) => u.employeeId).map((u) => [norm(u.employeeId!), { id: u.id, fullName: u.fullName }])),
    staffByName: new Map(staff.map((u) => [norm(u.fullName), { id: u.id, fullName: u.fullName }])),
    parts: new Map(parts.map((p) => [String(p.partNumber ?? '').toUpperCase(), { id: p.id, name: p.name }])),
    departments: new Map(departments.map((d) => [d.slug, d.id])),
    branch,
  };
}

type Resolved = {
  owner: string | null; vehicle: { id: string; customerId: string; vehicleType: string | null } | null; technician: { id: string; fullName: string } | null; supervisor: { id: string; fullName: string } | null;
  errors: string[]; notes: string[];
};

function resolve(v: OpenJobValues, L: Lookups, job: OpenJobsJob, self: string | null): Resolved {
  const errors: string[] = [];
  const notes: string[] = [];
  const vehicle = (v.vinKey && L.byVin.get(v.vinKey)) || (v.plateKey && L.byPlate.get(v.plateKey)) || null;
  if (!vehicle) errors.push('The vehicle is not in EJO. Import the vehicles file first (the open job card needs the vehicle it is on), or check the chassis number or plate.');
  const byEmail = v.customer.email ? L.cust.email.get(v.customer.email) : undefined;
  const named = (v.customer.externalId && L.cust.ext.get(v.customer.externalId.toUpperCase())) || (v.customer.phone && L.cust.phone.get(v.customer.phone.slice(-10))) || (byEmail && byEmail.sameOrg ? byEmail.id : null) || null;
  const owner = vehicle?.customerId ?? named;
  if (vehicle && named && named !== vehicle.customerId) notes.push('The customer named is not the vehicle’s owner in EJO; the job card is opened for the owner.');
  if (v.branch && L.branch) {
    const plantCode = /^\d{1,4}$/.test(v.branch.trim());
    if (plantCode && !L.branch.sapPlant) notes.push(`SAP plant ${v.branch.trim()} could not be checked against ${L.branch.name}: the branch has no SAP plant code yet.`);
    else if (!(norm(v.branch) === norm(L.branch.name) || (L.branch.sapPlant ? v.branch.trim().replace(/^0+/, '') === L.branch.sapPlant.replace(/^0+/, '') : false) || norm(L.branch.name).includes(norm(v.branch)))) errors.push(`This row is for the branch “${v.branch}”, but this import loads into ${L.branch.name}. Import it into its own branch.`);
  }
  if (vehicle) {
    const open = L.openOn.get(vehicle.id);
    if (open && open !== self) errors.push(`This vehicle already has an open job card in EJO (${open}): a vehicle has one open job card at a time. Close or cancel that one first, or leave this row out.`);
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
  for (const p of v.partsIssued) if (p.partNumber && !L.parts.has(p.partNumber)) notes.push(`Part ${p.partNumber} is not in this branch’s catalogue; kept on the estimate by its number, unmatched.`);
  if (!job.branchId) errors.push('Choose the workshop this import loads into.');
  return { owner, vehicle, technician, supervisor: technician && supervisor && technician.id === supervisor.id ? null : supervisor, errors, notes };
}

// ── Check ─────────────────────────────────────────────────────────────

export async function checkOpenJobRows(job: OpenJobsJob, mapping: Mapping, rows: { id: string; cells: Prisma.JsonValue }[]): Promise<RowUpdate[]> {
  const checked = rows.map((r) => ({ r, c: checkOpenJobRow(r.cells as unknown[], mapping) }));
  const L = await lookups(prisma, job, checked);
  const out: RowUpdate[] = [];
  for (const { r, c } of checked) {
    const issues: Issue[] = [...c.issues];
    let status: string = c.status;
    let matchedId: string | null = null;
    let matchedBy: string | null = null;
    const v = c.values;
    if (v && status !== 'REJECTED') {
      const hit = L.existing.get(v.jobNumber.toUpperCase());
      const res = resolve(v, L, job, hit?.jobNumber ?? null);
      for (const e of res.errors) issues.push({ field: 'vehicle', level: 'error', message: e });
      for (const n of res.notes) issues.push({ field: 'staff', level: 'warning', message: n });
      if (res.errors.length) status = 'REJECTED';
      else {
        if (hit) { matchedId = hit.id; matchedBy = 'job'; issues.push({ field: 'jobNumber', level: 'warning', message: `Already brought into EJO as ${hit.jobNumber}; left as it is.` }); }
        if (status === 'GOOD' && issues.length) status = 'WARNING';
      }
    }
    out.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
  }
  return out;
}

/** What will load: job cards, the estimates' total and the opening payments (Finance confirms the payments after the load). */
export async function openJobTotalsOfRows(jobId: string, mapping: Mapping, statuses: string[]): Promise<{ lines: number; quantity: number; value: number; estimates: number; from: string | null; to: string | null }> {
  let after = 0; let lines = 0; let value = 0; let estimates = 0; let from: string | null = null; let to: string | null = null;
  for (;;) {
    const rows = await prisma.importRow.findMany({ where: { jobId, status: { in: statuses }, matchedBy: null, rowNumber: { gt: after } }, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, cells: true } });
    for (const r of rows) {
      const v = checkOpenJobRow(r.cells as unknown[], mapping).values;
      if (!v) continue;
      lines += 1; value += v.paidAmount ?? 0; estimates += v.estimateTotal ?? 0;
      if (!from || v.openedAt < from) from = v.openedAt;
      if (!to || v.openedAt > to) to = v.openedAt;
    }
    if (rows.length < 5000) break;
    after = rows[rows.length - 1]!.rowNumber;
  }
  return { lines, quantity: 0, value: Math.round(value * 100) / 100, estimates: Math.round(estimates * 100) / 100, from, to };
}

/** What an import of open job cards holds now: its job cards and the opening payments on them. */
export async function openJobTotalsLoaded(jobId: string): Promise<{ lines: number; quantity: number; value: number }> {
  const [n, agg] = await Promise.all([
    prisma.jobCard.count({ where: { importJobId: jobId } }),
    prisma.payment.aggregate({ where: { jobCard: { importJobId: jobId }, idempotencyKey: { startsWith: `import:${jobId}:` } }, _sum: { amount: true } }),
  ]);
  return { lines: n, quantity: 0, value: Math.round(Number(agg._sum.amount ?? 0) * 100) / 100 };
}

// ── Load ──────────────────────────────────────────────────────────────

/** The next JC numbers, counting from the highest in use or binned this year (the same rule as the desk). */
async function nextJobNumbers(tx: Tx, count: number): Promise<string[]> {
  const prefix = `JC-${lagosYear()}-`;
  const [latest, binned] = await Promise.all([
    tx.jobCard.findFirst({ where: { jobNumber: { startsWith: prefix } }, orderBy: { jobNumber: 'desc' }, select: { jobNumber: true } }),
    tx.recycleBinItem.findFirst({ where: { entityType: 'JobCard', reference: { startsWith: prefix } }, orderBy: { reference: 'desc' }, select: { reference: true } }),
  ]);
  const from = highestSequence(prefix, [latest?.jobNumber, binned?.reference]);
  return Array.from({ length: count }, (_, i) => `${prefix}${String(from + 1 + i).padStart(6, '0')}`);
}

export async function loadOpenJobRows(tx: Tx, job: OpenJobsJob, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkOpenJobRow(r.cells as unknown[], mapping) }));
  // Matched again now: a vehicle, a customer or a staff member may have been added since the check; a job card may have been opened on the vehicle.
  const L = await lookups(tx, job, checked);
  const results: Result[] = [];
  const todo: { r: LoadRow; v: OpenJobValues; res: Resolved }[] = [];
  const seenVehicles = new Set<string>();
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const hit = L.existing.get(v.jobNumber.toUpperCase());
    if (hit) { results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: `Already brought into EJO as ${hit.jobNumber}; left as it is.` }); continue; }
    const res = resolve(v, L, job, null);
    if (res.errors.length || !res.vehicle || !res.owner) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: res.errors[0] ?? 'The vehicle or customer is no longer in the system; not loaded.' }); continue; }
    if (seenVehicles.has(res.vehicle.id)) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Another row of this file already opened a job card on this vehicle; a vehicle has one open job card at a time.' }); continue; }
    seenVehicles.add(res.vehicle.id);
    todo.push({ r, v, res });
  }
  const numbers = await nextJobNumbers(tx, todo.length);
  const range = src(job.sourceSystem);
  const actor = job.approvedById ?? job.createdById;
  for (const [i, { r, v, res }] of todo.entries()) {
    const vehicle = res.vehicle!;
    const openedAt = dayDate(v.openedAt);
    const departmentId = L.departments.get(vehicle.vehicleType === 'PASSENGER' ? 'workshop-passenger' : 'workshop-commercial') ?? L.departments.get('workshop-commercial') ?? null;
    const id = newId();
    const approved = v.estimateApproved && v.estimateTotal !== null;
    const noteLines = [`Brought into EJO from ${range === 'LEGACY' ? 'the old system' : 'SAP'} (job card ${v.jobNumber}) by import ${job.number}.`, ...(v.notes ? [v.notes] : [])];
    await tx.jobCard.create({
      data: {
        id, jobNumber: numbers[i]!, branchId: job.branchId!, departmentId, customerId: res.owner!, vehicleId: vehicle.id,
        mileageAtCheckIn: v.mileage, diagnosis: v.diagnosis, notes: noteLines.join('\n'),
        assignedTechnicianId: res.technician?.id ?? null, technicianAcceptanceStatus: res.technician ? 'ACCEPTED' : null, technicianRespondedAt: res.technician ? openedAt : null,
        supervisorId: res.supervisor?.id ?? null, createdById: actor, status: v.stage,
        approvalStatus: approved ? 'APPROVED' : 'PENDING', approvedAt: approved ? openedAt : null, approvalNotes: approved ? `Estimate approved ${BEFORE_EJO} (${range === 'LEGACY' ? 'old system' : 'SAP'} job card ${v.jobNumber}).` : null,
        workStartedAt: ['IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION'].includes(v.stage) ? openedAt : null,
        completedAt: ['COMPLETED', 'READY_FOR_COLLECTION'].includes(v.stage) ? openedAt : null,
        readyForCollectionAt: v.stage === 'READY_FOR_COLLECTION' ? openedAt : null,
        externalSource: range, externalId: v.jobNumber, importJobId: job.id, createdAt: openedAt,
        complaints: { create: v.complaints.map((description, k) => ({ sequenceNumber: k + 1, description })) },
      },
    });
    // The estimate, as it stood: labour, the parts already issued (by number when the catalogue has them), the rest of the parts as one line.
    if (v.estimateTotal !== null || v.partsIssued.length) {
      const lines: Prisma.EstimateLineItemCreateManyEstimateInput[] = [];
      if (v.labourAmount !== null) lines.push({ type: 'LABOUR', description: `Labour (approved ${BEFORE_EJO})`, quantity: 1, unitPrice: v.labourAmount, amount: v.labourAmount, enteredById: actor, createdAt: openedAt });
      let itemised = 0;
      for (const p of v.partsIssued) {
        const part = p.partNumber ? L.parts.get(p.partNumber) : undefined;
        lines.push({ type: 'STORE_PART', description: `${part ? `${part.name} (${p.partNumber})` : p.text} — issued ${BEFORE_EJO}`, quantity: Math.max(1, Math.round(p.quantity)), unitPrice: p.unitPrice, amount: p.amount, matchedPartId: part?.id ?? null, billToNote: `Issued from the store ${BEFORE_EJO}; stock not moved in EJO.`, enteredById: actor, createdAt: openedAt });
        itemised += p.amount ?? 0;
      }
      const rest = v.partsAmount !== null ? Math.round((v.partsAmount - itemised) * 100) / 100 : 0;
      if (rest > 0.005) lines.push({ type: 'STORE_PART', description: `Other parts (approved ${BEFORE_EJO})`, quantity: 1, unitPrice: rest, amount: rest, enteredById: actor, createdAt: openedAt });
      if (v.estimateTotal !== null) {
        const sum = lines.reduce((s, l) => s + Number(l.amount ?? 0), 0);
        const gap = Math.round((v.estimateTotal - sum) * 100) / 100;
        if (Math.abs(gap) > 0.005 && v.labourAmount === null && v.partsAmount === null) lines.push({ type: 'LABOUR', description: `Work as estimated (approved ${BEFORE_EJO})`, quantity: 1, unitPrice: gap, amount: gap, enteredById: actor, createdAt: openedAt });
      }
      await tx.estimate.create({
        data: {
          jobCardId: id, status: approved ? 'APPROVED' : 'SUBMITTED', submittedAt: openedAt, approvedAt: approved ? openedAt : null, createdById: actor, createdAt: openedAt,
          ...(approved && v.stage !== 'AWAITING_CUSTOMER_APPROVAL' ? { customerNotifiedAt: openedAt } : {}),
          lineItems: { createMany: { data: lines } },
        },
      });
    }
    // A deposit taken before EJO: an opening payment, keyed so a retried batch never records it twice; Finance confirms the total.
    if (v.paidAmount !== null && v.paidAmount > 0) {
      await tx.payment.create({
        data: {
          jobCardId: id, amount: v.paidAmount, method: v.paymentMethod, recordedById: actor, recordedAt: v.paidOn ? dayDate(v.paidOn) : openedAt, createdAt: openedAt,
          notes: `Paid ${BEFORE_EJO}${v.paymentReference ? ` (receipt ${v.paymentReference})` : ''}; brought in by import ${job.number}.`, idempotencyKey: `import:${job.id}:${r.id}`,
        },
      });
    }
    results.push({ id: r.id, status: 'CREATED', resultId: id, note: res.notes.length ? res.notes.join(' ') : undefined });
  }
  await writeLoadResults(tx, rows, results);
}

// ── Undo: to the Recycle bin, only what nobody has touched since ──────

/** An imported job card nobody has worked on since the import: nothing new on it, and still as the import left it. */
export async function untouchedSinceImport(db: Db, id: string, jobId: string, loadedAt: Date): Promise<boolean> {
  const j = await db.jobCard.findUnique({
    where: { id, importJobId: jobId },
    select: {
      updatedAt: true, status: true,
      _count: { select: { partRequestSlips: true, externalProcurementRequests: true, warranties: true, warrantyClaims: true, roadTestPermits: true, closeRequests: true, cancellationRequests: true, refunds: true } },
      payments: { select: { idempotencyKey: true } },
      estimate: { select: { updatedAt: true, lineItems: { select: { createdAt: true } } } },
      gateExit: { select: { id: true } },
    },
  });
  if (!j) return false;
  const c = j._count;
  if (c.partRequestSlips || c.externalProcurementRequests || c.warranties || c.warrantyClaims || c.roadTestPermits || c.closeRequests || c.cancellationRequests || c.refunds || j.gateExit) return false;
  if (j.payments.some((p) => !p.idempotencyKey?.startsWith(`import:${jobId}:`))) return false;
  if (j.updatedAt.getTime() > loadedAt.getTime()) return false;
  if (j.estimate && (j.estimate.updatedAt.getTime() > loadedAt.getTime() || j.estimate.lineItems.some((l) => l.createdAt.getTime() > loadedAt.getTime()))) return false;
  // The load writes no history on it: any audited step (assigned, approved, a status) is work — however soon after.
  return (await db.auditLog.count({ where: { entityType: 'JobCard', entityId: id } })) === 0;
}
