'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, getWorkshopBranchId, currentUserIsMasterAdmin, listEligibleManagersForBranch, getWorkshopOrgContext } from './workshop';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';
import { addMonths } from '@/lib/warranty-state';

class WarrantyActionError extends Error {}

// ── Roles: Branch Manager → Warranty HOD → Warranty staff ─────────────

async function usersWithRole(branchId: string, slug: string) {
  return prisma.user.findMany({
    where: { branchId, isActive: true, roles: { some: { role: { slug } } } },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
}

export type WarrantyRoles = { isMaster: boolean; isManager: boolean; isHod: boolean; isOfficer: boolean; canApprove: boolean; isStaff: boolean };

/** The viewer's place in the branch's warranty chain. */
export async function getWarrantyRoles(): Promise<WarrantyRoles> {
  const user = await requireUser();
  const branchId = await getWorkshopBranchId();
  const [isMaster, managers, hods, officers] = await Promise.all([
    currentUserIsMasterAdmin(),
    listEligibleManagersForBranch(branchId),
    usersWithRole(branchId, 'warranty-hod'),
    usersWithRole(branchId, 'warranty-officer'),
  ]);
  const isManager = !managers.usingFallback && managers.supervisors.some((m: { id: string }) => m.id === user.id);
  const isHod = hods.some((u: { id: string }) => u.id === user.id);
  const isOfficer = officers.some((u: { id: string }) => u.id === user.id);
  const canApprove = isMaster || isManager || isHod;
  return { isMaster, isManager, isHod, isOfficer, canApprove, isStaff: canApprove || isOfficer };
}

/** Register warranties, request policy deletions (and draft claims). */
async function requireWarrantyStaff(): Promise<{ id: string; roles: WarrantyRoles }> {
  const user = await requireUser();
  const roles = await getWarrantyRoles();
  if (!roles.isStaff) throw new WarrantyActionError('Only Warranty staff, the Warranty HOD, a Branch Manager or a Master Administrator can do this.');
  return { id: user.id, roles };
}

/** Manage providers & policies, verify registrations, change status —
 * the Warranty HOD, the Branch Manager or a Master Administrator. */
async function requireWarrantyApprover(): Promise<{ id: string; roles: WarrantyRoles }> {
  const user = await requireUser();
  const roles = await getWarrantyRoles();
  if (!roles.canApprove) throw new WarrantyActionError('Only the Warranty HOD, a Branch Manager or a Master Administrator can do this.');
  return { id: user.id, roles };
}

/** Everyone who approves warranty decisions at the branch — the people
 * told (by email and on their dashboard) when something needs them. */
async function warrantyApproverRecipients(): Promise<{ id: string; fullName: string; email: string }[]> {
  const branchId = await getWorkshopBranchId();
  const [managers, hods] = await Promise.all([listEligibleManagersForBranch(branchId), usersWithRole(branchId, 'warranty-hod')]);
  const all = [...hods, ...managers.supervisors];
  return all.filter((u, i) => all.findIndex((x) => x.id === u.id) === i);
}

async function notifyStaff(recipients: { fullName: string; email: string }[], subject: string, heading: string, lines: string[], path: string) {
  try {
    const orgContext = await getWorkshopOrgContext();
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    for (const r of recipients) {
      await sendEmail(
        r.email,
        subject,
        renderWarrantyStaffNoticeEmail({ recipientName: r.fullName, heading, lines, actionUrl: `${portalUrl}${path}`, logoUrl: `${portalUrl}/images/logo/logo.png`, companyName: orgContext.companyName, branchName: orgContext.branchName }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send warranty staff notice', subject, err);
  }
}

/** WR-2026-000001 */
async function nextWarrantyNumber(): Promise<string> {
  const prefix = `WR-${new Date().getFullYear()}-`;
  const latest = await prisma.warranty.findFirst({
    where: { warrantyNumber: { startsWith: prefix } },
    orderBy: { warrantyNumber: 'desc' },
    select: { warrantyNumber: true },
  });
  const next = latest ? parseInt(latest.warrantyNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(6, '0')}`;
}

// ── Providers ─────────────────────────────────────────────────────────

export type ProviderStateFilter = 'active' | 'inactive' | 'archived';

/** Providers — archived ones hidden unless asked for; searchable by name,
 * contact, email or phone. */
export async function listWarrantyProviders(options?: { q?: string; state?: ProviderStateFilter; type?: string }) {
  await requireUser();
  const q = options?.q?.trim();
  const state = options?.state;
  return prisma.warrantyProvider.findMany({
    where: {
      ...(state === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null }),
      ...(state === 'active' ? { isActive: true } : state === 'inactive' ? { isActive: false } : {}),
      ...(options?.type ? { type: options.type as WarrantyProviderInput['type'] } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { contactName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { policies: true, warranties: true, claims: true } } },
  });
}

export type WarrantyProviderInput = {
  name: string;
  type: 'MANUFACTURER' | 'DISTRIBUTOR' | 'COMPONENT_MAKER' | 'SUPPLIER' | 'INTERNAL';
  contactName?: string;
  email?: string;
  phone?: string;
  claimSubmissionDays?: number;
  partRetentionDays?: number;
  notes?: string;
};

export async function createWarrantyProvider(input: WarrantyProviderInput): Promise<{ id: string }> {
  const user = await requireWarrantyApprover();
  const name = input.name.trim();
  if (!name) throw new WarrantyActionError('A provider name is required.');
  if (await prisma.warrantyProvider.findUnique({ where: { name }, select: { id: true } })) {
    throw new WarrantyActionError(`A provider named "${name}" already exists.`);
  }
  const provider = await prisma.warrantyProvider.create({
    data: {
      name,
      type: input.type,
      contactName: input.contactName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      claimSubmissionDays: input.claimSubmissionDays ?? null,
      partRetentionDays: input.partRetentionDays ?? null,
      notes: input.notes?.trim() || null,
      createdById: user.id,
    },
  });
  await writeAuditLog({ userId: user.id, action: 'warranty_provider.created', entityType: 'WarrantyProvider', entityId: provider.id, metadata: { name, type: input.type } });
  return { id: provider.id };
}

// ── Policies ──────────────────────────────────────────────────────────

export type PolicyStateFilter = 'active' | 'inactive' | 'sample' | 'archived';

/** Policies — archived ones are hidden unless asked for; searchable by
 * code, name, brand, model or provider. */
export async function listWarrantyPolicies(kind?: 'ASSET' | 'PART', options?: { q?: string; state?: PolicyStateFilter }) {
  await requireUser();
  const q = options?.q?.trim();
  const state = options?.state;
  return prisma.warrantyPolicy.findMany({
    where: {
      ...(kind ? { kind } : {}),
      ...(state === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null }),
      ...(state === 'active' ? { isActive: true } : state === 'inactive' ? { isActive: false } : state === 'sample' ? { isSample: true } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
              { brand: { contains: q, mode: 'insensitive' } },
              { model: { contains: q, mode: 'insensitive' } },
              { provider: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: 'desc' }, { kind: 'asc' }, { name: 'asc' }],
    include: { provider: { select: { id: true, name: true, type: true } }, _count: { select: { warranties: true, parts: true } } },
  });
}

export type WarrantyPolicyInput = {
  code: string;
  name: string;
  kind: 'ASSET' | 'PART';
  providerId: string;
  brand?: string;
  model?: string;
  durationMonths: number;
  distanceLimit?: number;
  coverageSummary: string;
  exclusions?: string;
  conditions?: string;
  coversParts?: boolean;
  coversLabour?: boolean;
  defaultRemedy?: 'REIMBURSEMENT' | 'REPLACEMENT' | 'REPAIR';
  isSample?: boolean;
};

export async function createWarrantyPolicy(input: WarrantyPolicyInput): Promise<{ id: string }> {
  const user = await requireWarrantyApprover();
  const code = input.code.trim().toUpperCase();
  if (!code || !input.name.trim()) throw new WarrantyActionError('A policy code and name are required.');
  if (!Number.isInteger(input.durationMonths) || input.durationMonths < 1 || input.durationMonths > 240) {
    throw new WarrantyActionError('Duration must be between 1 and 240 months.');
  }
  if (input.distanceLimit !== undefined && (!Number.isInteger(input.distanceLimit) || input.distanceLimit < 1)) {
    throw new WarrantyActionError('The distance limit must be a whole number above 0 (or left blank for unlimited).');
  }
  if (!input.coverageSummary.trim()) throw new WarrantyActionError('Describe what the policy covers.');
  if (input.coversParts === false && input.coversLabour === false) throw new WarrantyActionError('A policy must cover parts, labour, or both.');
  if (await prisma.warrantyPolicy.findUnique({ where: { code }, select: { id: true } })) {
    throw new WarrantyActionError(`A policy with code ${code} already exists.`);
  }
  const provider = await prisma.warrantyProvider.findUnique({ where: { id: input.providerId }, select: { id: true, isActive: true } });
  if (!provider || !provider.isActive) throw new WarrantyActionError('Choose an active warranty provider.');
  const policy = await prisma.warrantyPolicy.create({
    data: {
      code,
      name: input.name.trim(),
      kind: input.kind,
      providerId: input.providerId,
      brand: input.brand?.trim() || null,
      model: input.model?.trim() || null,
      durationMonths: input.durationMonths,
      distanceLimit: input.distanceLimit ?? null,
      coverageSummary: input.coverageSummary.trim(),
      exclusions: input.exclusions?.trim() || null,
      conditions: input.conditions?.trim() || null,
      coversParts: input.coversParts ?? true,
      coversLabour: input.coversLabour ?? true,
      defaultRemedy: input.defaultRemedy ?? 'REIMBURSEMENT',
      isSample: Boolean(input.isSample),
      createdById: user.id,
    },
  });
  await writeAuditLog({ userId: user.id, action: 'warranty_policy.created', entityType: 'WarrantyPolicy', entityId: policy.id, metadata: { code, name: input.name.trim(), kind: input.kind, durationMonths: input.durationMonths, distanceLimit: input.distanceLimit ?? null } });
  return { id: policy.id };
}

export async function setWarrantyPolicyActive(policyId: string, isActive: boolean): Promise<void> {
  const user = await requireWarrantyApprover();
  const current = await prisma.warrantyPolicy.findUnique({ where: { id: policyId }, select: { archivedAt: true } });
  if (!current) throw new WarrantyActionError('Policy not found.');
  if (current.archivedAt) throw new WarrantyActionError('This policy is archived — it can no longer be activated or changed.');
  const policy = await prisma.warrantyPolicy.update({ where: { id: policyId }, data: { isActive }, select: { code: true } });
  await writeAuditLog({ userId: user.id, action: isActive ? 'warranty_policy.activated' : 'warranty_policy.deactivated', entityType: 'WarrantyPolicy', entityId: policyId, metadata: { code: policy.code } });
}

/**
 * One click to load clearly-labelled SAMPLE providers and policies, so the
 * module can be demonstrated end to end before the real terms are known.
 * Every sample is flagged "Sample terms" everywhere it appears; replace
 * with the real terms from the manufacturer's warranty booklet. Safe to
 * run more than once (skips what already exists).
 */
export async function loadSampleWarrantyPolicies(): Promise<{ created: number }> {
  const user = await requireWarrantyApprover();
  const providers: { name: string; type: WarrantyProviderInput['type']; claimSubmissionDays: number; partRetentionDays: number; notes: string }[] = [
    { name: 'Foton (Sample)', type: 'MANUFACTURER', claimSubmissionDays: 30, partRetentionDays: 60, notes: 'SAMPLE provider — replace with the real Foton / Foton International terms.' },
    { name: 'Kewalram Workshop (Sample)', type: 'INTERNAL', claimSubmissionDays: 30, partRetentionDays: 30, notes: 'SAMPLE — the workshop’s own parts-and-workmanship warranty.' },
  ];
  let created = 0;
  const ids: Record<string, string> = {};
  for (const p of providers) {
    const existing = await prisma.warrantyProvider.findUnique({ where: { name: p.name }, select: { id: true } });
    if (existing) {
      ids[p.name] = existing.id;
      continue;
    }
    const row = await prisma.warrantyProvider.create({ data: { ...p, createdById: user.id } });
    ids[p.name] = row.id;
    created += 1;
  }
  const policies: (Omit<WarrantyPolicyInput, 'providerId'> & { provider: string })[] = [
    {
      provider: 'Foton (Sample)', code: 'SAMPLE-FOTON-VEH-36', name: 'Foton new vehicle warranty (sample)', kind: 'ASSET', brand: 'Foton', coversParts: true, coversLabour: true, defaultRemedy: 'REIMBURSEMENT',
      durationMonths: 36, distanceLimit: 100000,
      coverageSummary: 'Engine\nTransmission\nDrive axle\nSteering system\nElectrical system\nEngine control unit (ECU)',
      exclusions: 'Brake pads and clutch disc\nFilters, belts, bulbs and wiper blades\nTyres\nFluids and consumables\nAccident or misuse damage\nUnauthorised modifications',
      conditions: 'Scheduled servicing at an authorised workshop at the recommended intervals\nFailure reported promptly\nFailed parts kept for inspection',
    },
    {
      provider: 'Kewalram Workshop (Sample)', code: 'SAMPLE-PART-12', name: 'Replacement part warranty — 12 months (sample)', kind: 'PART', coversParts: true, coversLabour: true, defaultRemedy: 'REPLACEMENT',
      durationMonths: 12, distanceLimit: 20000,
      coverageSummary: 'Manufacturing defects in the replacement part\nWorkmanship of fitting it',
      exclusions: 'Accident or misuse damage\nIncorrect fluids\nUnrelated failures\nNormal wear',
      conditions: 'Part fitted by the workshop\nFailure reported before the warranty ends',
    },
    {
      provider: 'Kewalram Workshop (Sample)', code: 'SAMPLE-PART-6', name: 'Replacement part warranty — 6 months (sample)', kind: 'PART', coversParts: true, coversLabour: false, defaultRemedy: 'REPLACEMENT',
      durationMonths: 6, distanceLimit: 10000,
      coverageSummary: 'Manufacturing defects in the replacement part (defect-only cover)',
      exclusions: 'Normal wear\nContamination\nIncorrect fitting by others',
      conditions: 'Part fitted by the workshop',
    },
  ];
  for (const p of policies) {
    if (await prisma.warrantyPolicy.findUnique({ where: { code: p.code }, select: { id: true } })) continue;
    const { provider, ...rest } = p;
    const providerId = ids[provider];
    if (!providerId) continue;
    await prisma.warrantyPolicy.create({ data: { ...rest, providerId, isSample: true, createdById: user.id } });
    created += 1;
  }
  await writeAuditLog({ userId: user.id, action: 'warranty.samples_loaded', entityType: 'WarrantyPolicy', entityId: 'samples', metadata: { created } });
  return { created };
}

// ── Part defaults (Inventory) ─────────────────────────────────────────

/** The warranty a part carries — issued automatically every time it is
 * released to a customer's Job Card or Vehicle Service. */
export async function setPartWarrantyPolicy(partId: string, policyId: string | null): Promise<void> {
  const user = await requireWarrantyApprover();
  if (policyId) {
    const policy = await prisma.warrantyPolicy.findUnique({ where: { id: policyId }, select: { kind: true, isActive: true } });
    if (!policy || policy.kind !== 'PART' || !policy.isActive) throw new WarrantyActionError('Choose an active PART warranty policy.');
  }
  const before = await prisma.part.findUnique({ where: { id: partId }, select: { warrantyPolicyId: true, name: true } });
  if (!before) throw new WarrantyActionError('Part not found.');
  await prisma.part.update({ where: { id: partId }, data: { warrantyPolicyId: policyId } });
  await writeAuditLog({ userId: user.id, action: 'part.warranty_policy_set', entityType: 'Part', entityId: partId, metadata: { name: before.name, from: before.warrantyPolicyId, to: policyId } });
}

// ── Asset warranty registration (e.g. a vehicle sold before integration) ─

export type RegisterAssetWarrantyInput = {
  vehicleId: string;
  policyId: string;
  startsAt: Date;
  startReading?: number;
  evidenceNote: string;
};

/** Registered by one person, verified by another before it covers
 * anything (Master Admin excepted). The vehicle must belong to a customer,
 * and cannot already hold an active/pending warranty from the same policy. */
export async function registerAssetWarranty(input: RegisterAssetWarrantyInput): Promise<{ id: string; warrantyNumber: string }> {
  const user = await requireWarrantyStaff();
  const [vehicle, policy] = await Promise.all([
    prisma.customerVehicle.findUnique({ where: { id: input.vehicleId }, select: { id: true, customerId: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true } }),
    prisma.warrantyPolicy.findUnique({ where: { id: input.policyId }, select: { id: true, kind: true, isActive: true, providerId: true, durationMonths: true, distanceLimit: true, coverageSummary: true, exclusions: true, conditions: true, name: true } }),
  ]);
  if (!vehicle) throw new WarrantyActionError('Vehicle not found.');
  if (!policy || policy.kind !== 'ASSET' || !policy.isActive) throw new WarrantyActionError('Choose an active vehicle (asset) warranty policy.');
  if (!input.evidenceNote.trim()) {
    throw new WarrantyActionError('Record the evidence for this warranty — e.g. the sales invoice or delivery note number and date.');
  }
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) throw new WarrantyActionError('Enter a valid warranty start (delivery) date.');
  if (start.getTime() > Date.now()) throw new WarrantyActionError('The warranty start (delivery) date cannot be in the future.');
  if (input.startReading !== undefined && (!Number.isInteger(input.startReading) || input.startReading < 0)) {
    throw new WarrantyActionError('The odometer at delivery must be a whole number of km.');
  }
  const duplicate = await prisma.warranty.findFirst({
    where: { vehicleId: vehicle.id, policyId: policy.id, status: { in: ['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED'] } },
    select: { warrantyNumber: true },
  });
  if (duplicate) throw new WarrantyActionError(`This vehicle already holds ${duplicate.warrantyNumber} under this policy.`);

  const warrantyNumber = await nextWarrantyNumber();
  const subject = `${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}${vehicle.chassisNumber ? ` — VIN ${vehicle.chassisNumber}` : ''}${vehicle.plateNumber ? ` — ${vehicle.plateNumber}` : ''}`;
  const isMaster = await currentUserIsMasterAdmin();
  const warranty = await prisma.warranty.create({
    data: {
      warrantyNumber,
      kind: 'ASSET',
      status: 'PENDING_VERIFICATION',
      policyId: policy.id,
      providerId: policy.providerId,
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
      subjectDescription: subject,
      startsAt: start,
      endsAt: addMonths(start, policy.durationMonths),
      startReading: input.startReading ?? null,
      distanceLimit: policy.distanceLimit,
      coverageSnapshot: policy.coverageSummary,
      exclusionsSnapshot: policy.exclusions,
      conditionsSnapshot: policy.conditions,
      origin: 'MANUAL',
      evidenceNote: input.evidenceNote.trim(),
      issuedById: user.id,
    },
  });
  await writeAuditLog({ userId: user.id, action: 'warranty.registered', entityType: 'Warranty', entityId: warranty.id, metadata: { warrantyNumber, policy: policy.name, startsAt: start.toISOString(), startReading: input.startReading ?? null, evidence: input.evidenceNote.trim(), registeredByMasterAdmin: isMaster } });
  await writeAuditLog({ userId: user.id, action: 'vehicle.warranty_registered', entityType: 'CustomerVehicle', entityId: vehicle.id, metadata: { warrantyNumber, policy: policy.name } });
  await notifyStaff(
    (await warrantyApproverRecipients()).filter((r) => r.id !== user.id),
    `Warranty ${warrantyNumber} needs verifying`,
    'A vehicle warranty needs verifying',
    [`${warrantyNumber} — ${subject}`, `Policy: ${policy.name}`, `Evidence: ${input.evidenceNote.trim()}`, 'Check the evidence, then verify it (it covers nothing until verified).'],
    `/warranty/${warranty.id}`,
  );
  return { id: warranty.id, warrantyNumber };
}

/** The second pair of eyes: a Manager (not the person who registered it,
 * unless Master Admin) confirms the evidence → ACTIVE. */
export async function verifyWarranty(warrantyId: string): Promise<void> {
  const user = await requireWarrantyApprover();
  const w = await prisma.warranty.findUnique({ where: { id: warrantyId }, select: { status: true, issuedById: true, warrantyNumber: true, vehicleId: true } });
  if (!w) throw new WarrantyActionError('Warranty not found.');
  if (w.status !== 'PENDING_VERIFICATION') throw new WarrantyActionError('Only a warranty pending verification can be verified.');
  if (w.issuedById === user.id && !user.roles.isMaster) {
    throw new WarrantyActionError('A warranty must be verified by someone other than the person who registered it.');
  }
  await prisma.warranty.update({ where: { id: warrantyId }, data: { status: 'ACTIVE', verifiedById: user.id, verifiedAt: new Date() } });
  await writeAuditLog({ userId: user.id, action: 'warranty.verified', entityType: 'Warranty', entityId: warrantyId, metadata: { warrantyNumber: w.warrantyNumber } });
}

/** Suspend, void, transfer or reinstate — always with a reason. */
export async function setWarrantyStatus(warrantyId: string, status: 'ACTIVE' | 'SUSPENDED' | 'VOID' | 'TRANSFERRED', reason: string): Promise<void> {
  const user = await requireWarrantyApprover();
  const why = reason.trim();
  if (!why) throw new WarrantyActionError('A reason is required.');
  const w = await prisma.warranty.findUnique({ where: { id: warrantyId }, select: { status: true, warrantyNumber: true } });
  if (!w) throw new WarrantyActionError('Warranty not found.');
  if (w.status === 'VOID' || w.status === 'TRANSFERRED') throw new WarrantyActionError(`This warranty is ${w.status.toLowerCase()} — it can no longer change.`);
  if (w.status === 'PENDING_VERIFICATION' && status === 'ACTIVE') throw new WarrantyActionError('Use Verify to activate a pending warranty.');
  if (w.status === status) throw new WarrantyActionError('The warranty already has that status.');
  await prisma.warranty.update({ where: { id: warrantyId }, data: { status, statusReason: why } });
  await writeAuditLog({ userId: user.id, action: `warranty.${status === 'ACTIVE' ? 'reinstated' : status.toLowerCase()}`, entityType: 'Warranty', entityId: warrantyId, metadata: { warrantyNumber: w.warrantyNumber, from: w.status, to: status, reason: why } });
}

// ── Automatic part warranties (issued with every real release) ────────

/**
 * Called right after a Parts Request Slip is released: every released
 * line whose part carries a warranty policy gets its own warranty — one
 * per serial for serialized parts, one per line for batch/quantity parts —
 * tied to the customer, vehicle, Job Card or Vehicle Service, the slip
 * line and the serial. Idempotent: running it again never duplicates.
 */
export async function issuePartWarrantiesForSlip(slipId: string): Promise<{ issued: string[] }> {
  const actor = await requireUser();
  const slip = await prisma.partRequestSlip.findUnique({
    where: { id: slipId },
    select: {
      status: true,
      referenceNumber: true,
      releasedAt: true,
      jobCard: { select: { id: true, jobNumber: true, customerId: true, vehicleId: true, mileageAtCheckIn: true } },
      vehicleService: { select: { id: true, serviceNumber: true, customerId: true, vehicleId: true, odometerAtService: true } },
      lines: {
        select: {
          id: true,
          quantityReleased: true,
          part: {
            select: {
              id: true,
              name: true,
              partNumber: true,
              trackingType: true,
              warrantyPolicy: { select: { id: true, isActive: true, kind: true, providerId: true, durationMonths: true, distanceLimit: true, coverageSummary: true, exclusions: true, conditions: true } },
            },
          },
          issuedSerials: { select: { id: true, serialNumber: true } },
          warranties: { select: { partSerialId: true } },
        },
      },
    },
  });
  if (!slip || slip.status !== 'RELEASED') return { issued: [] };
  const owner = slip.jobCard ?? slip.vehicleService;
  if (!owner) return { issued: [] };
  const reading = slip.jobCard?.mileageAtCheckIn ?? slip.vehicleService?.odometerAtService ?? null;
  const start = slip.releasedAt ?? new Date();
  const issued: string[] = [];

  for (const line of slip.lines) {
    const policy = line.part.warrantyPolicy;
    if (!policy || !policy.isActive || policy.kind !== 'PART') continue;
    const base = {
      kind: 'PART' as const,
      status: 'ACTIVE' as const,
      policyId: policy.id,
      providerId: policy.providerId,
      customerId: owner.customerId,
      vehicleId: owner.vehicleId,
      partId: line.part.id,
      slipLineId: line.id,
      jobCardId: slip.jobCard?.id ?? null,
      vehicleServiceId: slip.vehicleService?.id ?? null,
      startsAt: start,
      endsAt: addMonths(start, policy.durationMonths),
      startReading: reading,
      distanceLimit: policy.distanceLimit,
      coverageSnapshot: policy.coverageSummary,
      exclusionsSnapshot: policy.exclusions,
      conditionsSnapshot: policy.conditions,
      origin: 'AUTO',
      evidenceNote: `Issued with ${slip.referenceNumber} (${slip.jobCard ? `Job Card ${slip.jobCard.jobNumber}` : `Vehicle Service ${slip.vehicleService?.serviceNumber}`})`,
      issuedById: actor.id,
    };
    const partLabel = `${line.part.name}${line.part.partNumber ? ` (${line.part.partNumber})` : ''}`;
    if (line.part.trackingType === 'SERIALIZED') {
      for (const serial of line.issuedSerials) {
        if (line.warranties.some((w: { partSerialId: string | null }) => w.partSerialId === serial.id)) continue;
        const warrantyNumber = await nextWarrantyNumber();
        await prisma.warranty.create({ data: { ...base, warrantyNumber, partSerialId: serial.id, subjectDescription: `${partLabel} — serial ${serial.serialNumber}`, quantity: 1 } });
        issued.push(warrantyNumber);
      }
    } else if (line.warranties.length === 0) {
      const warrantyNumber = await nextWarrantyNumber();
      await prisma.warranty.create({ data: { ...base, warrantyNumber, subjectDescription: partLabel, quantity: line.quantityReleased ?? 0 } });
      issued.push(warrantyNumber);
    }
  }
  if (issued.length > 0) {
    await writeAuditLog({
      userId: actor.id,
      action: 'warranty.issued',
      entityType: slip.jobCard ? 'JobCard' : 'VehicleService',
      entityId: owner.id,
      metadata: { referenceNumber: slip.referenceNumber, warrantyNumbers: issued },
    });
  }
  return { issued };
}

// ── Queries ───────────────────────────────────────────────────────────

const LIST_INCLUDE = {
  customer: { select: { id: true, fullName: true } },
  vehicle: { select: { id: true, make: true, model: true, plateNumber: true, chassisNumber: true, mileage: true, vehicleType: true } },
  policy: { select: { id: true, code: true, name: true, isSample: true } },
  provider: { select: { id: true, name: true } },
  jobCard: { select: { id: true, jobNumber: true } },
  vehicleService: { select: { id: true, serviceNumber: true } },
  slipLine: { select: { slip: { select: { id: true, referenceNumber: true } } } },
} as const;

export async function listWarranties(search?: string) {
  await requireUser();
  const q = search?.trim();
  return prisma.warranty.findMany({
    where: q
      ? {
          OR: [
            { warrantyNumber: { contains: q, mode: 'insensitive' } },
            { subjectDescription: { contains: q, mode: 'insensitive' } },
            { customer: { fullName: { contains: q, mode: 'insensitive' } } },
            { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } },
            { vehicle: { chassisNumber: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : undefined,
    orderBy: { issuedAt: 'desc' },
    take: 500,
    include: LIST_INCLUDE,
  });
}

/** Every warranty linked to one vehicle, Job Card, Vehicle Service or slip. */
export async function listWarrantiesFor(scope: { vehicleId: string } | { jobCardId: string } | { vehicleServiceId: string } | { slipId: string }) {
  await requireUser();
  const where = 'slipId' in scope ? { slipLine: { slipId: scope.slipId } } : scope;
  return prisma.warranty.findMany({ where, orderBy: { issuedAt: 'asc' }, include: LIST_INCLUDE });
}

export async function getWarranty(id: string) {
  await requireUser();
  return prisma.warranty.findUnique({
    where: { id },
    include: {
      ...LIST_INCLUDE,
      customer: { select: { id: true, fullName: true, email: true, phone: true, address: true } },
      vehicle: { select: { id: true, make: true, model: true, year: true, plateNumber: true, chassisNumber: true, engineNumber: true, mileage: true, vehicleType: true } },
      policy: { select: { id: true, code: true, name: true, isSample: true, durationMonths: true, distanceLimit: true, coversParts: true, coversLabour: true, defaultRemedy: true } },
      provider: { select: { id: true, name: true, type: true, contactName: true, email: true, phone: true, claimSubmissionDays: true, partRetentionDays: true } },
      jobCard: { select: { id: true, jobNumber: true, branch: true } },
      vehicleService: { select: { id: true, serviceNumber: true, branch: true } },
      part: { select: { id: true, name: true, partNumber: true } },
      partSerial: { select: { id: true, serialNumber: true, goodsReceiptLine: { select: { goodsReceipt: { select: { id: true, referenceNumber: true } } } } } },
      issuedBy: { select: { fullName: true } },
      verifiedBy: { select: { fullName: true } },
    },
  });
}

export async function getWarrantyAuditTrail(warrantyId: string) {
  await requireUser();
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'Warranty', entityId: warrantyId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, action: true, createdAt: true, metadata: true, userId: true },
  });
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null }));
}

// ── Policy detail, edit and the deletion approval chain ──────────────

export async function getWarrantyPolicy(policyId: string) {
  await requireUser();
  return prisma.warrantyPolicy.findUnique({
    where: { id: policyId },
    include: {
      provider: { select: { id: true, name: true, type: true } },
      createdBy: { select: { fullName: true } },
      _count: { select: { warranties: true, parts: true } },
      parts: { select: { id: true, name: true, partNumber: true }, orderBy: { name: 'asc' }, take: 50 },
      deletionRequests: {
        orderBy: { requestedAt: 'desc' },
        include: { requestedBy: { select: { fullName: true } }, hodDecidedBy: { select: { fullName: true } }, managerDecidedBy: { select: { fullName: true } } },
      },
    },
  });
}

export async function getWarrantyPolicyAuditTrail(policyId: string) {
  await requireUser();
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'WarrantyPolicy', entityId: policyId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, action: true, createdAt: true, metadata: true, userId: true },
  });
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null }));
}

export type UpdateWarrantyPolicyInput = Omit<WarrantyPolicyInput, 'code' | 'isSample'>;

const POLICY_FIELD_LABEL: Record<string, string> = {
  name: 'Name', kind: 'Applies to', providerId: 'Provider', brand: 'Brand', model: 'Model', durationMonths: 'Months',
  distanceLimit: 'Km limit', coverageSummary: 'Covered', exclusions: 'Not covered', conditions: 'Conditions',
  coversParts: 'Covers parts', coversLabour: 'Covers labour', defaultRemedy: 'Remedy',
};

/** Edit a policy. Its code is its fixed identity; its type can't change
 * once warranties or parts use it; archived policies are read-only.
 * Warranties already issued keep the terms they were issued with. Every
 * change is audited field by field (before → after) and the approvers
 * are emailed. */
export async function updateWarrantyPolicy(policyId: string, input: UpdateWarrantyPolicyInput): Promise<void> {
  const user = await requireWarrantyApprover();
  const before = await prisma.warrantyPolicy.findUnique({
    where: { id: policyId },
    include: { _count: { select: { warranties: true, parts: true } } },
  });
  if (!before) throw new WarrantyActionError('Policy not found.');
  if (before.archivedAt) throw new WarrantyActionError('This policy is archived — it can no longer be edited.');
  if (!input.name.trim()) throw new WarrantyActionError('A policy name is required.');
  if (!Number.isInteger(input.durationMonths) || input.durationMonths < 1 || input.durationMonths > 240) {
    throw new WarrantyActionError('Duration must be between 1 and 240 months.');
  }
  if (input.distanceLimit !== undefined && (!Number.isInteger(input.distanceLimit) || input.distanceLimit < 1)) {
    throw new WarrantyActionError('The distance limit must be a whole number above 0 (or left blank for unlimited).');
  }
  if (!input.coverageSummary.trim()) throw new WarrantyActionError('List at least one thing the policy covers.');
  if (input.kind !== before.kind && (before._count.warranties > 0 || before._count.parts > 0)) {
    throw new WarrantyActionError('This policy is already in use, so whether it applies to vehicles or parts can no longer change.');
  }
  const provider = await prisma.warrantyProvider.findUnique({ where: { id: input.providerId }, select: { isActive: true } });
  if (!provider || !provider.isActive) throw new WarrantyActionError('Choose an active warranty provider.');
  const next = {
    name: input.name.trim(),
    kind: input.kind,
    providerId: input.providerId,
    brand: input.brand?.trim() || null,
    model: input.model?.trim() || null,
    durationMonths: input.durationMonths,
    distanceLimit: input.distanceLimit ?? null,
    coverageSummary: input.coverageSummary.trim(),
    exclusions: input.exclusions?.trim() || null,
    conditions: input.conditions?.trim() || null,
    coversParts: input.coversParts ?? true,
    coversLabour: input.coversLabour ?? true,
    defaultRemedy: input.defaultRemedy ?? 'REIMBURSEMENT',
  };
  if (!next.coversParts && !next.coversLabour) throw new WarrantyActionError('A policy must cover parts, labour, or both.');
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(next)) {
    const old = (before as unknown as Record<string, unknown>)[key] ?? null;
    if (old !== value) changes[key] = { from: old, to: value };
  }
  if (Object.keys(changes).length === 0) throw new WarrantyActionError('Nothing was changed.');
  await prisma.warrantyPolicy.update({ where: { id: policyId }, data: next });
  await writeAuditLog({ userId: user.id, action: 'warranty_policy.updated', entityType: 'WarrantyPolicy', entityId: policyId, metadata: { code: before.code, changes } });
  await notifyStaff(
    (await warrantyApproverRecipients()).filter((r) => r.id !== user.id),
    `Warranty policy ${before.code} edited`,
    'A warranty policy was edited',
    [`${before.code} — ${next.name}`, `Changed: ${Object.keys(changes).map((k) => POLICY_FIELD_LABEL[k] ?? k).join(', ')}`, 'Warranties already issued keep their original terms.'],
    `/warranty/policies/${policyId}`,
  );
}

/** Ask for a policy to be deleted — reason required; one open request at
 * a time. The requester's own level counts as their approval (so a
 * branch with one HOD and one Manager never deadlocks); everyone else
 * in the chain must still approve. */
export async function requestWarrantyPolicyDeletion(policyId: string, reason: string): Promise<void> {
  const user = await requireWarrantyStaff();
  const why = reason.trim();
  if (!why) throw new WarrantyActionError('A reason is required to request deleting a policy.');
  const policy = await prisma.warrantyPolicy.findUnique({ where: { id: policyId }, select: { code: true, name: true, archivedAt: true } });
  if (!policy) throw new WarrantyActionError('Policy not found.');
  if (policy.archivedAt) throw new WarrantyActionError('This policy is already archived.');
  const open = await prisma.warrantyPolicyDeletionRequest.findFirst({ where: { policyId, status: { in: ['PENDING_HOD', 'PENDING_MANAGER'] } }, select: { id: true } });
  if (open) throw new WarrantyActionError('A deletion request for this policy is already waiting for approval.');
  const r = user.roles;
  const now = new Date();
  // Requester's own level is satisfied by the request itself.
  const hodDone = r.isHod && !r.isMaster;
  const managerDone = r.isManager && !r.isMaster;
  const status = hodDone && managerDone ? 'APPROVED' : hodDone ? 'PENDING_MANAGER' : 'PENDING_HOD';
  const request = await prisma.warrantyPolicyDeletionRequest.create({
    data: {
      policyId,
      reason: why,
      status: status === 'APPROVED' ? 'PENDING_MANAGER' : status,
      requestedById: user.id,
      policyCode: policy.code,
      policyName: policy.name,
      ...(hodDone ? { hodDecidedById: user.id, hodDecidedAt: now } : {}),
      ...(managerDone ? { managerDecidedById: user.id, managerDecidedAt: now } : {}),
    },
  });
  await writeAuditLog({ userId: user.id, action: 'warranty_policy.deletion_requested', entityType: 'WarrantyPolicy', entityId: policyId, metadata: { code: policy.code, reason: why } });
  // A Manager who is also the HOD has satisfied both levels.
  if (status === 'APPROVED') {
    await completePolicyDeletion(request.id, user.id);
    return;
  }
  await notifyStaff(
    (await warrantyApproverRecipients()).filter((x) => x.id !== user.id),
    `Deletion requested — warranty policy ${policy.code}`,
    'A warranty policy deletion needs approval',
    [`${policy.code} — ${policy.name}`, `Reason: ${why}`, status === 'PENDING_HOD' ? 'Waiting on the Warranty HOD, then the Branch Manager.' : 'Waiting on the Branch Manager.'],
    `/warranty/policies/${policyId}#deletion`,
  );
}

/** Approve at the current level: HOD step, then Manager step. Nobody
 * approves their own request (Master Administrators excepted). */
export async function approveWarrantyPolicyDeletion(requestId: string): Promise<void> {
  const user = await requireWarrantyApprover();
  const req = await prisma.warrantyPolicyDeletionRequest.findUnique({ where: { id: requestId }, select: { status: true, requestedById: true, policyId: true, policyCode: true, policyName: true, reason: true, managerDecidedAt: true } });
  if (!req) throw new WarrantyActionError('Deletion request not found.');
  if (req.requestedById === user.id && !user.roles.isMaster) throw new WarrantyActionError('You cannot approve your own deletion request.');
  const now = new Date();
  if (req.status === 'PENDING_HOD') {
    if (!user.roles.isHod && !user.roles.isMaster) throw new WarrantyActionError('This request is waiting on the Warranty HOD.');
    await prisma.warrantyPolicyDeletionRequest.update({ where: { id: requestId }, data: { status: 'PENDING_MANAGER', hodDecidedById: user.id, hodDecidedAt: now } });
    await writeAuditLog({ userId: user.id, action: 'warranty_policy.deletion_hod_approved', entityType: 'WarrantyPolicy', entityId: req.policyId ?? requestId, metadata: { code: req.policyCode } });
    // Raised by the Branch Manager: their own level is already satisfied.
    if (req.managerDecidedAt) {
      await completePolicyDeletion(requestId, user.id);
      return;
    }
    const managers = await listEligibleManagersForBranch(await getWorkshopBranchId());
    await notifyStaff(
      managers.supervisors.filter((m: { id: string }) => m.id !== user.id),
      `Deletion awaiting Manager approval — warranty policy ${req.policyCode}`,
      'A warranty policy deletion needs your approval',
      [`${req.policyCode} — ${req.policyName}`, `Reason: ${req.reason}`, 'Approved by the Warranty HOD; waiting on the Branch Manager.'],
      `/warranty/policies/${req.policyId ?? ''}#deletion`,
    );
    return;
  }
  if (req.status === 'PENDING_MANAGER') {
    if (!user.roles.isManager && !user.roles.isMaster) throw new WarrantyActionError('This request is waiting on the Branch Manager.');
    await prisma.warrantyPolicyDeletionRequest.update({ where: { id: requestId }, data: { managerDecidedById: user.id, managerDecidedAt: now } });
    await completePolicyDeletion(requestId, user.id);
    return;
  }
  throw new WarrantyActionError('This deletion request has already been decided.');
}

/** Final step: a policy that never issued a warranty is deleted (parts
 * that carried it simply stop carrying one); a policy that did is
 * ARCHIVED — deactivated and hidden, its history intact. */
async function completePolicyDeletion(requestId: string, actorId: string): Promise<void> {
  const req = await prisma.warrantyPolicyDeletionRequest.findUnique({ where: { id: requestId }, select: { policyId: true, policyCode: true, policyName: true, reason: true, requestedById: true } });
  if (!req?.policyId) throw new WarrantyActionError('The policy no longer exists.');
  const issued = await prisma.warranty.count({ where: { policyId: req.policyId } });
  const outcome = issued > 0 ? 'ARCHIVED' : 'DELETED';
  await prisma.warrantyPolicyDeletionRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', outcome } });
  await writeAuditLog({ userId: actorId, action: outcome === 'ARCHIVED' ? 'warranty_policy.archived' : 'warranty_policy.deleted', entityType: 'WarrantyPolicy', entityId: req.policyId, metadata: { code: req.policyCode, name: req.policyName, reason: req.reason, warrantiesIssued: issued } });
  if (outcome === 'ARCHIVED') {
    await prisma.warrantyPolicy.update({ where: { id: req.policyId }, data: { isActive: false, archivedAt: new Date(), archivedReason: req.reason } });
    await prisma.part.updateMany({ where: { warrantyPolicyId: req.policyId }, data: { warrantyPolicyId: null } });
  } else {
    await prisma.part.updateMany({ where: { warrantyPolicyId: req.policyId }, data: { warrantyPolicyId: null } });
    await prisma.warrantyPolicy.delete({ where: { id: req.policyId } });
  }
  const requester = await prisma.user.findUnique({ where: { id: req.requestedById }, select: { fullName: true, email: true } });
  await notifyStaff(
    [...(await warrantyApproverRecipients()), ...(requester ? [{ id: req.requestedById, ...requester }] : [])].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i),
    `Warranty policy ${req.policyCode} ${outcome === 'ARCHIVED' ? 'archived' : 'deleted'}`,
    `Warranty policy ${outcome === 'ARCHIVED' ? 'archived' : 'deleted'}`,
    [
      `${req.policyCode} — ${req.policyName}`,
      outcome === 'ARCHIVED'
        ? `It had issued ${issued} ${issued === 1 ? 'warranty' : 'warranties'}, so it was archived rather than erased — those warranties stay valid and traceable.`
        : 'It had never issued a warranty, so it was deleted.',
    ],
    '/warranty/policies',
  );
}

export async function declineWarrantyPolicyDeletion(requestId: string, reason: string): Promise<void> {
  const user = await requireWarrantyApprover();
  const why = reason.trim();
  if (!why) throw new WarrantyActionError('A reason is required to decline.');
  const req = await prisma.warrantyPolicyDeletionRequest.findUnique({ where: { id: requestId }, select: { status: true, requestedById: true, policyId: true, policyCode: true, policyName: true } });
  if (!req) throw new WarrantyActionError('Deletion request not found.');
  if (req.status === 'PENDING_HOD' && !user.roles.isHod && !user.roles.isMaster) throw new WarrantyActionError('This request is waiting on the Warranty HOD.');
  if (req.status === 'PENDING_MANAGER' && !user.roles.isManager && !user.roles.isMaster) throw new WarrantyActionError('This request is waiting on the Branch Manager.');
  if (req.status !== 'PENDING_HOD' && req.status !== 'PENDING_MANAGER') throw new WarrantyActionError('This deletion request has already been decided.');
  const now = new Date();
  await prisma.warrantyPolicyDeletionRequest.update({
    where: { id: requestId },
    data: { status: 'DECLINED', declineReason: why, ...(req.status === 'PENDING_HOD' ? { hodDecidedById: user.id, hodDecidedAt: now } : { managerDecidedById: user.id, managerDecidedAt: now }) },
  });
  await writeAuditLog({ userId: user.id, action: 'warranty_policy.deletion_declined', entityType: 'WarrantyPolicy', entityId: req.policyId ?? requestId, metadata: { code: req.policyCode, reason: why } });
  const requester = await prisma.user.findUnique({ where: { id: req.requestedById }, select: { fullName: true, email: true } });
  if (requester) {
    await notifyStaff([requester], `Deletion declined — warranty policy ${req.policyCode}`, 'Your policy deletion request was declined', [`${req.policyCode} — ${req.policyName}`, `Reason: ${why}`], `/warranty/policies/${req.policyId ?? ''}`);
  }
}

/** Pending warranty work for the dashboard: registrations to verify and
 * policy deletions waiting at the viewer's level. */
export async function getWarrantyDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const roles = await getWarrantyRoles();
  if (!roles.canApprove) return [];
  const user = await requireUser();
  const [pending, deletions] = await Promise.all([
    prisma.warranty.findMany({ where: { status: 'PENDING_VERIFICATION', ...(roles.isMaster ? {} : { NOT: { issuedById: user.id } }) }, orderBy: { issuedAt: 'desc' }, take: 10, select: { id: true, warrantyNumber: true, subjectDescription: true, issuedAt: true } }),
    prisma.warrantyPolicyDeletionRequest.findMany({
      where: {
        OR: [
          ...(roles.isHod || roles.isMaster ? [{ status: 'PENDING_HOD' as const }] : []),
          ...(roles.isManager || roles.isMaster ? [{ status: 'PENDING_MANAGER' as const }] : []),
        ],
        ...(roles.isMaster ? {} : { NOT: { requestedById: user.id } }),
      },
      orderBy: { requestedAt: 'desc' },
      take: 10,
      select: { id: true, policyId: true, policyCode: true, reason: true, requestedAt: true },
    }),
  ]);
  const providerDeletions = await prisma.warrantyProviderDeletionRequest.findMany({
    where: {
      OR: [
        ...(roles.isHod || roles.isMaster ? [{ status: 'PENDING_HOD' as const }] : []),
        ...(roles.isManager || roles.isMaster ? [{ status: 'PENDING_MANAGER' as const }] : []),
      ],
      ...(roles.isMaster ? {} : { NOT: { requestedById: user.id } }),
    },
    orderBy: { requestedAt: 'desc' },
    take: 10,
    select: { id: true, providerId: true, providerName: true, reason: true, requestedAt: true },
  });
  return [
    ...providerDeletions.map((d: (typeof providerDeletions)[number]) => ({ id: `provider-delete-${d.id}`, title: `Approve deletion — provider ${d.providerName}`, detail: d.reason, url: `/warranty/providers/${d.providerId ?? ''}#deletion`, createdAt: d.requestedAt })),
    ...pending.map((w: (typeof pending)[number]) => ({ id: `warranty-verify-${w.id}`, title: `Verify warranty ${w.warrantyNumber}`, detail: w.subjectDescription, url: `/warranty/${w.id}`, createdAt: w.issuedAt })),
    ...deletions.map((d: (typeof deletions)[number]) => ({ id: `policy-delete-${d.id}`, title: `Approve deletion — policy ${d.policyCode}`, detail: d.reason, url: `/warranty/policies/${d.policyId ?? ''}#deletion`, createdAt: d.requestedAt })),
  ];
}

// ── Provider detail, edit, activation and the deletion approval chain ─

export async function getWarrantyProvider(providerId: string) {
  await requireUser();
  return prisma.warrantyProvider.findUnique({
    where: { id: providerId },
    include: {
      createdBy: { select: { fullName: true } },
      _count: { select: { policies: true, warranties: true, claims: true } },
      policies: { orderBy: [{ isActive: 'desc' }, { name: 'asc' }], select: { id: true, code: true, name: true, kind: true, isActive: true, archivedAt: true, isSample: true } },
      deletionRequests: {
        orderBy: { requestedAt: 'desc' },
        include: { requestedBy: { select: { fullName: true } }, hodDecidedBy: { select: { fullName: true } }, managerDecidedBy: { select: { fullName: true } } },
      },
    },
  });
}

export async function getWarrantyProviderAuditTrail(providerId: string) {
  await requireUser();
  const entries = await prisma.auditLog.findMany({ where: { entityType: 'WarrantyProvider', entityId: providerId }, orderBy: { createdAt: 'asc' }, select: { id: true, action: true, createdAt: true, metadata: true, userId: true } });
  const ids = [...new Set(entries.map((e: { userId: string | null }) => e.userId).filter((x: string | null): x is string => Boolean(x)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = new Map(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? name.get(e.userId) ?? null : null }));
}

const PROVIDER_FIELD_LABEL: Record<string, string> = {
  name: 'Name', type: 'Type', contactName: 'Contact', email: 'Email', phone: 'Phone',
  claimSubmissionDays: 'Claim within (days)', partRetentionDays: 'Keep failed parts (days)', notes: 'Notes',
};

/** Edit a provider — every change audited before → after; approvers emailed. */
export async function updateWarrantyProvider(providerId: string, input: WarrantyProviderInput): Promise<void> {
  const user = await requireWarrantyApprover();
  const before = await prisma.warrantyProvider.findUnique({ where: { id: providerId } });
  if (!before) throw new WarrantyActionError('Provider not found.');
  if (before.archivedAt) throw new WarrantyActionError('This provider is archived — it can no longer be edited.');
  const name = input.name.trim();
  if (!name) throw new WarrantyActionError('A provider name is required.');
  if (name !== before.name && (await prisma.warrantyProvider.findUnique({ where: { name }, select: { id: true } }))) {
    throw new WarrantyActionError(`A provider named "${name}" already exists.`);
  }
  for (const [label, v] of [['Claim within', input.claimSubmissionDays], ['Keep failed parts', input.partRetentionDays]] as const) {
    if (v !== undefined && (!Number.isInteger(v) || v < 1 || v > 3650)) throw new WarrantyActionError(`${label} must be a whole number of days between 1 and 3650 (or blank).`);
  }
  const next = {
    name,
    type: input.type,
    contactName: input.contactName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    claimSubmissionDays: input.claimSubmissionDays ?? null,
    partRetentionDays: input.partRetentionDays ?? null,
    notes: input.notes?.trim() || null,
  };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(next)) {
    const old = (before as unknown as Record<string, unknown>)[key] ?? null;
    if (old !== value) changes[key] = { from: old, to: value };
  }
  if (Object.keys(changes).length === 0) throw new WarrantyActionError('Nothing was changed.');
  await prisma.warrantyProvider.update({ where: { id: providerId }, data: next });
  await writeAuditLog({ userId: user.id, action: 'warranty_provider.updated', entityType: 'WarrantyProvider', entityId: providerId, metadata: { name, changes } });
  await notifyStaff(
    (await warrantyApproverRecipients()).filter((r) => r.id !== user.id),
    `Warranty provider ${name} edited`,
    'A warranty provider was edited',
    [name, `Changed: ${Object.keys(changes).map((k) => PROVIDER_FIELD_LABEL[k] ?? k).join(', ')}`, 'Claim deadlines on claims opened from now on use the new rules.'],
    `/warranty/providers/${providerId}`,
  );
}

export async function setWarrantyProviderActive(providerId: string, isActive: boolean): Promise<void> {
  const user = await requireWarrantyApprover();
  const p = await prisma.warrantyProvider.findUnique({ where: { id: providerId }, select: { archivedAt: true, name: true } });
  if (!p) throw new WarrantyActionError('Provider not found.');
  if (p.archivedAt) throw new WarrantyActionError('This provider is archived — it can no longer be activated or changed.');
  await prisma.warrantyProvider.update({ where: { id: providerId }, data: { isActive } });
  await writeAuditLog({ userId: user.id, action: isActive ? 'warranty_provider.activated' : 'warranty_provider.deactivated', entityType: 'WarrantyProvider', entityId: providerId, metadata: { name: p.name } });
}

export async function requestWarrantyProviderDeletion(providerId: string, reason: string): Promise<void> {
  const user = await requireWarrantyStaff();
  const why = reason.trim();
  if (!why) throw new WarrantyActionError('A reason is required to request deleting a provider.');
  const provider = await prisma.warrantyProvider.findUnique({ where: { id: providerId }, select: { name: true, archivedAt: true } });
  if (!provider) throw new WarrantyActionError('Provider not found.');
  if (provider.archivedAt) throw new WarrantyActionError('This provider is already archived.');
  const open = await prisma.warrantyProviderDeletionRequest.findFirst({ where: { providerId, status: { in: ['PENDING_HOD', 'PENDING_MANAGER'] } }, select: { id: true } });
  if (open) throw new WarrantyActionError('A deletion request for this provider is already waiting for approval.');
  const r = user.roles;
  const now = new Date();
  const hodDone = r.isHod && !r.isMaster;
  const managerDone = r.isManager && !r.isMaster;
  const request = await prisma.warrantyProviderDeletionRequest.create({
    data: {
      providerId,
      reason: why,
      status: hodDone ? 'PENDING_MANAGER' : 'PENDING_HOD',
      requestedById: user.id,
      providerName: provider.name,
      ...(hodDone ? { hodDecidedById: user.id, hodDecidedAt: now } : {}),
      ...(managerDone ? { managerDecidedById: user.id, managerDecidedAt: now } : {}),
    },
  });
  await writeAuditLog({ userId: user.id, action: 'warranty_provider.deletion_requested', entityType: 'WarrantyProvider', entityId: providerId, metadata: { name: provider.name, reason: why } });
  if (hodDone && managerDone) {
    await completeProviderDeletion(request.id, user.id);
    return;
  }
  await notifyStaff(
    (await warrantyApproverRecipients()).filter((x) => x.id !== user.id),
    `Deletion requested — warranty provider ${provider.name}`,
    'A warranty provider deletion needs approval',
    [provider.name, `Reason: ${why}`, hodDone ? 'Waiting on the Branch Manager.' : 'Waiting on the Warranty HOD, then the Branch Manager.'],
    `/warranty/providers/${providerId}#deletion`,
  );
}

export async function approveWarrantyProviderDeletion(requestId: string): Promise<void> {
  const user = await requireWarrantyApprover();
  const req = await prisma.warrantyProviderDeletionRequest.findUnique({ where: { id: requestId }, select: { status: true, requestedById: true, providerId: true, providerName: true, reason: true, managerDecidedAt: true } });
  if (!req) throw new WarrantyActionError('Deletion request not found.');
  if (req.requestedById === user.id && !user.roles.isMaster) throw new WarrantyActionError('You cannot approve your own deletion request.');
  const now = new Date();
  if (req.status === 'PENDING_HOD') {
    if (!user.roles.isHod && !user.roles.isMaster) throw new WarrantyActionError('This request is waiting on the Warranty HOD.');
    await prisma.warrantyProviderDeletionRequest.update({ where: { id: requestId }, data: { status: 'PENDING_MANAGER', hodDecidedById: user.id, hodDecidedAt: now } });
    await writeAuditLog({ userId: user.id, action: 'warranty_provider.deletion_hod_approved', entityType: 'WarrantyProvider', entityId: req.providerId ?? requestId, metadata: { name: req.providerName } });
    if (req.managerDecidedAt) {
      await completeProviderDeletion(requestId, user.id);
      return;
    }
    const managers = await listEligibleManagersForBranch(await getWorkshopBranchId());
    await notifyStaff(
      managers.supervisors.filter((m: { id: string }) => m.id !== user.id),
      `Deletion awaiting Manager approval — warranty provider ${req.providerName}`,
      'A warranty provider deletion needs your approval',
      [req.providerName, `Reason: ${req.reason}`, 'Approved by the Warranty HOD; waiting on the Branch Manager.'],
      `/warranty/providers/${req.providerId ?? ''}#deletion`,
    );
    return;
  }
  if (req.status === 'PENDING_MANAGER') {
    if (!user.roles.isManager && !user.roles.isMaster) throw new WarrantyActionError('This request is waiting on the Branch Manager.');
    await prisma.warrantyProviderDeletionRequest.update({ where: { id: requestId }, data: { managerDecidedById: user.id, managerDecidedAt: now } });
    await completeProviderDeletion(requestId, user.id);
    return;
  }
  throw new WarrantyActionError('This deletion request has already been decided.');
}

/** In use (any policy, warranty or claim) → ARCHIVED, and its active
 * policies are deactivated so no new warranties are issued under a
 * provider that's gone; never used → deleted. */
async function completeProviderDeletion(requestId: string, actorId: string): Promise<void> {
  const req = await prisma.warrantyProviderDeletionRequest.findUnique({ where: { id: requestId }, select: { providerId: true, providerName: true, reason: true, requestedById: true } });
  if (!req?.providerId) throw new WarrantyActionError('The provider no longer exists.');
  const [policies, warranties, claims] = await Promise.all([
    prisma.warrantyPolicy.count({ where: { providerId: req.providerId } }),
    prisma.warranty.count({ where: { providerId: req.providerId } }),
    prisma.warrantyClaim.count({ where: { providerId: req.providerId } }),
  ]);
  const inUse = policies + warranties + claims > 0;
  const outcome = inUse ? 'ARCHIVED' : 'DELETED';
  await prisma.warrantyProviderDeletionRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', outcome } });
  await writeAuditLog({ userId: actorId, action: inUse ? 'warranty_provider.archived' : 'warranty_provider.deleted', entityType: 'WarrantyProvider', entityId: req.providerId, metadata: { name: req.providerName, reason: req.reason, policies, warranties, claims } });
  let deactivated = 0;
  if (inUse) {
    await prisma.warrantyProvider.update({ where: { id: req.providerId }, data: { isActive: false, archivedAt: new Date(), archivedReason: req.reason } });
    deactivated = (await prisma.warrantyPolicy.updateMany({ where: { providerId: req.providerId, isActive: true }, data: { isActive: false } })).count;
  } else {
    await prisma.warrantyProvider.delete({ where: { id: req.providerId } });
  }
  const requester = await prisma.user.findUnique({ where: { id: req.requestedById }, select: { fullName: true, email: true } });
  await notifyStaff(
    [...(await warrantyApproverRecipients()), ...(requester ? [{ id: req.requestedById, ...requester }] : [])].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i),
    `Warranty provider ${req.providerName} ${inUse ? 'archived' : 'deleted'}`,
    `Warranty provider ${inUse ? 'archived' : 'deleted'}`,
    [
      req.providerName,
      inUse
        ? `It was in use (${policies} ${policies === 1 ? 'policy' : 'policies'}, ${warranties} ${warranties === 1 ? 'warranty' : 'warranties'}, ${claims} ${claims === 1 ? 'claim' : 'claims'}), so it was archived — history stays valid. ${deactivated} active ${deactivated === 1 ? 'policy was' : 'policies were'} deactivated.`
        : 'It had never been used, so it was deleted.',
    ],
    '/warranty/providers',
  );
}

export async function declineWarrantyProviderDeletion(requestId: string, reason: string): Promise<void> {
  const user = await requireWarrantyApprover();
  const why = reason.trim();
  if (!why) throw new WarrantyActionError('A reason is required to decline.');
  const req = await prisma.warrantyProviderDeletionRequest.findUnique({ where: { id: requestId }, select: { status: true, requestedById: true, providerId: true, providerName: true } });
  if (!req) throw new WarrantyActionError('Deletion request not found.');
  if (req.status === 'PENDING_HOD' && !user.roles.isHod && !user.roles.isMaster) throw new WarrantyActionError('This request is waiting on the Warranty HOD.');
  if (req.status === 'PENDING_MANAGER' && !user.roles.isManager && !user.roles.isMaster) throw new WarrantyActionError('This request is waiting on the Branch Manager.');
  if (req.status !== 'PENDING_HOD' && req.status !== 'PENDING_MANAGER') throw new WarrantyActionError('This deletion request has already been decided.');
  const now = new Date();
  await prisma.warrantyProviderDeletionRequest.update({
    where: { id: requestId },
    data: { status: 'DECLINED', declineReason: why, ...(req.status === 'PENDING_HOD' ? { hodDecidedById: user.id, hodDecidedAt: now } : { managerDecidedById: user.id, managerDecidedAt: now }) },
  });
  await writeAuditLog({ userId: user.id, action: 'warranty_provider.deletion_declined', entityType: 'WarrantyProvider', entityId: req.providerId ?? requestId, metadata: { name: req.providerName, reason: why } });
  const requester = await prisma.user.findUnique({ where: { id: req.requestedById }, select: { fullName: true, email: true } });
  if (requester) await notifyStaff([requester], `Deletion declined — warranty provider ${req.providerName}`, 'Your provider deletion request was declined', [req.providerName, `Reason: ${why}`], `/warranty/providers/${req.providerId ?? ''}`);
}
