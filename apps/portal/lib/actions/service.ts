'use server';
import { after } from 'next/server';
import { prisma, type FinishedUnitStatus } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, allows, getPrincipal, orgWhere, reachWhere, seeOrNull, branchOwnedByMyOrganisation, partsOfMyOrganisation, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { claimed as stillAsSeen } from '@/lib/integrity';
import { nextDocumentNumber } from '@/lib/zinox/numbering';
import { userNames, nameOf } from '@/lib/zinox/people';
import { actorLabel } from '@/lib/assist/rules';
import { sendEmail } from '@/lib/email';
import { logFailure } from '@/lib/log';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { getWorkshopOrgContext } from '@/lib/workshop-core';
import { renderServiceJobOpenedEmail } from '@/lib/email-templates/service-job-opened';
import { renderServiceUnitReadyEmail } from '@/lib/email-templates/service-unit-ready';
import { emailColleaguesLater } from '@/lib/workflow-notify';
import {
  warrantyCoverageOn, serviceJobKindFor, canMoveServiceJob, canReturnUnit, canQaServiceJob, allowedCostCentres, ledgerTotals, lagosMonthStart, lagosYearStart,
  paidJobBalance, COST_CENTRES, SERVICE_JOB_STATUS_LABEL, SERVICE_OPEN_STATUSES, TECHNICIAN_WORK_STATUSES, COVERAGE_EXPIRING_SOON_DAYS,
  type Coverage, type ServiceJobStatus, type ServiceJobKind, type WarrantyCostCentre,
} from '@/lib/service-core';

class ServiceActionError extends Error {}

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The Service Centre branch this person works in: their own branch, else the first branch of their organisation. */
async function serviceBranchId(): Promise<string> {
  const p = await getPrincipal();
  if (p.branchId) return p.branchId;
  const ids = p.orgBranchIds;
  if (ids && ids.length) {
    const b = await prisma.branch.findFirst({ where: { id: { in: ids } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (b) return b.id;
  }
  const first = await prisma.branch.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!first) throw new ServiceActionError('No branch exists yet — create one under Branches first.');
  return first.id;
}

async function audit(userId: string, jobId: string, verb: string, metadata: Record<string, unknown>) {
  await writeAuditLog({ userId, action: `service_job.${verb}`, entityType: 'ServiceJob', entityId: jobId, metadata });
}

/** Runs after the response (a slow mail server never delays the person who acted). */
function later(run: () => Promise<void>): void {
  const safe = () => run().catch((err) => logFailure('Service Centre email failed', err));
  try { after(safe); } catch { void safe(); }
}

async function customerSite(): Promise<{ companyName: string; branchName: string; logoUrl: string; dashboardUrl: string }> {
  const ctx = await getWorkshopOrgContext('Service Centre').catch(() => ({ companyName: 'Zinox Technologies', branchName: 'Service Centre' }));
  return { companyName: ctx.companyName, branchName: ctx.branchName, logoUrl: `${portalBaseUrl()}/images/logo/email-logo.png`, dashboardUrl: `${websiteBaseUrl()}/customer-portal/dashboard/claims` };
}

// ── Serial lookup ────────────────────────────────────────────────────────

export type UnitLookup = {
  found: boolean;
  serialNumber: string;
  unit: { id: string; serialNumber: string; status: string; productName: string; configuration: string | null; soldAt: Date | null; customerId: string | null; customerName: string | null; customerEmail: string | null; locationName: string; branchId: string } | null;
  coverage: Coverage;
  kind: ServiceJobKind;
  openJob: { id: string; number: string; status: string } | null;
};

/** A finished unit by serial, within this person's organisation (held at one of its branches or sold to one of its customers), with its warranty cover today. */
export async function lookupUnitBySerial(serialNumber: string): Promise<UnitLookup> {
  await authorize('service.view', undefined, 'lookupUnitBySerial');
  const serial = serialNumber.trim();
  const empty: UnitLookup = { found: false, serialNumber: serial, unit: null, coverage: warrantyCoverageOn([]), kind: 'PAID', openJob: null };
  if (!serial) return empty;
  const unit = await prisma.finishedUnit.findFirst({
    where: { serialNumber: { equals: serial, mode: 'insensitive' }, OR: [{ location: await branchOwnedByMyOrganisation() }, { customer: await orgWhere() }] },
    select: {
      id: true, serialNumber: true, status: true, soldAt: true, customerId: true,
      product: { select: { name: true } }, configuration: { select: { name: true } }, customer: { select: { fullName: true, email: true } }, location: { select: { name: true, branchId: true } },
      warranties: { select: { id: true, kind: true, status: true, startsAt: true, endsAt: true, warrantyNumber: true } },
      serviceJobs: { where: { status: { in: SERVICE_OPEN_STATUSES } }, select: { id: true, number: true, status: true }, take: 1 },
    },
  });
  if (!unit) return empty;
  const coverage = warrantyCoverageOn(unit.warranties);
  return {
    found: true, serialNumber: unit.serialNumber, coverage, kind: serviceJobKindFor(coverage),
    unit: { id: unit.id, serialNumber: unit.serialNumber, status: unit.status, productName: unit.product.name, configuration: unit.configuration?.name ?? null, soldAt: unit.soldAt, customerId: unit.customerId, customerName: unit.customer?.fullName ?? null, customerEmail: unit.customer?.email ?? null, locationName: unit.location.name, branchId: unit.location.branchId },
    openJob: unit.serviceJobs[0] ?? null,
  };
}

// ── Option searches (SearchableSelect) ───────────────────────────────────

export async function searchServiceTechnicianOptions(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await authorize('service.view', undefined, 'searchServiceTechnicianOptions');
  const q = query.trim();
  const rows = await prisma.user.findMany({
    where: { ...(await orgWhere()), isActive: true, roles: { some: { role: { slug: 'service-technician' } } }, ...(q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { employeeId: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { fullName: 'asc' },
    take: 25,
    select: { id: true, fullName: true, employeeId: true, branch: { select: { name: true } } },
  });
  return rows.map((u) => ({ value: u.id, label: u.fullName, sublabel: [u.employeeId, u.branch?.name].filter(Boolean).join(' · ') || undefined }));
}
export async function loadServiceTechnicianOptions() {
  return searchServiceTechnicianOptions('');
}

export async function searchServiceCustomerOptions(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await authorize('service.view', undefined, 'searchServiceCustomerOptions');
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.customer.findMany({
    where: { ...(await orgWhere()), isActive: true, OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q, mode: 'insensitive' } }] },
    orderBy: { fullName: 'asc' },
    take: 20,
    select: { id: true, fullName: true, email: true, phone: true },
  });
  return rows.map((c) => ({ value: c.id, label: c.fullName, sublabel: [c.phone, c.email].filter(Boolean).join(' · ') || undefined }));
}

export async function searchServicePartOptions(query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  await authorize('service.view', undefined, 'searchServicePartOptions');
  const q = query.trim();
  if (!q) return [];
  const rows = await prisma.part.findMany({
    where: { ...(await partsOfMyOrganisation()), isActive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, { partNumber: { contains: q, mode: 'insensitive' } }] },
    orderBy: { name: 'asc' },
    take: 20,
    select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true, stock: { select: { quantityOnHand: true } } },
  });
  return rows.map((p) => ({ value: p.id, label: p.name, sublabel: [p.partNumber, p.stock ? `${Number(p.stock.quantityOnHand)} ${p.baseUnitOfMeasure} on hand` : null].filter(Boolean).join(' · ') || undefined }));
}

