'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog, requireEligibleManager, getWorkshopBranchId, currentUserIsMasterAdmin } from './workshop';
import { addMonths } from '@/lib/warranty-state';

class WarrantyActionError extends Error {}

/** Warranty administration (providers, policies, verification, status)
 * is a Workshop Manager's or Master Administrator's decision. */
async function requireWarrantyManager(): Promise<{ id: string }> {
  const branchId = await getWorkshopBranchId();
  return requireEligibleManager(branchId);
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

export async function listWarrantyProviders() {
  await requireUser();
  return prisma.warrantyProvider.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { policies: true, warranties: true } } },
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
  const user = await requireWarrantyManager();
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

export async function listWarrantyPolicies(kind?: 'ASSET' | 'PART') {
  await requireUser();
  return prisma.warrantyPolicy.findMany({
    where: kind ? { kind } : undefined,
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
  isSample?: boolean;
};

export async function createWarrantyPolicy(input: WarrantyPolicyInput): Promise<{ id: string }> {
  const user = await requireWarrantyManager();
  const code = input.code.trim().toUpperCase();
  if (!code || !input.name.trim()) throw new WarrantyActionError('A policy code and name are required.');
  if (!Number.isInteger(input.durationMonths) || input.durationMonths < 1 || input.durationMonths > 240) {
    throw new WarrantyActionError('Duration must be between 1 and 240 months.');
  }
  if (input.distanceLimit !== undefined && (!Number.isInteger(input.distanceLimit) || input.distanceLimit < 1)) {
    throw new WarrantyActionError('The distance limit must be a whole number above 0 (or left blank for unlimited).');
  }
  if (!input.coverageSummary.trim()) throw new WarrantyActionError('Describe what the policy covers.');
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
      isSample: Boolean(input.isSample),
      createdById: user.id,
    },
  });
  await writeAuditLog({ userId: user.id, action: 'warranty_policy.created', entityType: 'WarrantyPolicy', entityId: policy.id, metadata: { code, name: input.name.trim(), kind: input.kind, durationMonths: input.durationMonths, distanceLimit: input.distanceLimit ?? null } });
  return { id: policy.id };
}

export async function setWarrantyPolicyActive(policyId: string, isActive: boolean): Promise<void> {
  const user = await requireWarrantyManager();
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
  const user = await requireWarrantyManager();
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
      provider: 'Foton (Sample)', code: 'SAMPLE-FOTON-VEH-36', name: 'Foton new vehicle warranty (sample)', kind: 'ASSET', brand: 'Foton',
      durationMonths: 36, distanceLimit: 100000,
      coverageSummary: 'Engine, transmission, drive axle, steering, electrical system and ECU against defects in materials and workmanship.',
      exclusions: 'Wear items (brake pads, clutch disc, filters, belts, bulbs, wiper blades, tyres), fluids and consumables, accident or misuse damage, unauthorised modifications.',
      conditions: 'Scheduled servicing at an authorised workshop at the recommended intervals; failure reported promptly; failed parts retained for inspection.',
    },
    {
      provider: 'Kewalram Workshop (Sample)', code: 'SAMPLE-PART-12', name: 'Replacement part warranty — 12 months (sample)', kind: 'PART',
      durationMonths: 12, distanceLimit: 20000,
      coverageSummary: 'The replacement part against manufacturing defects, and the workmanship of fitting it.',
      exclusions: 'Damage from accident, misuse, incorrect fluids or unrelated failures; normal wear.',
      conditions: 'Part fitted by the workshop; failure reported before the warranty ends.',
    },
    {
      provider: 'Kewalram Workshop (Sample)', code: 'SAMPLE-PART-6', name: 'Replacement part warranty — 6 months (sample)', kind: 'PART',
      durationMonths: 6, distanceLimit: 10000,
      coverageSummary: 'The replacement part against manufacturing defects (defect-only cover for wear-type parts).',
      exclusions: 'Normal wear, contamination, incorrect fitting by others.',
      conditions: 'Part fitted by the workshop.',
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
  const user = await requireWarrantyManager();
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
  const user = await requireUser();
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
  return { id: warranty.id, warrantyNumber };
}

/** The second pair of eyes: a Manager (not the person who registered it,
 * unless Master Admin) confirms the evidence → ACTIVE. */
export async function verifyWarranty(warrantyId: string): Promise<void> {
  const user = await requireWarrantyManager();
  const w = await prisma.warranty.findUnique({ where: { id: warrantyId }, select: { status: true, issuedById: true, warrantyNumber: true, vehicleId: true } });
  if (!w) throw new WarrantyActionError('Warranty not found.');
  if (w.status !== 'PENDING_VERIFICATION') throw new WarrantyActionError('Only a warranty pending verification can be verified.');
  if (w.issuedById === user.id && !(await currentUserIsMasterAdmin())) {
    throw new WarrantyActionError('A warranty must be verified by someone other than the person who registered it.');
  }
  await prisma.warranty.update({ where: { id: warrantyId }, data: { status: 'ACTIVE', verifiedById: user.id, verifiedAt: new Date() } });
  await writeAuditLog({ userId: user.id, action: 'warranty.verified', entityType: 'Warranty', entityId: warrantyId, metadata: { warrantyNumber: w.warrantyNumber } });
}

/** Suspend, void, transfer or reinstate — always with a reason. */
export async function setWarrantyStatus(warrantyId: string, status: 'ACTIVE' | 'SUSPENDED' | 'VOID' | 'TRANSFERRED', reason: string): Promise<void> {
  const user = await requireWarrantyManager();
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
      policy: { select: { id: true, code: true, name: true, isSample: true, durationMonths: true, distanceLimit: true } },
      provider: { select: { id: true, name: true, type: true, contactName: true, email: true, phone: true } },
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
