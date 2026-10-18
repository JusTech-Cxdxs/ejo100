'use server';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, orgWhere, orgOwned, branchOwnedByMyOrganisation, myOrganisationId } from '@/lib/authz/server';
import { retryOnNumberClash } from '@/lib/integrity-core';
import { lagosYear } from '@/lib/utils/format-date';
import { warrantyCoverageOn, warrantyEndsAt, COVERAGE_EXPIRING_SOON_DAYS, type Coverage } from '@/lib/service-core';
import { openServiceJob } from './service';

class ProductWarrantyError extends Error {}

const DAY = 86_400_000;

/** WR-2026-000001 — the same pattern the Warranty module uses (its helper is not exported). */
async function nextProductWarrantyNumber(): Promise<string> {
  const prefix = `WR-${lagosYear()}-`;
  const latest = await prisma.warranty.findFirst({ where: { warrantyNumber: { startsWith: prefix } }, orderBy: { warrantyNumber: 'desc' }, select: { warrantyNumber: true } });
  const next = latest ? parseInt(latest.warrantyNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

/** WC-2026-000001 — the Warranty module's claim numbering. */
async function nextProductClaimNumber(): Promise<string> {
  const prefix = `WC-${lagosYear()}-`;
  const latest = await prisma.warrantyClaim.findFirst({ where: { claimNumber: { startsWith: prefix } }, orderBy: { claimNumber: 'desc' }, select: { claimNumber: true } });
  const next = latest ? parseInt(latest.claimNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

/** The unit a product warranty is registered against: by serial, within this organisation. */
async function unitForWarranty(serialNumber: string) {
  const serial = serialNumber.trim();
  if (!serial) throw new ProductWarrantyError('Enter the unit\'s serial number.');
  const unit = await prisma.finishedUnit.findFirst({
    where: { serialNumber: { equals: serial, mode: 'insensitive' }, OR: [{ location: await branchOwnedByMyOrganisation() }, { customer: await orgWhere() }] },
    select: {
      id: true, serialNumber: true, soldAt: true, customerId: true, status: true,
      product: { select: { id: true, name: true, family: true, warrantyPolicyId: true, defaultWarrantyMonths: true } },
      configuration: { select: { name: true } },
      customer: { select: { id: true, fullName: true } },
      warranties: { select: { id: true, kind: true, status: true, startsAt: true, endsAt: true, warrantyNumber: true } },
    },
  });
  if (!unit) throw new ProductWarrantyError('No unit with that serial is in the system. Check the serial, or ask the warehouse to record the unit first.');
  return unit;
}

/** The policy a product is registered under: the product's own default, else the first active PRODUCT policy. */
async function policyFor(productPolicyId: string | null, chosenPolicyId?: string) {
  const owned = await orgOwned();
  const pick = (id: string) => prisma.warrantyPolicy.findFirst({ where: { ...owned, id, kind: 'PRODUCT', isActive: true, archivedAt: null }, select: { id: true, name: true, providerId: true, durationMonths: true, durationUnit: true, coverageSummary: true, exclusions: true, conditions: true } });
  if (chosenPolicyId) {
    const p = await pick(chosenPolicyId);
    if (!p) throw new ProductWarrantyError('Choose an active product warranty policy.');
    return p;
  }
  if (productPolicyId) {
    const p = await pick(productPolicyId);
    if (p) return p;
  }
  const first = await prisma.warrantyPolicy.findFirst({ where: { ...owned, kind: 'PRODUCT', isActive: true, archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, providerId: true, durationMonths: true, durationUnit: true, coverageSummary: true, exclusions: true, conditions: true } });
  if (!first) throw new ProductWarrantyError('No active product warranty policy exists yet — create one under Warranty › Policies (kind: Product).');
  return first;
}

function monthsOf(policy: { durationMonths: number; durationUnit: string }): number {
  // Product policies are in months; a policy in days is rounded to whole months (at least one).
  if (policy.durationUnit === 'MONTHS') return policy.durationMonths;
  return Math.max(1, Math.round(policy.durationMonths / 30));
}

export type RegisterProductWarrantyInput = {
  serialNumber: string;
  policyId?: string;
  /** Defaults to the day the unit was sold, else today. */
  startsAt?: Date;
  customerId?: string;
  evidenceNote?: string;
  /** Where the registration came from (STAFF by default; the portal records PORTAL). */
  activatedVia?: 'STAFF' | 'PORTAL' | 'DEALER';
};

/**
 * Register a product warranty for a serial: the unit's customer (or the one
 * named), the product's policy (or the first active product policy), from the
 * sale date for the policy's months. One active product warranty per unit.
 */
export async function registerProductWarranty(input: RegisterProductWarrantyInput): Promise<{ id: string; warrantyNumber: string }> {
  const user = await requireUser();
  await authorize('warranty.manage', undefined, 'registerProductWarranty', 'Only Warranty or Service Centre staff register product warranties.');
  const unit = await unitForWarranty(input.serialNumber);
  const existing = warrantyCoverageOn(unit.warranties);
  if (existing.covered || existing.state === 'PENDING_VERIFICATION') throw new ProductWarrantyError(`${unit.serialNumber} already holds ${existing.warranty?.warrantyNumber ?? 'a product warranty'}.`);
  let customerId = unit.customerId ?? input.customerId ?? null;
  if (!customerId) throw new ProductWarrantyError('This unit has no customer yet — choose the customer it was sold to.');
  const customer = await prisma.customer.findFirst({ where: { ...(await orgWhere()), id: customerId }, select: { id: true, fullName: true } });
  if (!customer) throw new ProductWarrantyError('Choose a customer of your organisation.');
  customerId = customer.id;
  const policy = await policyFor(unit.product.warrantyPolicyId, input.policyId);
  const start = input.startsAt ? new Date(input.startsAt) : unit.soldAt ?? new Date();
  if (Number.isNaN(start.getTime())) throw new ProductWarrantyError('Enter a valid start date.');
  if (start.getTime() > Date.now() + DAY) throw new ProductWarrantyError('The warranty cannot start in the future.');
  const endsAt = warrantyEndsAt(start, monthsOf(policy));
  const subject = `${unit.product.name}${unit.configuration ? ` (${unit.configuration.name})` : ''} — serial ${unit.serialNumber}`;
  const via = input.activatedVia ?? 'STAFF';
  const warranty = await retryOnNumberClash('warrantyNumber', async () => prisma.warranty.create({
    data: {
      warrantyNumber: await nextProductWarrantyNumber(), kind: 'PRODUCT', status: 'ACTIVE', policyId: policy.id, providerId: policy.providerId, customerId: customer.id, finishedUnitId: unit.id,
      subjectDescription: subject, startsAt: start, endsAt, coverageSnapshot: policy.coverageSummary, exclusionsSnapshot: policy.exclusions, conditionsSnapshot: policy.conditions,
      origin: via === 'STAFF' ? 'MANUAL' : 'PORTAL', evidenceNote: input.evidenceNote?.trim() || null, issuedById: user.id,
    },
    select: { id: true, warrantyNumber: true },
  }));
  if (!unit.customerId) {
    await prisma.finishedUnit.update({ where: { id: unit.id }, data: { customerId: customer.id, soldAt: unit.soldAt ?? start } });
  }
  await writeAuditLog({ userId: user.id, action: 'warranty.registered', entityType: 'Warranty', entityId: warranty.id, metadata: { warrantyNumber: warranty.warrantyNumber, kind: 'PRODUCT', serialNumber: unit.serialNumber, policy: policy.name, customer: customer.fullName, startsAt: start.toISOString(), endsAt: endsAt.toISOString(), activatedVia: via } });
  await writeAuditLog({ userId: user.id, action: 'finished_unit.warranty_registered', entityType: 'FinishedUnit', entityId: unit.id, metadata: { serialNumber: unit.serialNumber, warrantyNumber: warranty.warrantyNumber } });
  return warranty;
}

/** Product warranties of the organisation, newest first, with cover state today. */
export async function listProductWarranties(options?: { q?: string; expiring?: boolean }) {
  const customer = await orgWhere();
  const q = options?.q?.trim().slice(0, 100);
  const now = new Date();
  const rows = await prisma.warranty.findMany({
    where: {
      customer, kind: 'PRODUCT',
      ...(options?.expiring ? { status: 'ACTIVE', endsAt: { gte: now, lte: new Date(now.getTime() + COVERAGE_EXPIRING_SOON_DAYS * DAY) } } : {}),
      ...(q ? { OR: [{ warrantyNumber: { contains: q, mode: 'insensitive' } }, { subjectDescription: { contains: q, mode: 'insensitive' } }, { finishedUnit: { serialNumber: { contains: q, mode: 'insensitive' } } }, { customer: { fullName: { contains: q, mode: 'insensitive' } } }] } : {}),
    },
    orderBy: options?.expiring ? { endsAt: 'asc' } : { createdAt: 'desc' },
    take: 200,
    select: { id: true, warrantyNumber: true, status: true, kind: true, subjectDescription: true, startsAt: true, endsAt: true, origin: true, customer: { select: { id: true, fullName: true } }, policy: { select: { name: true } }, finishedUnit: { select: { id: true, serialNumber: true, product: { select: { name: true } } } }, _count: { select: { claims: true } } },
  });
  return rows.map((w) => ({ ...w, coverage: warrantyCoverageOn([w], now) }));
}

/** Everything the Service Centre needs about a serial's warranty (also used by Enyo). */
export async function getProductWarrantyBySerial(serialNumber: string): Promise<{ found: boolean; serialNumber: string; productName: string | null; customerName: string | null; coverage: Coverage; kind: 'WARRANTY' | 'PAID'; warranties: { id: string; warrantyNumber: string; status: string; startsAt: Date; endsAt: Date; policyName: string }[] } | null> {
  await authorize('warranty.view', undefined, 'getProductWarrantyBySerial');
  const serial = serialNumber.trim();
  if (!serial) return null;
  const unit = await prisma.finishedUnit.findFirst({
    where: { serialNumber: { equals: serial, mode: 'insensitive' }, OR: [{ location: await branchOwnedByMyOrganisation() }, { customer: await orgWhere() }] },
    select: { serialNumber: true, product: { select: { name: true } }, customer: { select: { fullName: true } }, warranties: { where: { kind: 'PRODUCT' }, orderBy: { endsAt: 'desc' }, select: { id: true, kind: true, status: true, startsAt: true, endsAt: true, warrantyNumber: true, policy: { select: { name: true } } } } },
  });
  if (!unit) return { found: false, serialNumber: serial, productName: null, customerName: null, coverage: warrantyCoverageOn([]), kind: 'PAID', warranties: [] };
  const coverage = warrantyCoverageOn(unit.warranties);
  return { found: true, serialNumber: unit.serialNumber, productName: unit.product.name, customerName: unit.customer?.fullName ?? null, coverage, kind: coverage.covered ? 'WARRANTY' : 'PAID', warranties: unit.warranties.map((w) => ({ id: w.id, warrantyNumber: w.warrantyNumber, status: w.status, startsAt: w.startsAt, endsAt: w.endsAt, policyName: w.policy.name })) };
}

// ── Product warranty claims ──────────────────────────────────────────────

export async function listProductWarrantyClaims(options?: { q?: string }) {
  const customer = await orgWhere();
  const q = options?.q?.trim().slice(0, 100);
  const rows = await prisma.warrantyClaim.findMany({
    where: { customer, warranty: { kind: 'PRODUCT' }, ...(q ? { OR: [{ claimNumber: { contains: q, mode: 'insensitive' } }, { complaint: { contains: q, mode: 'insensitive' } }, { warranty: { finishedUnit: { serialNumber: { contains: q, mode: 'insensitive' } } } }] } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, claimNumber: true, status: true, complaint: true, causalPart: true, failureDate: true, createdAt: true, customerResolution: true, customer: { select: { id: true, fullName: true } }, warranty: { select: { id: true, warrantyNumber: true, finishedUnit: { select: { serialNumber: true, product: { select: { name: true } } } } } } },
  });
  const jobs = rows.length ? await prisma.serviceJob.findMany({ where: { warrantyClaimId: { in: rows.map((r) => r.id) } }, select: { id: true, number: true, status: true, warrantyClaimId: true } }) : [];
  const jobByClaim = new Map(jobs.map((j) => [j.warrantyClaimId, j]));
  return rows.map((r) => ({ ...r, job: jobByClaim.get(r.id) ?? null }));
}

export type LogProductClaimInput = { serialNumber: string; fault: string; failureDate?: Date; causalPart?: string };

/**
 * Log a product warranty claim for a covered serial: a draft WarrantyClaim
 * (approved through the existing /warranty/claims flow) and the service job
 * that does the repair, linked by warrantyClaimId.
 */
export async function logProductWarrantyClaim(input: LogProductClaimInput): Promise<{ claimId: string; claimNumber: string; jobId: string; jobNumber: string }> {
  const user = await requireUser();
  await authorize('warranty.manage', undefined, 'logProductWarrantyClaim', 'Only Warranty or Service Centre staff log product warranty claims.');
  const unit = await unitForWarranty(input.serialNumber);
  const fault = input.fault.trim();
  if (!fault) throw new ProductWarrantyError('Describe the fault.');
  const coverage = warrantyCoverageOn(unit.warranties);
  if (!coverage.covered || !coverage.warranty) throw new ProductWarrantyError(`${unit.serialNumber} is not under an active product warranty today (${coverage.state.replace(/_/g, ' ').toLowerCase()}) — open a paid service job instead.`);
  const warranty = await prisma.warranty.findFirst({ where: { id: coverage.warranty.id, customer: await orgWhere() }, select: { id: true, warrantyNumber: true, providerId: true, customerId: true, provider: { select: { claimSubmissionDays: true, partRetentionDays: true } }, policy: { select: { defaultRemedy: true } } } });
  if (!warranty) throw new ProductWarrantyError('Warranty not found.');
  const open = await prisma.warrantyClaim.findFirst({ where: { warrantyId: warranty.id, status: { in: ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED'] } }, select: { claimNumber: true } });
  if (open) throw new ProductWarrantyError(`${open.claimNumber} is already open against ${warranty.warrantyNumber}.`);
  const failureDate = input.failureDate ? new Date(input.failureDate) : new Date();
  if (Number.isNaN(failureDate.getTime())) throw new ProductWarrantyError('Enter a valid failure date.');
  const partReturnRequired = warranty.provider.partRetentionDays !== null;
  const claim = await retryOnNumberClash('claimNumber', async () => prisma.warrantyClaim.create({
    data: {
      claimNumber: await nextProductClaimNumber(), warrantyId: warranty.id, providerId: warranty.providerId, customerId: warranty.customerId,
      complaint: fault, cause: 'To be established by the Service Centre diagnosis.', correction: 'Pending repair at the Service Centre.',
      causalPart: input.causalPart?.trim() || unit.product.name, failureDate, remedy: warranty.policy.defaultRemedy, partReturnRequired, partReturnStatus: partReturnRequired ? 'AWAITING' : null,
      deadlineAt: warranty.provider.claimSubmissionDays ? new Date(failureDate.getTime() + warranty.provider.claimSubmissionDays * DAY) : null, createdById: user.id,
    },
    select: { id: true, claimNumber: true },
  }));
  await writeAuditLog({ userId: user.id, action: 'warranty_claim.created', entityType: 'WarrantyClaim', entityId: claim.id, metadata: { claimNumber: claim.claimNumber, warrantyNumber: warranty.warrantyNumber, serialNumber: unit.serialNumber, source: 'service-centre' } });
  await writeAuditLog({ userId: user.id, action: 'warranty.claim_opened', entityType: 'Warranty', entityId: warranty.id, metadata: { claimNumber: claim.claimNumber } });
  const job = await openServiceJob({ serialNumber: unit.serialNumber, fault, kind: 'WARRANTY', warrantyClaimId: claim.id });
  return { claimId: claim.id, claimNumber: claim.claimNumber, jobId: job.id, jobNumber: job.number };
}

/** Active product policies for the register form. */
export async function listProductWarrantyPolicyOptions(): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const rows = await prisma.warrantyPolicy.findMany({ where: { ...(await orgOwned()), kind: 'PRODUCT', isActive: true, archivedAt: null }, orderBy: { name: 'asc' }, take: 50, select: { id: true, name: true, code: true, durationMonths: true, durationUnit: true, provider: { select: { name: true } } } });
  return rows.map((p) => ({ value: p.id, label: p.name, sublabel: `${p.code} · ${p.durationMonths} ${p.durationUnit.toLowerCase().replace('_', ' ')} · ${p.provider.name}` }));
}

/** For the home page tiles. */
export async function countProductWarrantiesExpiring(): Promise<number> {
  const org = await myOrganisationId();
  if (!org) return 0;
  const now = new Date();
  return prisma.warranty.count({ where: { customer: { organisationId: org }, kind: 'PRODUCT', status: 'ACTIVE', endsAt: { gte: now, lte: new Date(now.getTime() + COVERAGE_EXPIRING_SOON_DAYS * DAY) } } });
}