// ── Open a job ───────────────────────────────────────────────────────────

export type OpenServiceJobInput = {
  serialNumber: string;
  fault: string;
  /** For a serial not in the system. */
  productName?: string;
  customerId?: string;
  /** Override the computed kind (goodwill, or paid despite cover). */
  kind?: ServiceJobKind;
  warrantyClaimId?: string;
};

export async function openServiceJob(input: OpenServiceJobInput): Promise<{ id: string; number: string }> {
  const user = await requireUser();
  const branchId = await serviceBranchId();
  await authorize('service.manage', { branchId, homeBranch: true }, 'openServiceJob', 'Only the Service Centre supervisor can open a service job.');
  const serial = input.serialNumber.trim();
  const fault = input.fault.trim();
  if (!serial) throw new ServiceActionError('Enter the unit\'s serial number.');
  if (!fault) throw new ServiceActionError('Describe the fault the customer reported.');
  const look = await lookupUnitBySerial(serial);
  if (look.openJob) throw new ServiceActionError(`${look.openJob.number} is already open for this serial.`);
  const productName = look.unit?.productName ?? input.productName?.trim() ?? '';
  if (!productName) throw new ServiceActionError('This serial is not in the system — type the product name so the job can be opened.');
  let customerId = look.unit?.customerId ?? input.customerId ?? null;
  if (customerId) {
    const c = await prisma.customer.findFirst({ where: { ...(await orgWhere()), id: customerId }, select: { id: true } });
    if (!c) throw new ServiceActionError('Choose a customer of your organisation.');
    customerId = c.id;
  }
  const kind: ServiceJobKind = input.kind && ['WARRANTY', 'PAID', 'GOODWILL'].includes(input.kind) ? input.kind : look.kind;
  if (kind === 'WARRANTY' && !look.coverage.covered) throw new ServiceActionError('This serial has no active product warranty today — open a paid or goodwill job instead.');
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new ServiceActionError('Your account is not placed in an organisation yet.');
  const number = await nextDocumentNumber('SVC', organisationId);
  const job = await prisma.serviceJob.create({
    data: {
      number, branchId, serialNumber: look.unit?.serialNumber ?? serial, productName, fault, kind, status: 'OPEN',
      finishedUnitId: look.unit?.id ?? null, customerId, warrantyClaimId: input.warrantyClaimId ?? null, openedById: user.id, supervisorId: user.id,
    },
  });
  // The unit is now at the Service Centre (compare-and-set from the status the supervisor saw).
  if (look.unit && look.unit.status !== 'IN_SERVICE') {
    stillAsSeen(await prisma.finishedUnit.updateMany({ where: { id: look.unit.id, status: look.unit.status as FinishedUnitStatus }, data: { status: 'IN_SERVICE' } }));
    await writeAuditLog({ userId: user.id, action: 'finished_unit.sent_to_service', entityType: 'FinishedUnit', entityId: look.unit.id, metadata: { serialNumber: look.unit.serialNumber, referenceNumber: number, from: look.unit.status, to: 'IN_SERVICE' } });
  }
  await audit(user.id, job.id, 'opened', { referenceNumber: number, serialNumber: serial, productName, kind, coverage: look.coverage.state, warrantyNumber: look.coverage.warranty?.warrantyNumber ?? null });
  if (customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { fullName: true, email: true, notifyByEmail: true } });
    if (customer?.notifyByEmail && customer.email) {
      later(async () => {
        const site = await customerSite();
        await sendEmail(customer.email, `Service job ${number} opened — ${productName}`, renderServiceJobOpenedEmail({ customerName: customer.fullName, jobNumber: number, productName, serialNumber: serial, fault, kind, ...site }));
      });
    }
  }
  return { id: job.id, number };
}

// ── Lists and reads ──────────────────────────────────────────────────────

const jobListSelect = {
  id: true, number: true, serialNumber: true, productName: true, kind: true, status: true, fault: true, technicianId: true, createdAt: true, updatedAt: true, quotedAmount: true, paidAmount: true,
  customer: { select: { id: true, fullName: true } },
} as const;

export async function listServiceJobs(options?: { q?: string; status?: string; mine?: boolean }) {
  const reach = await reachWhere('service.view');
  const q = options?.q?.trim().slice(0, 100);
  const me = options?.mine ? await requireUser() : null;
  const rows = await prisma.serviceJob.findMany({
    where: {
      ...reach,
      ...(options?.status && SERVICE_JOB_STATUS_LABEL[options.status as ServiceJobStatus] ? { status: options.status as ServiceJobStatus } : {}),
      ...(me ? { technicianId: me.id } : {}),
      ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { serialNumber: { contains: q, mode: 'insensitive' } }, { productName: { contains: q, mode: 'insensitive' } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    select: jobListSelect,
  });
  const names = await userNames(rows.map((r) => r.technicianId));
  return rows.map((r) => ({ ...r, quotedAmount: r.quotedAmount === null ? null : Number(r.quotedAmount), paidAmount: Number(r.paidAmount), technicianName: nameOf(names, r.technicianId) }));
}

export async function getServiceJob(id: string) {
  const rec = await seeOrNull('service.view', await prisma.serviceJob.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      finishedUnit: { select: { id: true, serialNumber: true, status: true, soldAt: true, product: { select: { name: true, family: true } }, configuration: { select: { name: true } }, warranties: { select: { id: true, kind: true, status: true, startsAt: true, endsAt: true, warrantyNumber: true } } } },
      openedBy: { select: { id: true, fullName: true } },
      parts: { orderBy: { usedAt: 'asc' }, include: { part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true } } } },
      ledger: { orderBy: { recordedAt: 'asc' } },
      branch: { select: { id: true, name: true } },
    },
  }), 'getServiceJob');
  if (!rec) return null;
  const [names, claim] = await Promise.all([
    userNames([rec.technicianId, rec.supervisorId, rec.qaById, ...rec.parts.map((p) => p.usedById), ...rec.ledger.map((l) => l.recordedById)]),
    rec.warrantyClaimId ? prisma.warrantyClaim.findFirst({ where: { id: rec.warrantyClaimId, customer: await orgWhere() }, select: { id: true, claimNumber: true, status: true } }) : Promise.resolve(null),
  ]);
  const coverage = warrantyCoverageOn(rec.finishedUnit?.warranties ?? []);
  const quotedAmount = rec.quotedAmount === null ? null : Number(rec.quotedAmount);
  const paidAmount = Number(rec.paidAmount);
  return {
    ...rec,
    quotedAmount, paidAmount, balance: paidJobBalance(quotedAmount, paidAmount),
    coverage, claim,
    technicianName: nameOf(names, rec.technicianId), supervisorName: nameOf(names, rec.supervisorId), qaByName: nameOf(names, rec.qaById),
    parts: rec.parts.map((p) => ({ ...p, quantity: Number(p.quantity), unitCost: Number(p.unitCost), usedByName: nameOf(names, p.usedById) })),
    ledger: rec.ledger.map((l) => ({ ...l, amount: Number(l.amount), recordedByName: nameOf(names, l.recordedById) })),
    partsTotal: round2(rec.parts.reduce((s, p) => s + Number(p.quantity) * Number(p.unitCost), 0)),
    ledgerTotal: round2(rec.ledger.reduce((s, l) => s + Number(l.amount), 0)),
  };
}

export async function getServiceJobAuditTrail(jobId: string) {
  const job = await seeOrNull('service.view', await prisma.serviceJob.findUnique({ where: { id: jobId }, select: { id: true, branchId: true } }), 'getServiceJobAuditTrail');
  if (!job) return [];
  const entries = await prisma.auditLog.findMany({ where: { entityType: 'ServiceJob', entityId: jobId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, action: true, userId: true, metadata: true, createdAt: true } });
  const names = await userNames(entries.map((e) => e.userId));
  return entries.map((e) => ({ ...e, userName: e.userId ? actorLabel(names.get(e.userId) ?? null, e.metadata) : null }));
}

/** The record facts an assignment-aware check needs, read from the database (never the browser). */
async function jobForChange(jobId: string) {
  const job = await prisma.serviceJob.findUnique({ where: { id: jobId }, select: { id: true, number: true, branchId: true, status: true, kind: true, technicianId: true, supervisorId: true, openedById: true, finishedUnitId: true, serialNumber: true, productName: true, customerId: true, quotedAmount: true, paidAmount: true, resolution: true } });
  if (!job) throw new ServiceActionError('This service job no longer exists — refresh the page.');
  return job;
}

/**
 * The assignment-aware check on a service job, from the record itself:
 * 'service.manage' for the supervisor's steps; 'service.job.work' for the
 * technician's (the assigned technician, or the supervisor who may also work it).
 */
async function authorizeOnServiceJob(key: 'service.manage' | 'service.job.work', job: { branchId: string; technicianId: string | null; supervisorId: string | null }, where: string): Promise<{ id: string }> {
  const user = await requireUser();
  if (key === 'service.manage') await authorize('service.manage', { branchId: job.branchId, homeBranch: true }, where, 'Only the Service Centre supervisor can do this.');
  else await authorize('service.job.work', { branchId: job.branchId, assigneeIds: [job.technicianId, job.supervisorId], ownerIds: [] }, where, 'Only the technician assigned to this job can record work on it.');
  return user;
}

function assertMove(job: { status: string; number: string }, to: ServiceJobStatus) {
  if (!canMoveServiceJob(job.status as ServiceJobStatus, to)) throw new ServiceActionError(`${job.number} is ${SERVICE_JOB_STATUS_LABEL[job.status as ServiceJobStatus]?.toLowerCase() ?? job.status} — it cannot move to "${SERVICE_JOB_STATUS_LABEL[to]}" from there.`);
}

// ── Workflow ─────────────────────────────────────────────────────────────

export async function assignServiceTechnician(jobId: string, technicianId: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.manage', job, 'assignServiceTechnician');
  assertMove(job, 'ASSIGNED');
  const tech = await prisma.user.findFirst({ where: { ...(await orgWhere()), id: technicianId, isActive: true, roles: { some: { role: { slug: 'service-technician' } } } }, select: { id: true, fullName: true } });
  if (!tech) throw new ServiceActionError('Choose an active service technician of your organisation.');
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: job.status as ServiceJobStatus }, data: { status: 'ASSIGNED', technicianId: tech.id, supervisorId: user.id, assignedAt: new Date() } }));
  await audit(user.id, jobId, 'assigned', { referenceNumber: job.number, technician: tech.fullName, technicianId: tech.id, reassigned: Boolean(job.technicianId) });
  emailColleaguesLater({
    branchId: job.branchId, userIds: [tech.id], exceptUserId: user.id, path: `/service/jobs/${jobId}`, where: 'service_job.assigned',
    notice: { subject: `Service job ${job.number} assigned to you`, heading: 'A service job is yours', intro: `${job.productName} (serial ${job.serialNumber}) is waiting for your diagnosis.`, facts: [['Service job', job.number], ['Unit', job.productName], ['Serial', job.serialNumber]], next: 'Open the job, record your diagnosis, the parts used and the resolution.', status: { label: 'Assigned', tone: 'info' }, ctaLabel: 'Open the service job' },
  });
}

export async function recordServiceDiagnosis(jobId: string, diagnosis: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.job.work', job, 'recordServiceDiagnosis');
  const text = diagnosis.trim();
  if (!text) throw new ServiceActionError('Write what you found.');
  assertMove(job, 'DIAGNOSED');
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: job.status as ServiceJobStatus }, data: { status: 'DIAGNOSED', diagnosis: text, diagnosedAt: new Date() } }));
  await audit(user.id, jobId, 'diagnosed', { referenceNumber: job.number, diagnosis: text.slice(0, 300) });
}

export async function recordServicePartUsed(jobId: string, partId: string, quantity: number, unitCost?: number): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.job.work', job, 'recordServicePartUsed');
  if (!(TECHNICIAN_WORK_STATUSES as string[]).includes(job.status) || job.status === 'ASSIGNED') throw new ServiceActionError('Parts are recorded after the diagnosis and before the quality check.');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new ServiceActionError('Enter the quantity used.');
  const part = await prisma.part.findFirst({ where: { ...(await partsOfMyOrganisation()), id: partId, isActive: true }, select: { id: true, name: true, partNumber: true, sellingPrice: true } });
  if (!part) throw new ServiceActionError('Choose a part from the service parts store.');
  const cost = unitCost !== undefined && Number.isFinite(unitCost) && unitCost >= 0 ? round2(unitCost) : round2(Number(part.sellingPrice ?? 0));
  await prisma.servicePart.create({ data: { serviceJobId: jobId, partId: part.id, quantity: round2(quantity), unitCost: cost, usedById: user.id } });
  // The parts used move the job into repair if it was only diagnosed.
  if (job.status === 'DIAGNOSED') stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: 'DIAGNOSED' }, data: { status: 'REPAIRING' } }));
  await audit(user.id, jobId, 'part_used', { referenceNumber: job.number, part: part.name, partNumber: part.partNumber, quantity: round2(quantity), unitCost: cost });
}

export async function markServiceAwaitingParts(jobId: string, note: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.job.work', job, 'markServiceAwaitingParts');
  assertMove(job, 'AWAITING_PARTS');
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: job.status as ServiceJobStatus }, data: { status: 'AWAITING_PARTS' } }));
  await audit(user.id, jobId, 'awaiting_parts', { referenceNumber: job.number, note: note.trim().slice(0, 300) || null });
  emailColleaguesLater({
    branchId: job.branchId, userIds: [job.supervisorId], exceptUserId: user.id, path: `/service/jobs/${jobId}`, where: 'service_job.awaiting_parts',
    notice: { subject: `Parts needed — service job ${job.number}`, heading: 'A repair is waiting for parts', intro: `${job.productName} (serial ${job.serialNumber}) cannot be repaired until parts arrive.${note.trim() ? ` ${note.trim().slice(0, 200)}` : ''}`, facts: [['Service job', job.number]], next: 'Order or issue the parts, then the technician resumes the repair.', status: { label: 'Awaiting parts', tone: 'warning' }, ctaLabel: 'Open the service job' },
  });
}

export async function resumeServiceRepair(jobId: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.job.work', job, 'resumeServiceRepair');
  assertMove(job, 'REPAIRING');
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: job.status as ServiceJobStatus }, data: { status: 'REPAIRING' } }));
  await audit(user.id, jobId, 'repair_resumed', { referenceNumber: job.number });
}

export async function recordServiceResolution(jobId: string, resolution: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.job.work', job, 'recordServiceResolution');
  const text = resolution.trim();
  if (!text) throw new ServiceActionError('Write what was done to the unit.');
  assertMove(job, 'QA');
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: job.status as ServiceJobStatus }, data: { status: 'QA', resolution: text, repairedAt: new Date() } }));
  await audit(user.id, jobId, 'repaired', { referenceNumber: job.number, resolution: text.slice(0, 300) });
  emailColleaguesLater({
    branchId: job.branchId, userIds: [job.supervisorId], exceptUserId: user.id, path: `/service/jobs/${jobId}`, where: 'service_job.qa',
    notice: { subject: `Ready for quality check — service job ${job.number}`, heading: 'A repair is ready for its quality check', intro: `${job.productName} (serial ${job.serialNumber}) has been repaired: ${text.slice(0, 200)}`, facts: [['Service job', job.number]], next: 'Test the unit and pass or fail the repair (never the technician who did it).', status: { label: 'Quality check', tone: 'info' }, ctaLabel: 'Open the service job' },
  });
}

/** QA after repair: the supervisor (never the technician) passes or fails the unit. */
export async function recordServiceQa(jobId: string, passed: boolean, note: string): Promise<void> {
  await refuseDuringAssist('recordServiceQa');
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.manage', job, 'recordServiceQa');
  const check = canQaServiceJob(job, user.id);
  if (!check.ok) throw new ServiceActionError(check.reason ?? 'Not at the quality check step.');
  const to: ServiceJobStatus = passed ? 'READY' : 'REPAIRING';
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: 'QA' }, data: { status: to, qaPassed: passed, qaById: user.id, qaAt: new Date() } }));
  await audit(user.id, jobId, passed ? 'qa_passed' : 'qa_failed', { referenceNumber: job.number, note: note.trim().slice(0, 300) || null });
  if (passed) {
    if (job.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: job.customerId }, select: { fullName: true, email: true, notifyByEmail: true } });
      if (customer?.notifyByEmail && customer.email) {
        const balance = paidJobBalance(job.quotedAmount === null ? null : Number(job.quotedAmount), Number(job.paidAmount));
        later(async () => {
          const site = await customerSite();
          await sendEmail(customer.email, `Your ${job.productName} is ready for collection — ${job.number}`, renderServiceUnitReadyEmail({ customerName: customer.fullName, jobNumber: job.number, productName: job.productName, serialNumber: job.serialNumber, resolution: job.resolution ?? 'Repaired', amountDue: job.kind === 'PAID' && balance > 0 ? `₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}` : null, ...site }));
        });
      }
    }
  } else if (job.technicianId) {
    emailColleaguesLater({
      branchId: job.branchId, userIds: [job.technicianId], exceptUserId: user.id, path: `/service/jobs/${jobId}`, where: 'service_job.qa_failed',
      notice: { subject: `Rework needed — service job ${job.number}`, heading: 'The quality check failed', intro: `${job.productName} (serial ${job.serialNumber}) did not pass its check.${note.trim() ? ` ${note.trim().slice(0, 200)}` : ''}`, facts: [['Service job', job.number]], next: 'Rework the unit and record the resolution again.', status: { label: 'Rework', tone: 'danger' }, ctaLabel: 'Open the service job' },
    });
  }
}

/** The unit goes back to its customer; a sold unit returns to SOLD. */
export async function returnServiceUnit(jobId: string, collectedBy: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.manage', job, 'returnServiceUnit');
  const check = canReturnUnit({ status: job.status, kind: job.kind, quotedAmount: job.quotedAmount === null ? null : Number(job.quotedAmount), paidAmount: Number(job.paidAmount) });
  if (!check.ok) throw new ServiceActionError(check.reason ?? 'The unit cannot be returned yet.');
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: 'READY' }, data: { status: 'RETURNED', returnedAt: new Date() } }));
  await restoreUnit(user.id, job, 'returned');
  await audit(user.id, jobId, 'returned', { referenceNumber: job.number, collectedBy: collectedBy.trim().slice(0, 120) || null });
}

/** A unit at the Service Centre goes back to where it was: SOLD when a customer owns it, else to stock. */
async function restoreUnit(userId: string, job: { number: string; finishedUnitId: string | null; serialNumber: string }, why: string) {
  if (!job.finishedUnitId) return;
  const unit = await prisma.finishedUnit.findUnique({ where: { id: job.finishedUnitId }, select: { id: true, status: true, customerId: true } });
  if (!unit || unit.status !== 'IN_SERVICE') return;
  const to = unit.customerId ? 'SOLD' : 'IN_STOCK';
  stillAsSeen(await prisma.finishedUnit.updateMany({ where: { id: unit.id, status: 'IN_SERVICE' }, data: { status: to } }));
  await writeAuditLog({ userId, action: `finished_unit.${why}_from_service`, entityType: 'FinishedUnit', entityId: unit.id, metadata: { serialNumber: job.serialNumber, referenceNumber: job.number, from: 'IN_SERVICE', to } });
}

export async function closeServiceJob(jobId: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.manage', job, 'closeServiceJob');
  assertMove(job, 'CLOSED');
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: 'RETURNED' }, data: { status: 'CLOSED' } }));
  await audit(user.id, jobId, 'closed', { referenceNumber: job.number });
}

export async function cancelServiceJob(jobId: string, reason: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.manage', job, 'cancelServiceJob');
  const why = reason.trim();
  if (!why) throw new ServiceActionError('Give the reason for cancelling.');
  assertMove(job, 'CANCELLED');
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, status: job.status as ServiceJobStatus }, data: { status: 'CANCELLED' } }));
  await restoreUnit(user.id, job, 'cancelled');
  await audit(user.id, jobId, 'cancelled', { referenceNumber: job.number, reason: why.slice(0, 300) });
}

// ── Money on paid jobs ───────────────────────────────────────────────────

export async function quoteServiceJob(jobId: string, amount: number): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.manage', job, 'quoteServiceJob');
  if (job.kind !== 'PAID') throw new ServiceActionError('Only a paid (out-of-warranty) repair is quoted.');
  if (!Number.isFinite(amount) || amount < 0) throw new ServiceActionError('Enter the quoted amount.');
  if (['RETURNED', 'CLOSED', 'CANCELLED'].includes(job.status)) throw new ServiceActionError('This job is finished — the quotation can no longer change.');
  const quoted = round2(amount);
  await prisma.serviceJob.update({ where: { id: jobId }, data: { quotedAmount: quoted } });
  await audit(user.id, jobId, 'quoted', { referenceNumber: job.number, from: job.quotedAmount === null ? null : Number(job.quotedAmount), to: quoted });
}

export async function recordServiceJobPayment(jobId: string, amount: number, reference: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await authorizeOnServiceJob('service.manage', job, 'recordServiceJobPayment');
  if (job.kind !== 'PAID') throw new ServiceActionError('Payments are recorded on paid repairs only.');
  if (job.quotedAmount === null) throw new ServiceActionError('Quote the repair before recording a payment.');
  if (!Number.isFinite(amount) || amount <= 0) throw new ServiceActionError('Enter the amount paid.');
  const balance = paidJobBalance(Number(job.quotedAmount), Number(job.paidAmount));
  if (round2(amount) > balance) throw new ServiceActionError(`Only ₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })} is outstanding.`);
  // Compare-and-set on the amount the supervisor saw, so two payments recorded at once never overpay.
  stillAsSeen(await prisma.serviceJob.updateMany({ where: { id: jobId, paidAmount: job.paidAmount }, data: { paidAmount: { increment: round2(amount) } } }));
  await audit(user.id, jobId, 'payment_recorded', { referenceNumber: job.number, amount: round2(amount), reference: reference.trim().slice(0, 120) || null });
}

// ── Cost centre and the warranty ledger ──────────────────────────────────

export async function setServiceCostCentre(jobId: string, costCentre: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await requireUser();
  await authorize('warranty.claim.approve', { branchId: job.branchId, homeBranch: true }, 'setServiceCostCentre', 'Only the Warranty Manager decides which department carries a case.');
  const cc = costCentre as WarrantyCostCentre;
  if (!COST_CENTRES.includes(cc)) throw new ServiceActionError('Choose a cost centre.');
  if (!allowedCostCentres(job.kind as ServiceJobKind).includes(cc)) throw new ServiceActionError(`"${cc.replace(/_/g, ' ').toLowerCase()}" does not apply to a ${job.kind.toLowerCase()} job.`);
  await prisma.serviceJob.update({ where: { id: jobId }, data: { costCentre: cc } });
  await audit(user.id, jobId, 'cost_centre_set', { referenceNumber: job.number, costCentre: cc });
}

export async function recordWarrantyLedgerEntry(jobId: string, costCentre: string, amount: number, note: string): Promise<void> {
  const job = await jobForChange(jobId);
  const user = await requireUser();
  await authorize('warranty.claim.approve', { branchId: job.branchId, homeBranch: true }, 'recordWarrantyLedgerEntry', 'Only the Warranty Manager writes the warranty ledger.');
  const cc = costCentre as WarrantyCostCentre;
  if (!COST_CENTRES.includes(cc)) throw new ServiceActionError('Choose a cost centre.');
  if (!Number.isFinite(amount) || amount === 0) throw new ServiceActionError('Enter the amount (a negative amount reverses an earlier entry).');
  await prisma.warrantyLedgerEntry.create({ data: { serviceJobId: jobId, costCentre: cc, amount: round2(amount), note: note.trim().slice(0, 300) || null, recordedById: user.id } });
  if (!job.kind || job.kind !== 'PAID') await prisma.serviceJob.update({ where: { id: jobId }, data: { costCentre: cc } });
  await audit(user.id, jobId, 'ledger_entry_recorded', { referenceNumber: job.number, costCentre: cc, amount: round2(amount), note: note.trim().slice(0, 300) || null });
}

export async function getServiceLedgerSummary() {
  const reach = await reachWhere('service.view');
  const yearStart = lagosYearStart();
  const monthStart = lagosMonthStart();
  const rows = await prisma.warrantyLedgerEntry.findMany({
    where: { serviceJob: reach, recordedAt: { gte: yearStart } },
    orderBy: { recordedAt: 'desc' },
    take: 1000,
    select: { id: true, costCentre: true, amount: true, note: true, recordedAt: true, recordedById: true, serviceJob: { select: { id: true, number: true, productName: true, serialNumber: true, kind: true } } },
  });
  const names = await userNames(rows.map((r) => r.recordedById));
  const entries = rows.map((r) => ({ ...r, amount: Number(r.amount), recordedByName: nameOf(names, r.recordedById) }));
  const now = new Date();
  return { yearStart, monthStart, month: ledgerTotals(entries, monthStart, now), year: ledgerTotals(entries, yearStart, now), entries: entries.slice(0, 100) };
}

// ── Home, dashboard, glance ──────────────────────────────────────────────

export async function getServiceHome() {
  const reach = await reachWhere('service.view');
  const customer = await orgWhere();
  const soon = new Date(Date.now() + COVERAGE_EXPIRING_SOON_DAYS * DAY);
  const [byStatus, claimsToApprove, expiring, unassignedOldest] = await Promise.all([
    prisma.serviceJob.groupBy({ by: ['status'], where: { ...reach, status: { in: SERVICE_OPEN_STATUSES } }, _count: { _all: true } }),
    prisma.warrantyClaim.count({ where: { customer, warranty: { kind: 'PRODUCT' }, status: { in: ['PENDING_HOD', 'PENDING_MANAGER'] } } }),
    prisma.warranty.count({ where: { customer, kind: 'PRODUCT', status: 'ACTIVE', endsAt: { gte: new Date(), lte: soon } } }),
    prisma.serviceJob.findFirst({ where: { ...reach, status: 'OPEN' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);
  const counts = Object.fromEntries(SERVICE_OPEN_STATUSES.map((s) => [s, 0])) as Record<ServiceJobStatus, number>;
  for (const g of byStatus) counts[g.status as ServiceJobStatus] = g._count._all;
  return { counts, open: Object.values(counts).reduce((a, b) => a + b, 0), claimsToApprove, expiring, oldestUnassignedDays: unassignedOldest ? Math.floor((Date.now() - unassignedOldest.createdAt.getTime()) / DAY) : null };
}

export async function getServiceDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const user = await requireUser();
  const items: { id: string; title: string; detail: string; url: string; createdAt: Date }[] = [];
  const reach = await reachWhere('service.view', { lens: false });
  const [canManage, canApprove] = await Promise.all([allows('service.manage'), allows('warranty.claim.approve')]);
  if (canApprove) {
    const claims = await prisma.warrantyClaim.findMany({
      where: { customer: await orgWhere(), warranty: { kind: 'PRODUCT' }, status: { in: ['PENDING_HOD', 'PENDING_MANAGER'] }, createdById: { not: user.id } },
      orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, claimNumber: true, causalPart: true, updatedAt: true },
    });
    for (const c of claims) items.push({ id: `service-claim-${c.id}`, title: `Approve warranty claim ${c.claimNumber}`, detail: c.causalPart, url: `/warranty/claims/${c.id}`, createdAt: c.updatedAt });
  }
  if (canManage) {
    const [open, qa] = await Promise.all([
      prisma.serviceJob.findMany({ where: { ...reach, status: 'OPEN' }, orderBy: { createdAt: 'asc' }, take: 10, select: { id: true, number: true, productName: true, serialNumber: true, createdAt: true } }),
      prisma.serviceJob.findMany({ where: { ...reach, status: 'QA', NOT: { technicianId: user.id } }, orderBy: { repairedAt: 'asc' }, take: 10, select: { id: true, number: true, productName: true, serialNumber: true, repairedAt: true, createdAt: true } }),
    ]);
    for (const j of open) items.push({ id: `service-assign-${j.id}`, title: `Assign service job ${j.number}`, detail: `${j.productName} · ${j.serialNumber}`, url: `/service/jobs/${j.id}`, createdAt: j.createdAt });
    for (const j of qa) items.push({ id: `service-qa-${j.id}`, title: `Quality check ${j.number}`, detail: `${j.productName} · ${j.serialNumber}`, url: `/service/jobs/${j.id}`, createdAt: j.repairedAt ?? j.createdAt });
  }
  return items;
}

export type ServiceGlanceTile = { label: string; value: number; hint: string; href: string; tone: 'primary' | 'info' | 'warning' | 'error' | 'success' | 'muted' };

export async function getServiceGlance(): Promise<ServiceGlanceTile[]> {
  if (!(await allows('service.view'))) return [];
  const reach = await reachWhere('service.view');
  const n = (p: Promise<number>) => p.catch(() => 0);
  const [open, awaiting, ready] = await Promise.all([
    n(prisma.serviceJob.count({ where: { ...reach, status: { in: SERVICE_OPEN_STATUSES } } })),
    n(prisma.serviceJob.count({ where: { ...reach, status: 'AWAITING_PARTS' } })),
    n(prisma.serviceJob.count({ where: { ...reach, status: 'READY' } })),
  ]);
  return [
    { label: 'Service jobs open', value: open, hint: 'Units at the Service Centre', href: '/service/jobs', tone: 'primary' },
    { label: 'Awaiting parts', value: awaiting, hint: 'Repairs waiting for parts', href: '/service/jobs?status=AWAITING_PARTS', tone: awaiting ? 'warning' : 'muted' },
    { label: 'Ready for collection', value: ready, hint: 'Passed QA, not yet collected', href: '/service/jobs?status=READY', tone: ready ? 'success' : 'muted' },
  ];
}
