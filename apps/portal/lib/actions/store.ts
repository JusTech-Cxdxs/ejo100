'use server';
import { actorLabel } from '@/lib/assist/rules';
import { parseSourceFilter, sourceWhere, type SOURCE_PARAMS } from '@/lib/source-filter';
import { importIdsFor } from '@/lib/source-filter-server';
import { portalBaseUrl, websiteBaseUrl } from '@/lib/portal-url';
import { logFailure } from '@/lib/log';

/**
 * Store server actions: part catalogue, units of measure, goods receipts,
 * Store matching and pricing alerts.
 *
 * Like workshop.ts, these call @ejo/database directly. Auth and audit
 * helpers are imported from workshop.ts so there is one copy of each.
 */

import { claimed } from '@/lib/integrity';
import { isUniqueClashOn, retryOnNumberClash } from '@/lib/integrity-core';
import { prisma, PartTrackingType, type Prisma } from '@ejo/database';
import { notifyWarrantyDepartmentOfPartWarranty } from '@/lib/warranty-department-notify';
import { loadQuantityTraces } from '@/lib/inventory/quantity-trace';
import { pluralize } from '@/lib/utils/pluralize';
import { markupToMargin, marginToMarkup, actualMargin, actualMarkup, MARGIN_TOLERANCE_PP, roundedPriceForTargetMargin } from '@/lib/pricing-math';
import { requireUser, currentUserIsMasterAdmin } from './workshop';
import { branchInMyOrganisationOrSystem, getStoreBranchIdForMe } from '@/lib/workshop-core';
import { writeAuditLog } from '@/lib/workshop-core';
import { allows, authorize, branchWithinReach, canSeeRecord, orgOwned, refuse, seeBranch, seeJobCard, seePart } from '@/lib/authz/server';
import { STORE_COST_PERMISSIONS, type PermissionKey } from '@/lib/authz/catalogue';
import { sendEmail } from '@/lib/email';
import { renderStaffGoodsReceiptRecordedEmail } from '@/lib/email-templates/staff-goods-receipt-recorded';
import { renderPricingAlertRaisedEmail } from '@/lib/email-templates/pricing-alert-raised';
import { renderPartTargetMarginSetEmail } from '@/lib/email-templates/part-target-margin-set';
import { renderStoreMatchingRequestedEmail, renderStoreMatchingStatusEmail } from '@/lib/email-templates/store-matching-status';
import { renderGoodsReceiptEditedEmail } from '@/lib/email-templates/goods-receipt-edited';
import { renderPartSellingPriceSetEmail } from '@/lib/email-templates/part-selling-price-set';
import { lagosYear } from '@/lib/utils/format-date';

class StoreActionError extends Error {}

type StorePermission = 'store.parts.manage' | 'store.matching' | 'store.grn.record' | 'store.prs.release';
const STORE_DENIED: Record<StorePermission, string> = {
  'store.parts.manage': 'Only Store staff can change parts, prices or stock levels.',
  'store.matching': 'Only Store staff can match estimate parts to stock.',
  'store.grn.record': 'Only Store staff can record a goods receipt.',
  'store.prs.release': 'Only Store staff can approve, reserve or release a parts request.',
};

/** Same as getWorkshopOrgContext() in workshop.ts, for the 'store' department. */
async function getStoreOrgContext(): Promise<{ companyName: string; branchName: string; departmentName: string }> {
  const department = await prisma.department.findFirstOrThrow({
    where: { slug: 'store' },
    select: {
      name: true,
      branch: {
        select: {
          name: true,
          businessUnit: { select: { organisation: { select: { name: true } } } },
        },
      },
    },
  });
  return {
    companyName: department.branch.businessUnit.organisation.name,
    branchName: department.branch.name,
    departmentName: department.name,
  };
}

/** The Store department's branch for the signed-in person. */
export async function getStoreBranchId(): Promise<string> {
  await requireUser();
  // This person's Store — never another organisation's (lib/workshop-core).
  const branchId = await getStoreBranchIdForMe();
  const department = branchId ? { branchId } : null;
  if (!department) {
    throw new StoreActionError('No branch has a Store department yet — run the seed script, or create one under Branches.');
  }
  return department.branchId;
}

export type EligibleStoreStaffResult = { staff: { id: string; fullName: string; email: string }[]; usingFallback: boolean };

/** Users holding `roleSlug` at the branch, falling back to Master Admins
 * so the list is never empty. Same pattern as listEligibleManagersForBranch(). */
async function listEligibleStoreStaffForBranch(branchId: string, roleSlug: string): Promise<EligibleStoreStaffResult> {
  await requireUser();
  const staff = await prisma.user.findMany({
    where: { branchId, isActive: true, roles: { some: { role: { slug: roleSlug } } } },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  if (staff.length > 0) {
    return { staff, usingFallback: false };
  }
  const masterAdmins = await prisma.user.findMany({
    where: { isActive: true, roles: { some: { role: { isSuperAdmin: true } } } },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  return { staff: masterAdmins, usingFallback: true };
}

export async function listEligibleStoreManagersForBranch(branchId: string): Promise<EligibleStoreStaffResult> {
  // Never another organisation's staff list (names and emails).
  if (!(await branchInMyOrganisationOrSystem(branchId))) return { staff: [], usingFallback: false };
  return listEligibleStoreStaffForBranch(branchId, 'store-manager');
}

export async function listEligibleStoreOfficersForBranch(branchId: string): Promise<EligibleStoreStaffResult> {
  // Never another organisation's staff list (names and emails).
  if (!(await branchInMyOrganisationOrSystem(branchId))) return { staff: [], usingFallback: false };
  return listEligibleStoreStaffForBranch(branchId, 'store-officer');
}

/** Gates Store work on the given permission (Store Manager/Officer by
 * default, plus Roles-page grants; Master Admin always), checked against the
 * branch that owns the record so one branch cannot change another's stock,
 * prices or receipts. */
export async function requireStoreStaff(branchId: string, key: StorePermission = 'store.grn.record'): Promise<{ id: string }> {
  const user = await requireUser();
  await authorize(key, { branchId, homeBranch: true }, `store:${key}`, STORE_DENIED[key]);
  return user;
}

/** GRN-2026-000001. Fixed-width, zero-padded, so a descending string sort
 * matches numeric order (same as generateJobNumber()). */
async function generateGoodsReceiptNumber(): Promise<string> {
  const year = lagosYear();
  const prefix = `GRN-${year}-`;
  const latest = await prisma.goodsReceipt.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: 'desc' },
    select: { referenceNumber: true },
  });
  const nextSequence = latest ? parseInt(latest.referenceNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

export type CreatePartInput = {
  branchId: string;
  name: string;
  description?: string;
  /** Category and partNumber are derived from the PartType, never typed in,
   * so every Part maps to a real PartType. */
  partTypeId: string;
  trackingType: 'QUANTITY' | 'BATCH' | 'SERIALIZED';
  baseUnitOfMeasure: string;
  reorderPoint?: number;
  safetyStock?: number;
  alternativeUnits?: { unitName: string; conversionFactor: number }[];
  /** null = no warranty; otherwise the policy each released unit is issued under. */
  warrantyPolicyId: string | null;
};

/** FLU-001, FIL-001. No year prefix: a part number is permanent. */
async function generatePartNumber(branchId: string, categoryCode: string): Promise<string> {
  const prefix = `${categoryCode}-`;
  const latest = await prisma.part.findFirst({
    where: { branchId, partNumber: { startsWith: prefix } },
    orderBy: { partNumber: 'desc' },
    select: { partNumber: true },
  });
  const parsedSequence = latest?.partNumber ? parseInt(latest.partNumber.slice(prefix.length), 10) : NaN;
  // Older free-text part numbers don't match the pattern; start from 1
  // rather than producing NaN.
  const nextSequence = Number.isFinite(parsedSequence) ? parsedSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(3, '0')}`;
}

/** Creates a catalogue part with a zeroed PartStock row, so receipt logic
 * can assume the row exists. */
export async function createPart(input: CreatePartInput): Promise<{ id: string }> {
  const user = await requireStoreStaff(input.branchId, 'store.parts.manage');
  const name = input.name.trim();
  if (!name) {
    throw new StoreActionError('Part name is required.');
  }
  const baseUnitOfMeasure = input.baseUnitOfMeasure.trim();
  if (!baseUnitOfMeasure) {
    throw new StoreActionError('Base unit of measure is required.');
  }
  if (!input.partTypeId) {
    throw new StoreActionError('Part Type is required.');
  }
  const partType = await prisma.partType.findUnique({
    where: { id: input.partTypeId },
    select: { branchId: true, name: true, category: { select: { name: true, code: true } } },
  });
  if (!partType) {
    throw new StoreActionError('That Part Type no longer exists.');
  }
  if (partType.branchId !== input.branchId) {
    throw new StoreActionError('This Part Type does not belong to this branch.');
  }
  if (!partType.category.code) {
    throw new StoreActionError(`"${partType.category.name}" has no Part Number prefix set yet — add one to that category before registering parts under it.`);
  }

  let warrantyPolicyName: string | null = null;
  if (input.warrantyPolicyId) {
    const policy = await prisma.warrantyPolicy.findFirst({ where: { ...(await orgOwned()), id: input.warrantyPolicyId }, select: { name: true, kind: true, isActive: true, archivedAt: true } });
    if (!policy || policy.kind !== 'PART' || !policy.isActive || policy.archivedAt) {
      throw new StoreActionError('Choose an active part warranty policy (or "No warranty").');
    }
    warrantyPolicyName = policy.name;
  }

  const generatedPartNumber = await generatePartNumber(input.branchId, partType.category.code);

  const part = await prisma.$transaction(async (tx) => {
    const partNumber = generatedPartNumber;
    const created = await tx.part.create({
      data: {
        branchId: input.branchId,
        name,
        description: input.description?.trim() || undefined,
        category: partType.category.name,
        partTypeId: input.partTypeId,
        partNumber,
        trackingType: input.trackingType as PartTrackingType,
        baseUnitOfMeasure,
        reorderPoint: input.reorderPoint,
        safetyStock: input.safetyStock,
        warrantyPolicyId: input.warrantyPolicyId,
        createdById: user.id,
      },
    });
    await tx.partStock.create({ data: { partId: created.id, quantityOnHand: 0, quantityReserved: 0 } });
    if (input.alternativeUnits && input.alternativeUnits.length > 0) {
      for (const unit of input.alternativeUnits) {
        const unitName = unit.unitName.trim();
        if (!unitName || !(unit.conversionFactor > 0)) continue;
        await tx.partUnitOfMeasure.create({
          data: { partId: created.id, unitName, conversionFactor: unit.conversionFactor },
        });
      }
    }
    return created;
  });

  await writeAuditLog({
    userId: user.id,
    action: 'part.created',
    entityType: 'Part',
    entityId: part.id,
    metadata: { name, partNumber: part.partNumber, trackingType: input.trackingType, baseUnitOfMeasure, warranty: warrantyPolicyName ?? 'None' },
  });
  // The warranty department hears about every new part that carries a warranty.
  if (input.warrantyPolicyId) {
    await notifyWarrantyDepartmentOfPartWarranty({ partId: part.id, previousPolicyId: null, actorId: user.id, context: 'CREATED' });
  }

  return { id: part.id };
}

export type UpdatePartInput = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  partNumber?: string;
  reorderPoint?: number;
  safetyStock?: number;
};

/** Edits descriptive fields only. trackingType and baseUnitOfMeasure are
 * fixed for the life of the part: existing stock, batch and receipt rows are
 * recorded in the original unit. */
export async function updatePart(input: UpdatePartInput): Promise<void> {
  const part = await prisma.part.findUnique({ where: { id: input.id }, select: { branchId: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId, 'store.parts.manage');
  const name = input.name.trim();
  if (!name) {
    throw new StoreActionError('Part name is required.');
  }
  await prisma.part.update({
    where: { id: input.id },
    data: {
      name,
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      partNumber: input.partNumber?.trim() || null,
      reorderPoint: input.reorderPoint,
      safetyStock: input.safetyStock,
    },
  });
  await writeAuditLog({ userId: user.id, action: 'part.updated', entityType: 'Part', entityId: input.id, metadata: { name } });
}

/** Sets the price charged to customers. Kept separate from cost and never
 * defaulted from the last receipt cost; Store matching prices lines from
 * this field only. */
export async function setPartSellingPrice(partId: string, sellingPrice: number): Promise<void> {
  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: {
      branchId: true,
      name: true,
      sellingPrice: true,
      baseUnitOfMeasure: true,
      targetMarginPercent: true,
      // Latest delivery, the same source the Selling Price Calculator uses.
      goodsReceiptLines: {
        orderBy: { goodsReceipt: { receivedAt: 'desc' } },
        take: 1,
        select: { quantityInBaseUnit: true, totalCost: true, unitCost: true },
      },
    },
  });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId, 'store.parts.manage');
  if (!(sellingPrice > 0)) {
    throw new StoreActionError('Selling price must be greater than zero.');
  }
  const previousSellingPrice = part.sellingPrice !== null ? Number(part.sellingPrice) : null;
  await prisma.part.update({ where: { id: partId }, data: { sellingPrice } });
  await writeAuditLog({
    userId: user.id,
    action: 'part.selling_price_set',
    entityType: 'Part',
    entityId: partId,
    metadata: { name: part.name, from: previousSellingPrice, to: sellingPrice },
  });

  try {
    const lastReceipt = part.goodsReceiptLines[0];
    const targetMarginPercent = part.targetMarginPercent !== null ? Number(part.targetMarginPercent) : null;
    const margin =
      lastReceipt && lastReceipt.totalCost !== null
        ? (() => {
            const quantityInBaseUnit = Number(lastReceipt.quantityInBaseUnit);
            const totalBulkCost = Number(lastReceipt.totalCost);
            const expectedRevenue = Math.round(sellingPrice * quantityInBaseUnit * 100) / 100;
            const grossProfit = Math.round((expectedRevenue - totalBulkCost) * 100) / 100;
            const unitCost = lastReceipt.unitCost !== null ? Number(lastReceipt.unitCost) : null;
            const markupPercent = unitCost !== null && unitCost > 0 ? actualMarkup(unitCost, sellingPrice) : null;
            const marginPercent = unitCost !== null ? actualMargin(unitCost, sellingPrice) : null;
            return { quantityInBaseUnit, totalBulkCost, expectedRevenue, grossProfit, markupPercent, marginPercent };
          })()
        : null;

    const [officers, managers, setByUser] = await Promise.all([
      listEligibleStoreOfficersForBranch(part.branchId),
      listEligibleStoreManagersForBranch(part.branchId),
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
    ]);
    const recipients = new Map<string, { fullName: string; email: string }>();
    for (const staffMember of [...officers.staff, ...managers.staff]) {
      recipients.set(staffMember.id, staffMember);
    }
    const orgContext = await getStoreOrgContext();
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    for (const recipient of recipients.values()) {
      await sendEmail(
        recipient.email,
        `Selling price ${previousSellingPrice === null ? 'set' : 'updated'} — ${part.name}`,
        renderPartSellingPriceSetEmail({
          recipientName: recipient.fullName,
          setByName: setByUser?.fullName ?? 'A team member',
          partName: part.name,
          baseUnitOfMeasure: part.baseUnitOfMeasure,
          previousSellingPrice,
          newSellingPrice: sellingPrice,
          margin,
          targetMarginPercent,
          partUrl: `${portalUrl}/inventory/parts/${partId}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send selling price notification emails', partId, err);
  }
}

/** The margin Store wants to hold on this part; new delivery costs are
 * compared against it to raise pricing alerts. */
/** Accepts the target as margin or markup and stores it as margin, using
 * the shared formula in pricing-math.ts. Every later pricing alert depends
 * on this conversion. */
export async function setPartTargetMargin(partId: string, targetValue: number, pricingMethod: 'MARGIN' | 'MARKUP'): Promise<void> {
  const part = await prisma.part.findUnique({ where: { id: partId }, select: { branchId: true, name: true, targetMarginPercent: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId, 'store.parts.manage');
  if (!(targetValue > 0) || targetValue > (pricingMethod === 'MARGIN' ? 100 : 100000)) {
    throw new StoreActionError(
      pricingMethod === 'MARGIN'
        ? 'Target Margin must be a percentage greater than 0 and no more than 100.'
        : 'Target Markup must be a percentage greater than 0.',
    );
  }
  const targetMarginPercent = pricingMethod === 'MARGIN' ? targetValue : markupToMargin(targetValue);
  const previousTargetMarginPercent = part.targetMarginPercent !== null ? Number(part.targetMarginPercent) : null;
  await prisma.part.update({ where: { id: partId }, data: { targetMarginPercent, pricingMethod } });
  await writeAuditLog({
    userId: user.id,
    action: 'part.target_margin_set',
    entityType: 'Part',
    entityId: partId,
    metadata: {
      name: part.name,
      from: previousTargetMarginPercent,
      to: Math.round(targetMarginPercent * 100) / 100,
      enteredAs: pricingMethod,
      enteredValue: targetValue,
    },
  });

  // Notify Store of the new target. Email failures never block the save.
  try {
    const [officers, managers, setByUser] = await Promise.all([
      listEligibleStoreOfficersForBranch(part.branchId),
      listEligibleStoreManagersForBranch(part.branchId),
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
    ]);
    const recipients = new Map<string, { fullName: string; email: string }>();
    for (const staffMember of [...officers.staff, ...managers.staff]) {
      recipients.set(staffMember.id, staffMember);
    }
    const orgContext = await getStoreOrgContext();
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    const equivalentMarkup = marginToMarkup(targetMarginPercent);
    for (const recipient of recipients.values()) {
      await sendEmail(
        recipient.email,
        `Target pricing updated — ${part.name}`,
        renderPartTargetMarginSetEmail({
          recipientName: recipient.fullName,
          setByName: setByUser?.fullName ?? 'A team member',
          partName: part.name,
          previousTargetMarginPercent,
          newTargetMarginPercent: Math.round(targetMarginPercent * 100) / 100,
          newTargetMarkupPercent: equivalentMarkup !== null ? Math.round(equivalentMarkup * 100) / 100 : 0,
          enteredAs: pricingMethod,
          enteredValue: targetValue,
          partUrl: `${portalUrl}/inventory/parts/${partId}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send target-margin-set notification emails', partId, err);
  }
}

/** Replaces the part's full set of alternative units, so a correction
 * (e.g. a drum that is 205 L, not 208 L) never leaves the old unit behind. */
export async function setPartAlternativeUnits(
  partId: string,
  units: { unitName: string; conversionFactor: number }[],
): Promise<void> {
  const part = await prisma.part.findUnique({ where: { id: partId }, select: { branchId: true, baseUnitOfMeasure: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId, 'store.parts.manage');
  const cleaned = units
    .map((u) => ({ unitName: u.unitName.trim(), conversionFactor: u.conversionFactor }))
    .filter((u) => u.unitName && u.conversionFactor > 0);
  for (const u of cleaned) {
    if (u.unitName === part.baseUnitOfMeasure) {
      throw new StoreActionError(`"${u.unitName}" is already this part's base unit — an alternative unit must be different.`);
    }
  }
  const names = cleaned.map((u) => u.unitName);
  if (new Set(names).size !== names.length) {
    throw new StoreActionError('Each alternative unit name must be unique for this part.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.partUnitOfMeasure.deleteMany({ where: { partId } });
    for (const u of cleaned) {
      await tx.partUnitOfMeasure.create({ data: { partId, unitName: u.unitName, conversionFactor: u.conversionFactor } });
    }
  });
  await writeAuditLog({ userId: user.id, action: 'part.alternative_units_updated', entityType: 'Part', entityId: partId, metadata: { units: cleaned } });
}

export type CreatePartFitmentInput = {
  partId: string;
  make: string;
  model?: string;
  engineType?: string;
  yearFrom?: number;
  yearTo?: number;
};

/** Records a vehicle configuration the part fits. A part with no fitment
 * rows fits every vehicle (see getFittingPartsForVehicle), so only
 * vehicle-specific parts need rows. */
export async function createPartFitment(input: CreatePartFitmentInput): Promise<{ id: string }> {
  const part = await prisma.part.findUnique({ where: { id: input.partId }, select: { branchId: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId, 'store.parts.manage');
  const make = input.make.trim();
  const model = input.model?.trim() || null;
  const engineType = input.engineType?.trim() || null;
  if (!make) {
    throw new StoreActionError('Make is required.');
  }
  // Engine and year range only make sense once a model is set.
  if (!model && engineType) {
    throw new StoreActionError('Set a Model before adding an Engine.');
  }
  if (!model && (input.yearFrom || input.yearTo)) {
    throw new StoreActionError('Set a Model before adding a Year range.');
  }
  const fitment = await prisma.partFitment.create({
    data: {
      partId: input.partId,
      make,
      model,
      engineType: engineType ?? undefined,
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
    },
  });
  await writeAuditLog({ userId: user.id, action: 'part.fitment_added', entityType: 'Part', entityId: input.partId, metadata: { make, model, engineType } });
  return { id: fitment.id };
}

/** Edits a fitment row in place, keeping its createdAt and audit history. */
export type UpdatePartFitmentInput = {
  make: string;
  model?: string;
  engineType?: string;
  yearFrom?: number;
  yearTo?: number;
};

export async function updatePartFitment(fitmentId: string, input: UpdatePartFitmentInput): Promise<void> {
  const fitment = await prisma.partFitment.findUnique({ where: { id: fitmentId }, select: { partId: true, part: { select: { branchId: true } } } });
  if (!fitment) {
    throw new StoreActionError('Fitment record not found.');
  }
  const user = await requireStoreStaff(fitment.part.branchId, 'store.parts.manage');
  const make = input.make.trim();
  const model = input.model?.trim() || null;
  const engineType = input.engineType?.trim() || null;
  if (!make) {
    throw new StoreActionError('Make is required.');
  }
  // Same rule as createPartFitment: clearing the model is refused only if an
  // engine or year range would be left behind.
  if (!model && engineType) {
    throw new StoreActionError('Set a Model before adding an Engine.');
  }
  if (!model && (input.yearFrom || input.yearTo)) {
    throw new StoreActionError('Set a Model before adding a Year range.');
  }
  await prisma.partFitment.update({
    where: { id: fitmentId },
    data: {
      make,
      model,
      engineType,
      yearFrom: input.yearFrom ?? null,
      yearTo: input.yearTo ?? null,
    },
  });
  await writeAuditLog({ userId: user.id, action: 'part.fitment_updated', entityType: 'Part', entityId: fitment.partId, metadata: { make, model, engineType } });
}

export async function deletePartFitment(fitmentId: string): Promise<void> {
  const fitment = await prisma.partFitment.findUnique({ where: { id: fitmentId }, select: { partId: true, make: true, model: true, part: { select: { branchId: true } } } });
  if (!fitment) {
    throw new StoreActionError('Fitment record not found.');
  }
  const user = await requireStoreStaff(fitment.part.branchId, 'store.parts.manage');
  await prisma.partFitment.delete({ where: { id: fitmentId } });
  await writeAuditLog({ userId: user.id, action: 'part.fitment_removed', entityType: 'Part', entityId: fitment.partId, metadata: { make: fitment.make, model: fitment.model } });
}

export async function listPartFitments(partId: string) {
  await requireUser();
  await seePart(partId, 'listPartFitments');
  return prisma.partFitment.findMany({ where: { partId }, orderBy: { createdAt: 'asc' } });
}

/** A part with no fitment rows fits every vehicle. Otherwise at least one
 * row must match make and model, plus engine and year range when the row
 * sets them. An unset engine or year on a row means "any". */
export async function getFittingPartsForVehicle(
  branchId: string,
  vehicle: { make?: string | null; model?: string | null; engineType?: string | null; year?: number | null },
  search?: string,
  partTypeId?: string,
) {
  await requireUser();
  // A branch asked for by the browser is honoured only within reach.
  branchId = await branchWithinReach('store.view', branchId);
  const q = search?.trim();
  const parts = await prisma.part.findMany({
    where: {
      branchId,
      isActive: true,
      ...(partTypeId ? { partTypeId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { partNumber: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    include: { stock: true, fitments: true },
  });

  const make = vehicle.make?.trim();
  const model = vehicle.model?.trim();

  return parts.filter((part: (typeof parts)[number]) => {
    if (part.fitments.length === 0) return true;
    if (!make || !model) return false;
    return part.fitments.some((f: (typeof part.fitments)[number]) => {
      if (f.make !== make || f.model !== model) return false;
      if (f.engineType && f.engineType !== vehicle.engineType) return false;
      if (f.yearFrom && (!vehicle.year || vehicle.year < f.yearFrom)) return false;
      if (f.yearTo && (!vehicle.year || vehicle.year > f.yearTo)) return false;
      return true;
    });
  });
}

export async function createPartCategory(branchId: string, name: string, code: string, description?: string): Promise<{ id: string }> {
  const user = await requireStoreStaff(branchId, 'store.parts.manage');
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new StoreActionError('Part Category name is required.');
  }
  // Becomes a part number prefix (e.g. "FIL-001"): uppercase letters and digits only.
  const trimmedCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!trimmedCode) {
    throw new StoreActionError('A short code is required — this becomes every Part Number\'s prefix under this category (e.g. "FIL" → FIL-001).');
  }
  const category = await prisma.partCategory.create({
    data: { branchId, name: trimmedName, code: trimmedCode, description: description?.trim() || undefined, createdById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: 'part_category.created', entityType: 'PartCategory', entityId: category.id, metadata: { name: trimmedName, code: trimmedCode } });
  return { id: category.id };
}

export async function listPartCategories(branchId: string) {
  await requireUser();
  branchId = await branchWithinReach('store.view', branchId);
  return prisma.partCategory.findMany({ where: { branchId }, orderBy: { name: 'asc' } });
}

/** The kind of part a technician picks (e.g. "Fuel Filter"), always under
 * one PartCategory (e.g. "Filter"). */
export async function createPartType(branchId: string, categoryId: string, name: string, description?: string): Promise<{ id: string }> {
  const user = await requireStoreStaff(branchId, 'store.parts.manage');
  const category = await prisma.partCategory.findUnique({ where: { id: categoryId }, select: { branchId: true } });
  if (!category) {
    throw new StoreActionError('Part Category not found.');
  }
  if (category.branchId !== branchId) {
    throw new StoreActionError('This Part Category does not belong to this branch.');
  }
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new StoreActionError('Part Type name is required.');
  }
  const partType = await prisma.partType.create({
    data: { branchId, categoryId, name: trimmedName, description: description?.trim() || undefined, createdById: user.id },
  });
  await writeAuditLog({ userId: user.id, action: 'part_type.created', entityType: 'PartType', entityId: partType.id, metadata: { name: trimmedName, categoryId } });
  return { id: partType.id };
}

/** The generic catalogue technicians search when adding a STORE_PART line.
 * Separate from listParts(): technicians see "Fuel Filter", never a
 * vehicle-specific variant. Each result carries its category name. */
export async function listPartTypes(branchId: string, search?: string) {
  await requireUser();
  branchId = await branchWithinReach('store.view', branchId);
  const q = search?.trim();
  const types = await prisma.partType.findMany({
    where: {
      branchId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { category: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    include: {
      category: { select: { id: true, name: true } },
      // Only used for typicalUnit below.
      parts: { where: { isActive: true }, select: { baseUnitOfMeasure: true } },
    },
  });
  return types.map((t: (typeof types)[number]) => {
    const distinctUnits = new Set(t.parts.map((p: (typeof t.parts)[number]) => p.baseUnitOfMeasure));
    return {
      ...t,
      // Shown only when every part under the type agrees; null when there are
      // none or they differ.
      typicalUnit: distinctUnits.size === 1 ? ([...distinctUnits][0] ?? null) : null,
    };
  });
}

/** listPartTypes() flattened to {value, label, sublabel} for SearchableSelect. */
export async function searchPartTypesForSelect(branchId: string, query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  branchId = await branchWithinReach('store.view', branchId);
  const types = await listPartTypes(branchId, query);
  return types.map((t: (typeof types)[number]) => ({ value: t.id, label: t.name, sublabel: t.category.name }));
}

/** Every Part Type at the branch, shown before the person types. */
export async function listAllPartTypesForSelect(branchId: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  branchId = await branchWithinReach('store.view', branchId);
  return searchPartTypesForSelect(branchId, '');
}

export async function searchPartCategoriesForSelect(branchId: string, query: string): Promise<{ value: string; label: string }[]> {
  branchId = await branchWithinReach('store.view', branchId);
  const categories = await listPartCategories(branchId);
  const q = query.trim().toLowerCase();
  const filtered = q ? categories.filter((c: (typeof categories)[number]) => c.name.toLowerCase().includes(q)) : categories;
  return filtered.map((c: (typeof categories)[number]) => ({ value: c.id, label: c.name }));
}

export async function listAllPartCategoriesForSelect(branchId: string): Promise<{ value: string; label: string }[]> {
  branchId = await branchWithinReach('store.view', branchId);
  return searchPartCategoriesForSelect(branchId, '');
}

/** Unit cost from the most recent goods receipt that recorded one, or null
 * if the part has no cost on record (never zero). */
export async function getLastKnownUnitCostForPart(partId: string): Promise<number | null> {
  await requireUser();
  await seePart(partId, 'getLastKnownUnitCostForPart');
  const line = await prisma.goodsReceiptLine.findFirst({
    where: { partId, unitCost: { not: null } },
    orderBy: { goodsReceipt: { receivedAt: 'desc' } },
    select: { unitCost: true },
  });
  return line ? Number(line.unitCost) : null;
}

/** Store matching: links a technician's generic request (a PartType) to a
 * catalogue Part that fits the vehicle, priced from the part's selling
 * price. Lives here rather than in workshop.ts because store.ts already
 * imports from workshop.ts; this avoids a circular import. */
/** Store Part lines at the branch whose estimate has been sent for matching
 * and that are not matched yet, with the vehicle details the fitment check
 * needs. */
export async function listUnmatchedStorePartLines(branchId: string) {
  await requireUser();
  branchId = await branchWithinReach('store.view', branchId);
  return prisma.estimateLineItem.findMany({
    where: {
      type: 'STORE_PART',
      matchedPartId: null,
      // DRAFT is allowed (matching must happen before submission), but only
      // estimates a technician has sent for matching appear here.
      estimate: { status: { in: ['DRAFT', 'SUBMITTED'] }, matchingRequestedAt: { not: null }, jobCard: { branchId } },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      partType: { select: { id: true, name: true, category: { select: { name: true } } } },
      estimate: {
        select: {
          jobCard: {
            select: {
              id: true,
              jobNumber: true,
              vehicle: { select: { id: true, make: true, model: true, engineType: true, year: true } },
            },
          },
        },
      },
    },
  });
}

/** listUnmatchedStorePartLines() for a single Job Card. */
export async function listUnmatchedStorePartLinesForJobCard(jobCardId: string) {
  await requireUser();
  await seeJobCard(jobCardId, 'listUnmatchedStorePartLinesForJobCard');
  return prisma.estimateLineItem.findMany({
    where: {
      type: 'STORE_PART',
      matchedPartId: null,
      estimate: { status: { in: ['DRAFT', 'SUBMITTED'] }, matchingRequestedAt: { not: null }, jobCardId },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      partType: { select: { id: true, name: true, category: { select: { name: true } } } },
    },
  });
}

/** Asks Store to match this Job Card's unmatched Store Part lines.
 * An estimate cannot be submitted until every line is priced, and Store
 * Part lines are priced by matching, so this is how a draft gets unblocked.
 * Notifies Store with this Job Card's lines only. Can be called again;
 * matchingRequestedAt is refreshed. */
export async function requestStoreMatching(jobCardId: string, note?: string): Promise<void> {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      branchId: true,
      jobNumber: true,
      supervisorId: true,
      assignedTechnicianId: true,
      customer: { select: { fullName: true } },
      estimate: {
        select: {
          id: true,
          lineItems: {
            where: { type: 'STORE_PART', matchedPartId: null },
            select: {
              description: true,
              quantity: true,
              // Preview only: the unit of the first active part under this type.
              partType: { select: { parts: { where: { isActive: true }, take: 1, select: { baseUnitOfMeasure: true } } } },
            },
          },
        },
      },
    },
  });
  if (!jobCard) {
    throw new StoreActionError('Job Card not found.');
  }
  if (!jobCard.estimate) {
    throw new StoreActionError('This Job Card has no estimate yet.');
  }
  if (jobCard.estimate.lineItems.length === 0) {
    throw new StoreActionError('There are no Store Part lines currently awaiting a match.');
  }
  const user = await requireUser();
  const isMasterAdmin = await currentUserIsMasterAdmin();
  if (jobCard.supervisorId !== user.id && jobCard.assignedTechnicianId !== user.id && !isMasterAdmin) {
    return refuse('workshop.estimate.edit', 'requestStoreMatching', 'Only the assigned supervisor or the assigned technician can request Store matching.');
  }

  await prisma.estimate.update({
    where: { id: jobCard.estimate.id },
    data: { matchingRequestedAt: new Date(), matchingRequestedById: user.id },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate.store_matching_requested',
    entityType: 'JobCard',
    entityId: jobCardId,
    metadata: { lineCount: jobCard.estimate.lineItems.length, note: note?.trim() || undefined },
  });

  try {
    const [storeOfficers, storeManagers, requestedByUser] = await Promise.all([
      listEligibleStoreOfficersForBranch(jobCard.branchId),
      listEligibleStoreManagersForBranch(jobCard.branchId),
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
    ]);
    const storeRecipients = new Map<string, { fullName: string; email: string }>();
    for (const staffMember of [...storeOfficers.staff, ...storeManagers.staff]) {
      storeRecipients.set(staffMember.id, staffMember);
    }
    const orgContext = await getStoreOrgContext();
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;

    for (const recipient of storeRecipients.values()) {
      await sendEmail(
        recipient.email,
        `Please match parts — Job Card ${jobCard.jobNumber}`,
        renderStoreMatchingRequestedEmail({
          recipientName: recipient.fullName,
          requestedByName: requestedByUser?.fullName ?? 'A team member',
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          lines: jobCard.estimate.lineItems.map((l: { description: string; quantity: unknown; partType: { parts: { baseUnitOfMeasure: string }[] } | null }) => ({
            description: l.description,
            quantity: Number(l.quantity),
            unit: l.partType?.parts[0]?.baseUnitOfMeasure ?? null,
          })),
          note,
          matchingUrl: `${portalUrl}/inventory/estimate-matching`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }

    const statusRecipientIds = [jobCard.supervisorId, jobCard.assignedTechnicianId].filter((id): id is string => Boolean(id));
    const statusRecipients = await prisma.user.findMany({ where: { id: { in: statusRecipientIds } }, select: { id: true, fullName: true, email: true } });
    for (const recipient of statusRecipients) {
      await sendEmail(
        recipient.email,
        `Waiting for Store to match parts — Job Card ${jobCard.jobNumber}`,
        renderStoreMatchingStatusEmail({
          recipientName: recipient.fullName,
          kind: 'awaiting',
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          note,
          jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCardId}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send Store matching request emails', jobCardId, err);
  }
}

/** Store's "matching done" signal. Requires no unmatched lines left.
 * Repeatable. */
/** Sends the "matching complete" notification. Called automatically when the
 * last line is matched, and from the manual action. The caller has already
 * checked Store permissions. */
async function sendStoreMatchingCompleteNotification(
  jobCard: {
    id: string;
    jobNumber: string;
    supervisorId: string | null;
    assignedTechnicianId: string | null;
    customer: { fullName: string };
  },
  userId: string,
  note?: string,
): Promise<void> {
  await writeAuditLog({
    userId,
    action: 'estimate.store_matching_completed',
    entityType: 'JobCard',
    entityId: jobCard.id,
    metadata: { note: note?.trim() || undefined },
  });

  try {
    const orgContext = await getStoreOrgContext();
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    const statusRecipientIds = [jobCard.supervisorId, jobCard.assignedTechnicianId].filter((id): id is string => Boolean(id));
    const statusRecipients = await prisma.user.findMany({ where: { id: { in: statusRecipientIds } }, select: { fullName: true, email: true } });
    for (const recipient of statusRecipients) {
      await sendEmail(
        recipient.email,
        `Store matching complete — Job Card ${jobCard.jobNumber}`,
        renderStoreMatchingStatusEmail({
          recipientName: recipient.fullName,
          kind: 'complete',
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          note,
          jobCardUrl: `${portalUrl}/workshop/job-cards/${jobCard.id}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send Store matching complete emails', jobCard.id, err);
  }
}

/** Whether the Job Card still has unmatched Store Part lines. Checked fresh
 * after each match, since that match may have been the last one. */
export async function jobCardHasUnmatchedStoreParts(jobCardId: string): Promise<boolean> {
  await requireUser();
  await seeJobCard(jobCardId, 'jobCardHasUnmatchedStoreParts');
  const remaining = await prisma.estimateLineItem.count({
    where: { estimate: { jobCardId }, type: 'STORE_PART', matchedPartId: null },
  });
  return remaining > 0;
}

export async function matchEstimateStorePartLine(lineItemId: string, partId: string): Promise<void> {
  const lineItem = await prisma.estimateLineItem.findUnique({
    where: { id: lineItemId },
    select: {
      type: true,
      quantity: true,
      partTypeId: true,
      estimate: {
        select: {
          id: true,
          status: true,
          jobCard: {
            select: {
              id: true,
              jobNumber: true,
              branchId: true,
              supervisorId: true,
              assignedTechnicianId: true,
              customer: { select: { fullName: true } },
              vehicle: { select: { make: true, model: true, engineType: true, year: true } },
            },
          },
        },
      },
    },
  });
  if (!lineItem) {
    throw new StoreActionError('Estimate line not found.');
  }
  if (lineItem.type !== 'STORE_PART') {
    throw new StoreActionError('Only a Store Part line can be matched to a catalog Part.');
  }
  // DRAFT is allowed as well as SUBMITTED: submission requires every line to
  // be priced, so matching has to be possible before it.
  if (lineItem.estimate.status !== 'DRAFT' && lineItem.estimate.status !== 'SUBMITTED') {
    throw new StoreActionError('This estimate is not currently awaiting Store matching.');
  }
  const user = await requireStoreStaff(lineItem.estimate.jobCard.branchId, 'store.matching');

  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: {
      branchId: true, partTypeId: true, name: true, baseUnitOfMeasure: true, sellingPrice: true,
      fitments: { select: { make: true, model: true, engineType: true, yearFrom: true, yearTo: true } },
    },
  });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  if (part.branchId !== lineItem.estimate.jobCard.branchId) {
    throw new StoreActionError('This Part does not belong to the same branch as this Job Card.');
  }
  // A part with no fitment rows is universal and always allowed. A part with
  // fitment rows can only be matched to a vehicle on that list; this is a
  // hard block, not a warning.
  if (part.fitments.length > 0) {
    const vehicle = lineItem.estimate.jobCard.vehicle;
    // Without make/model on the vehicle the check cannot run; let it through
    // rather than blocking Store for an incomplete vehicle record.
    const canCheck = vehicle?.make && vehicle?.model;
    const fits = !canCheck || part.fitments.some((f: { make: string; model: string | null; engineType: string | null; yearFrom: number | null; yearTo: number | null }) => {
      if (f.make.toLowerCase() !== vehicle!.make!.toLowerCase()) return false;
      // Null model means "fits every model of this make".
      if (f.model && f.model.toLowerCase() !== vehicle!.model!.toLowerCase()) return false;
      if (f.engineType && vehicle!.engineType && f.engineType.toLowerCase() !== vehicle!.engineType.toLowerCase()) return false;
      if (f.engineType && !vehicle!.engineType) return false;
      if (vehicle!.year !== null) {
        if (f.yearFrom !== null && vehicle!.year < f.yearFrom) return false;
        if (f.yearTo !== null && vehicle!.year > f.yearTo) return false;
      }
      return true;
    });
    if (!fits) {
      const vehicleLabel = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'this Job Card\'s own vehicle';
      throw new StoreActionError(
        `${part.name} is only recorded to fit specific vehicles, and ${vehicleLabel} isn't one of them. If it does fit, add ${vehicleLabel} to the part's Vehicle Fitment list first.`,
      );
    }
  }
  if (lineItem.partTypeId && part.partTypeId !== lineItem.partTypeId) {
    throw new StoreActionError(`${part.name} is not the requested Part Type for this line.`);
  }

  // Priced from sellingPrice only, never from receipt cost. No fallback.
  if (part.sellingPrice === null) {
    throw new StoreActionError(`${part.name} has no selling price set yet — set one on the Part's own page before matching.`);
  }
  // Hard stop: a part with an open CRITICAL_LOSS alert (priced below cost)
  // cannot be matched onto an estimate. Resolved or dismissed alerts don't block.
  const openCriticalLoss = await prisma.pricingAlert.findFirst({
    where: { partId, severity: 'CRITICAL_LOSS', status: 'OPEN' },
    select: { id: true },
  });
  if (openCriticalLoss) {
    throw new StoreActionError(`${part.name} is priced below cost. Resolve the open Pricing Alert on this part before matching it to an estimate.`);
  }
  const unitPrice = Number(part.sellingPrice);
  const amount = Math.round(unitPrice * lineItem.quantity * 100) / 100;

  await prisma.$transaction(async (tx) => {
    // Only while the estimate is still in the status checked above (row
    // lock + compare-and-set): a concurrent approval wins and this match stops,
    // so an approved price never changes underneath.
    claimed(await tx.estimate.updateMany({ where: { id: lineItem.estimate.id, status: lineItem.estimate.status }, data: { status: lineItem.estimate.status } }),
      'This estimate was just approved or changed by someone else — refresh the page.');
    await tx.estimateLineItem.update({
      where: { id: lineItemId },
      // Unit always comes from the matched part's base unit.
      data: { matchedPartId: partId, unitPrice, amount, unitOfMeasure: part.baseUnitOfMeasure },
    });
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate_line.store_matched',
    entityType: 'EstimateLineItem',
    entityId: lineItemId,
    metadata: { partId, partName: part.name, unitPrice, amount },
  });
  // Also log against the Job Card so matching shows on its timeline.
  await writeAuditLog({
    userId: user.id,
    action: 'estimate_line.store_matched',
    entityType: 'JobCard',
    entityId: lineItem.estimate.jobCard.id,
    metadata: { partName: part.name, unitPrice, amount },
  });

  // When nothing is left unmatched, notify automatically. Counted after this
  // match because this match may have been the last one.
  const remainingUnmatched = await prisma.estimateLineItem.count({
    where: { estimateId: lineItem.estimate.id, type: 'STORE_PART', matchedPartId: null },
  });
  if (remainingUnmatched === 0) {
    await sendStoreMatchingCompleteNotification(lineItem.estimate.jobCard, user.id);
  }
}

// A 'use server' file exports only async functions: the page size stays private.
const PARTS_PAGE_SIZE = 50;

/**
 * One page of the branch's catalogue (newest search first, by name), with the
 * total — a catalogue of hundreds of thousands of SAP materials never loads
 * whole into a page.
 */
export async function listPartsPage(branchId: string, search: string | undefined, page: number, origin: Partial<Record<(typeof SOURCE_PARAMS)[number], string>> = {}): Promise<{ parts: Awaited<ReturnType<typeof listParts>>; total: number; page: number; pages: number }> {
  await requireUser();
  branchId = await branchWithinReach('store.view', branchId);
  const q = search?.trim();
  // Where each part came from (created here or imported from the SAP material master) and when it entered EJO.
  const sf = parseSourceFilter(origin);
  const org = (await prisma.branch.findUnique({ where: { id: branchId }, select: { businessUnit: { select: { organisationId: true } } } }))?.businessUnit.organisationId ?? null;
  const where: Prisma.PartWhereInput = {
    branchId,
    isActive: true,
    ...(sourceWhere(sf, await importIdsFor(org, sf)) as Prisma.PartWhereInput),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { partNumber: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }, { barcode: { equals: q } }] } : {}),
  };
  const total = await prisma.part.count({ where });
  const pages = Math.max(1, Math.ceil(total / PARTS_PAGE_SIZE));
  const p = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const parts = await prisma.part.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (p - 1) * PARTS_PAGE_SIZE, take: PARTS_PAGE_SIZE, include: { stock: true, alternativeUnits: true } });
  return { parts, total, page: p, pages };
}

/**
 * Parts for the goods-receipt picker, as the person types (at most 25, with
 * their units and tracking) — or the 25 most recently changed when nothing is
 * typed. Never the whole catalogue in the browser.
 */
export async function searchPartsForReceipt(branchId: string, search: string): Promise<{ id: string; name: string; partNumber: string | null; trackingType: string; baseUnitOfMeasure: string; alternativeUnits: { unitName: string; conversionFactor: string }[] }[]> {
  await requireUser();
  await authorize('store.grn.record', undefined, 'searchPartsForReceipt');
  branchId = await branchWithinReach('store.view', branchId);
  const q = String(search ?? '').trim().slice(0, 80);
  const rows = await prisma.part.findMany({
    where: { branchId, isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { partNumber: { contains: q, mode: 'insensitive' } }, { barcode: { equals: q } }] } : {}) },
    orderBy: q ? [{ name: 'asc' }] : [{ updatedAt: 'desc' }],
    take: 25,
    select: { id: true, name: true, partNumber: true, trackingType: true, baseUnitOfMeasure: true, alternativeUnits: { select: { unitName: true, conversionFactor: true } } },
  });
  return rows.map((p) => ({ ...p, alternativeUnits: p.alternativeUnits.map((u) => ({ unitName: u.unitName, conversionFactor: String(u.conversionFactor) })) }));
}

/**
 * The branch's parts that are out of stock or at / below their reorder point
 * (worst first, at most 300) — found by the database, so a catalogue of any
 * size is never read whole.
 */
export async function listLowStockParts(branchId: string) {
  await requireUser();
  branchId = await branchWithinReach('store.view', branchId);
  const low = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM parts p LEFT JOIN part_stock s ON s."partId" = p.id
     WHERE p."branchId" = ${branchId} AND p."isActive"
       AND (COALESCE(s."quantityOnHand", 0) - COALESCE(s."quantityReserved", 0) <= 0
            OR (p."reorderPoint" IS NOT NULL AND COALESCE(s."quantityOnHand", 0) - COALESCE(s."quantityReserved", 0) <= p."reorderPoint"))
     ORDER BY COALESCE(s."quantityOnHand", 0) - COALESCE(s."quantityReserved", 0) - COALESCE(p."reorderPoint", 0) ASC, p.name ASC
     LIMIT 300`;
  if (!low.length) return [];
  return prisma.part.findMany({ where: { id: { in: low.map((x) => x.id) }, branchId }, include: { stock: true, alternativeUnits: true } });
}

export async function listParts(branchId: string, search?: string, take?: number) {
  await requireUser();
  branchId = await branchWithinReach('store.view', branchId);
  const q = search?.trim();
  return prisma.part.findMany({
    ...(take ? { take: Math.min(Math.max(1, take), 500) } : {}),
    where: {
      branchId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { partNumber: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    include: { stock: true, alternativeUnits: true },
  });
}

export async function getPart(id: string) {
  await requireUser();
  const part = await prisma.part.findUnique({
    where: { id },
    include: {
      stock: true,
      alternativeUnits: true,
      // Include sold-out batches: the view shows sold vs remaining per delivery.
      batches: {
        orderBy: { receivedAt: 'asc' },
        include: {
          goodsReceiptLine: { select: { unitCost: true, goodsReceipt: { select: { id: true, referenceNumber: true } } } },
          // Who each draw went to and via which request, for warranty/defect traces.
          consumptions: {
            orderBy: { consumedAt: 'desc' },
            include: {
              slipLine: {
                select: {
                  slip: {
                    select: {
                      id: true,
                      referenceNumber: true,
                      jobCard: { select: { id: true, jobNumber: true, customer: { select: { id: true, fullName: true } } } },
                      vehicleService: { select: { id: true, serviceNumber: true, customer: { select: { id: true, fullName: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // Include issued serials, for the same reason as batches.
      serials: {
        orderBy: { receivedAt: 'asc' },
        include: {
          goodsReceiptLine: { select: { unitCost: true, goodsReceipt: { select: { id: true, referenceNumber: true } } } },
          // The request this unit was issued against.
          issuedToSlipLine: {
            select: {
              slip: {
                select: {
                  id: true,
                  referenceNumber: true,
                  jobCard: { select: { id: true, jobNumber: true, customer: { select: { id: true, fullName: true } } } },
                  vehicleService: { select: { id: true, serviceNumber: true, customer: { select: { id: true, fullName: true } } } },
                },
              },
            },
          },
        },
      },
      fitments: { orderBy: { createdAt: 'asc' } },
      createdBy: { select: { fullName: true } },
      // All deliveries: QUANTITY parts have no batch/serial rows, so this is the
      // only source for total received. Index 0 (newest) feeds the Selling Price
      // Calculator's purchase details.
      goodsReceiptLines: { orderBy: { goodsReceipt: { receivedAt: 'desc' } }, include: { goodsReceipt: { select: { id: true, referenceNumber: true, receivedAt: true } } } },
      // "Who took what" for QUANTITY parts.
      quantityConsumptions: {
        orderBy: { consumedAt: 'desc' },
        include: {
          slipLine: {
            select: {
              slip: {
                select: {
                  id: true,
                  referenceNumber: true,
                  jobCard: { select: { id: true, jobNumber: true, customer: { select: { id: true, fullName: true } } } },
                  vehicleService: { select: { id: true, serviceNumber: true, customer: { select: { id: true, fullName: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!part) return null;
  // A part outside the person's reach is shown exactly like one that does not exist.
  if (!(await canSeeRecord('store.view', { branchId: part.branchId }, `Part:${id}`))) return null;
  // QUANTITY parts: each delivery as a FIFO layer (remaining, currently
  // selling, and which delivery each release drew from). Same engine as releases.
  const quantityTrace = part.trackingType === 'QUANTITY' ? ((await loadQuantityTraces([part.id])).get(part.id) ?? null) : null;
  return { ...part, quantityTrace };
}

export type GoodsReceiptLineInput = {
  partId: string;
  quantityReceivedInUnit: number;
  unitUsed: string;
  // Total cost of the delivery in the unit received (e.g. ₦650,000 for one
  // drum). Required: pricing and valuation depend on it.
  totalCost: number;
  /** Required, and only meaningful, for a BATCH-tracked part. */
  batchNumber?: string;
  /** Required, and only meaningful, for a SERIALIZED part: one entry per unit.
   * The serial count is the received quantity; quantityReceivedInUnit is kept
   * as typed. */
  serialNumbers?: string[];
};

export type RecordGoodsReceiptInput = {
  idempotencyKey?: string;
  branchId: string;
  supplierName: string;
  notes?: string;
  lines: GoodsReceiptLineInput[];
};

/** Live duplicate check for the receipt form. Serial numbers are unique
 * across all parts; recordGoodsReceipt enforces the same rule. */
export async function checkSerialNumberExists(serialNumber: string): Promise<boolean> {
  await requireUser();
  // Only for the people who receive goods (serials are unique platform-wide).
  await authorize('store.grn.record', undefined, 'checkSerialNumberExists');
  const trimmed = serialNumber.trim();
  if (!trimmed) return false;
  const existing = await prisma.partSerial.findFirst({ where: { serialNumber: trimmed }, select: { id: true } });
  return existing !== null;
}

/** Records a delivery. Converts each line to the part's base unit, then
 * updates the batch, serial or quantity records plus PartStock in one
 * transaction, so stock and the receipt never disagree. */
export async function recordGoodsReceipt(input: RecordGoodsReceiptInput): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireStoreStaff(input.branchId, 'store.grn.record');
  try {
    return await recordGoodsReceiptOnce(input, user);
  } catch (err) {
    // The same form landing twice at the same instant: the first one recorded
    // the delivery — the second gets that receipt, never a technical error.
    if (input.idempotencyKey && isUniqueClashOn(err, 'idempotencyKey')) {
      const done = await prisma.goodsReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, referenceNumber: true, branchId: true } });
      if (done && done.branchId === input.branchId) return { id: done.id, referenceNumber: done.referenceNumber };
    }
    throw err;
  }
}

async function recordGoodsReceiptOnce(input: RecordGoodsReceiptInput, user: Awaited<ReturnType<typeof requireStoreStaff>>): Promise<{ id: string; referenceNumber: string }> {
  // Same form submitted again (dropped connection, double click): the stock
  // was already added — hand back that receipt instead of adding it twice.
  if (input.idempotencyKey) {
    const done = await prisma.goodsReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, referenceNumber: true, branchId: true } });
    if (done) {
      if (done.branchId === input.branchId) return { id: done.id, referenceNumber: done.referenceNumber };
      throw new StoreActionError('This form was already used for a different delivery — refresh the page and enter it again.');
    }
  }
  const supplierName = input.supplierName.trim();
  if (!supplierName) {
    throw new StoreActionError('Supplier name is required.');
  }
  if (!input.lines || input.lines.length === 0) {
    throw new StoreActionError('At least one line item is required.');
  }
  if (input.lines.length > 500) {
    throw new StoreActionError('A single delivery can have at most 500 lines — record it in two parts.');
  }

  const partIds = [...new Set(input.lines.map((l) => l.partId))];
  // Only this branch's own parts: a receipt can never add stock to another
  // branch's (or another organisation's) catalogue.
  const parts = await prisma.part.findMany({
    where: { id: { in: partIds }, branchId: input.branchId },
    include: { alternativeUnits: true },
  });
  if (parts.length !== partIds.length) {
    throw new StoreActionError('One of the parts on this delivery is not in this branch\'s catalogue — refresh the page and choose it again.');
  }
  // Typed from `parts`: conversionFactor is a Prisma Decimal, not a number.
  const partById = new Map<string, (typeof parts)[number]>(parts.map((p) => [p.id, p]));

  // Validate every line before writing anything; one bad line rejects the receipt.
  const resolvedLines = input.lines.map((line) => {
    const part = partById.get(line.partId);
    if (!part) {
      throw new StoreActionError(`Part not found for one of the line items.`);
    }
    if (!(line.quantityReceivedInUnit > 0)) {
      throw new StoreActionError(`Quantity received must be greater than zero for ${part.name}.`);
    }
    if (!(line.totalCost > 0)) {
      throw new StoreActionError(`Total Cost must be greater than zero for ${part.name}.`);
    }
    // The total as typed is the source of truth. Per-unit and per-base-unit
    // costs are derived from it once, never the other way round.
    const unitCostAsEntered = line.totalCost / line.quantityReceivedInUnit;
    let quantityInBaseUnit: number;
    let unitCostInBaseUnit: number;
    if (line.unitUsed === part.baseUnitOfMeasure) {
      quantityInBaseUnit = line.quantityReceivedInUnit;
      unitCostInBaseUnit = unitCostAsEntered;
    } else {
      const altUnit = part.alternativeUnits.find((u) => u.unitName === line.unitUsed);
      if (!altUnit) {
        throw new StoreActionError(`"${line.unitUsed}" is not a recognized unit for ${part.name}.`);
      }
      const conversionFactor = Number(altUnit.conversionFactor);
      quantityInBaseUnit = line.quantityReceivedInUnit * conversionFactor;
      // Stock and prices are tracked per base unit (e.g. litres), so convert the
      // per-entered-unit cost (e.g. per drum) here. Storing a drum price as a
      // per-litre price would inflate every estimate priced from it.
      unitCostInBaseUnit = Math.round((unitCostAsEntered / conversionFactor) * 1_000_000) / 1_000_000;
    }
    // Rounded for storage only; the calculations above use the typed value.
    const totalCost = Math.round(line.totalCost * 100) / 100;

    if (part.trackingType === 'BATCH' && !line.batchNumber?.trim()) {
      throw new StoreActionError(`A batch number is required for ${part.name}.`);
    }
    if (part.trackingType === 'SERIALIZED') {
      const serials = (line.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
      if (serials.length === 0) {
        throw new StoreActionError(`Serial numbers are required for ${part.name}.`);
      }
      const uniqueSerials = new Set(serials);
      if (uniqueSerials.size !== serials.length) {
        throw new StoreActionError(`Duplicate serial numbers entered for ${part.name}.`);
      }
      // A serialized part's quantity is its serial count; reject a mismatch
      // server-side, not just in the form.
      if (serials.length !== line.quantityReceivedInUnit) {
        throw new StoreActionError(
          `${part.name}: ${pluralize(serials.length, 'serial number')} entered, but quantity received was ${line.quantityReceivedInUnit}. These must match exactly.`,
        );
      }
    }

    return { ...line, part, quantityInBaseUnit, unitCostInBaseUnit, totalCost };
  });

  // Serials are unique across every part, not just within this receipt.
  const allNewSerials = resolvedLines.flatMap((line) => (line.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean));
  if (allNewSerials.length > 0) {
    const existingMatches = await prisma.partSerial.findMany({
      where: { serialNumber: { in: allNewSerials } },
      select: { serialNumber: true },
    });
    if (existingMatches.length > 0) {
      const duplicateList = existingMatches.map((s: (typeof existingMatches)[number]) => s.serialNumber).join(', ');
      throw new StoreActionError(`${pluralize(existingMatches.length, 'serial number')} already recorded elsewhere in the catalog: ${duplicateList}.`);
    }
  }

  let referenceNumber = '';

  // Previous cost per part, for the context shown on any pricing alert raised
  // below. A part with no earlier delivery has no prior cost (left unset).
  const priorLines = await prisma.goodsReceiptLine.findMany({
    where: { partId: { in: partIds } },
    orderBy: { goodsReceipt: { createdAt: 'desc' } },
    select: { partId: true, unitCost: true },
  });
  const priorUnitCostByPart = new Map<string, number | null>();
  for (const pl of priorLines) {
    if (!priorUnitCostByPart.has(pl.partId)) {
      priorUnitCostByPart.set(pl.partId, pl.unitCost !== null ? Number(pl.unitCost) : null);
    }
  }

  // Emails are sent after the transaction commits, never inside it, so an
  // alert that rolls back is never announced.
  const newAlertsForEmail: {
    partId: string;
    partName: string;
    severity: 'CRITICAL_LOSS' | 'DEFICIT' | 'BOOST';
    previousUnitCost: number | null;
    newUnitCost: number;
    sellingPrice: number;
    actualMarginPercent: number;
    targetMarginPercent: number;
  }[] = [];

  // Two receipts saved at the same instant can pick the same GRN number —
  // re-run the whole attempt with the next number (lib/integrity-core).
  const receipt = await retryOnNumberClash('referenceNumber', async () => {
    newAlertsForEmail.length = 0;
    referenceNumber = await generateGoodsReceiptNumber();
    return prisma.$transaction(async (tx) => {
    // Linked to the organisation's supplier list when the name matches one (v-A2); the name stays as typed.
    const supplier = await tx.supplier.findFirst({ where: { name: { equals: supplierName, mode: 'insensitive' }, isActive: true, organisation: { businessUnits: { some: { branches: { some: { id: input.branchId } } } } } }, select: { id: true } });
    const created = await tx.goodsReceipt.create({
      data: {
        idempotencyKey: input.idempotencyKey || null,
        branchId: input.branchId,
        referenceNumber,
        supplierName,
        supplierId: supplier?.id ?? null,
        receivedById: user.id,
        notes: input.notes?.trim() || undefined,
      },
    });

    for (const line of resolvedLines) {
      const createdLine = await tx.goodsReceiptLine.create({
        data: {
          goodsReceiptId: created.id,
          partId: line.partId,
          quantityReceivedInUnit: line.quantityReceivedInUnit,
          unitUsed: line.unitUsed,
          quantityInBaseUnit: line.quantityInBaseUnit,
          unitCost: line.unitCostInBaseUnit,
          totalCost: line.totalCost,
          batchNumber: line.part.trackingType === 'BATCH' ? line.batchNumber?.trim() : undefined,
        },
      });

      if (line.part.trackingType === 'BATCH') {
        await tx.partBatch.create({
          data: {
            partId: line.partId,
            batchNumber: line.batchNumber!.trim(),
            receivedQuantity: line.quantityInBaseUnit,
            remainingQuantity: line.quantityInBaseUnit,
            goodsReceiptLineId: createdLine.id,
          },
        });
      } else if (line.part.trackingType === 'SERIALIZED') {
        const serials = (line.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
        for (const serialNumber of serials) {
          await tx.partSerial.create({
            data: { partId: line.partId, serialNumber, status: 'IN_STOCK', goodsReceiptLineId: createdLine.id },
          });
        }
      }

      await tx.partStock.upsert({
        where: { partId: line.partId },
        update: { quantityOnHand: { increment: line.quantityInBaseUnit } },
        create: { partId: line.partId, quantityOnHand: line.quantityInBaseUnit, quantityReserved: 0 },
      });

      // Pricing Command Center: compare the new cost against the part's target
      // margin. Skipped when the part has no selling price or target margin yet.
      if (line.part.sellingPrice !== null && line.part.targetMarginPercent !== null) {
        const sellingPrice = Number(line.part.sellingPrice);
        const targetMarginPercent = Number(line.part.targetMarginPercent);
        const actualMarginPercent = ((sellingPrice - line.unitCostInBaseUnit) / sellingPrice) * 100;
        // Differences smaller than MARGIN_TOLERANCE_PP are kobo rounding,
        // not a real margin change — no alert.
        const severity =
          actualMarginPercent < 0
            ? 'CRITICAL_LOSS'
            : actualMarginPercent < targetMarginPercent - MARGIN_TOLERANCE_PP
              ? 'DEFICIT'
              : actualMarginPercent > targetMarginPercent + MARGIN_TOLERANCE_PP
                ? 'BOOST'
                : null;
        if (severity) {
          await tx.pricingAlert.create({
            data: {
              partId: line.partId,
              goodsReceiptLineId: createdLine.id,
              severity,
              previousUnitCost: priorUnitCostByPart.get(line.partId) ?? undefined,
              newUnitCost: line.unitCostInBaseUnit,
              sellingPriceAtAlert: sellingPrice,
              targetMarginPercentAtAlert: targetMarginPercent,
              actualMarginPercent: Math.round(actualMarginPercent * 100) / 100,
            },
          });
          newAlertsForEmail.push({
            partId: line.partId,
            partName: line.part.name,
            severity,
            previousUnitCost: priorUnitCostByPart.get(line.partId) ?? null,
            newUnitCost: line.unitCostInBaseUnit,
            sellingPrice,
            actualMarginPercent: Math.round(actualMarginPercent * 100) / 100,
            targetMarginPercent,
          });
        }
      }
    }

    return created;
    });
  });

  await writeAuditLog({
    userId: user.id,
    action: 'goods_receipt.recorded',
    entityType: 'GoodsReceipt',
    entityId: receipt.id,
    metadata: { referenceNumber, supplierName, lineCount: resolvedLines.length },
  });

  // Confirm the receipt to the person who recorded it and the Store Manager.
  // One email per line (the form currently submits one line per receipt).
  try {
    const [recordedByUser, orgContext, storeManagers] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true, email: true } }),
      getStoreOrgContext(),
      listEligibleStoreManagersForBranch(input.branchId),
    ]);
    if (recordedByUser) {
      const websiteUrl = websiteBaseUrl();
      const portalUrl = portalBaseUrl();
      const recipients = [...new Set([recordedByUser.email, ...storeManagers.staff.map((m) => m.email)])];
      for (const line of resolvedLines) {
        const html = renderStaffGoodsReceiptRecordedEmail({
          recordedByName: recordedByUser.fullName,
          referenceNumber,
          supplierName,
          partName: line.part.name,
          quantityLabel: pluralize(Number(line.quantityReceivedInUnit), line.unitUsed),
          quantityInBaseUnitLabel: pluralize(Number(line.quantityInBaseUnit), line.part.baseUnitOfMeasure),
          batchNumber: line.part.trackingType === 'BATCH' ? line.batchNumber?.trim() : undefined,
          serialNumbers: line.part.trackingType === 'SERIALIZED' ? (line.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean) : undefined,
          notes: input.notes?.trim() || undefined,
          dashboardUrl: `${portalUrl}/inventory/parts/${line.partId}`,
          logoUrl: `${websiteUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        });
        for (const to of recipients) {
          await sendEmail(to, `Goods receipt ${referenceNumber} recorded — ${line.part.name}`, html);
        }
      }
    }
  } catch (err) {
    logFailure('Failed to send goods-receipt notification email', receipt.id, err);
  }

  // Separate email for any new pricing alerts. Failures never block the receipt.
  if (newAlertsForEmail.length > 0) {
    try {
      const [orgContext, officers, managers] = await Promise.all([
        getStoreOrgContext(),
        listEligibleStoreOfficersForBranch(input.branchId),
        listEligibleStoreManagersForBranch(input.branchId),
      ]);
      const recipients = new Map<string, { fullName: string; email: string }>();
      for (const staffMember of [...officers.staff, ...managers.staff]) {
        recipients.set(staffMember.id, staffMember);
      }
      const portalUrl = portalBaseUrl();
      const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
      const formatNairaForAlert = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      for (const alert of newAlertsForEmail) {
        const recommendedPrice = roundedPriceForTargetMargin(alert.newUnitCost, alert.targetMarginPercent);
        const recommendedMarkup = recommendedPrice !== null ? actualMarkup(alert.newUnitCost, recommendedPrice) : null;
        for (const recipient of recipients.values()) {
          const html = renderPricingAlertRaisedEmail({
            recipientName: recipient.fullName,
            partName: alert.partName,
            severity: alert.severity,
            goodsReceiptReference: referenceNumber,
            previousUnitCost: alert.previousUnitCost !== null ? formatNairaForAlert(alert.previousUnitCost) : null,
            newUnitCost: formatNairaForAlert(alert.newUnitCost),
            sellingPrice: formatNairaForAlert(alert.sellingPrice),
            actualMarginPercent: alert.actualMarginPercent.toFixed(1),
            targetMarginPercent: alert.targetMarginPercent.toFixed(1),
            recommendedPrice: recommendedPrice !== null ? formatNairaForAlert(recommendedPrice) : null,
            recommendedMarkupPercent: recommendedMarkup !== null ? recommendedMarkup.toFixed(1) : null,
            alertUrl: `${portalUrl}/inventory/pricing?branchId=${input.branchId}`,
            dashboardUrl: `${portalUrl}/inventory/pricing?branchId=${input.branchId}`,
            logoUrl,
            companyName: orgContext.companyName,
            branchName: orgContext.branchName,
          });
          await sendEmail(recipient.email, `Pricing alert: ${alert.severity === 'CRITICAL_LOSS' ? 'selling below cost' : alert.severity === 'DEFICIT' ? 'below target margin' : 'above target margin'} — ${alert.partName}`, html);
        }
      }
    } catch (err) {
      logFailure('Failed to send pricing-alert-raised emails', receipt.id, err);
    }
  }

  return { id: receipt.id, referenceNumber };
}

// ----------------------------------------------------------------------------
// Pricing Command Center: alerts raised by recordGoodsReceipt, listed,
// resolved, dismissed or acted on here.
// ----------------------------------------------------------------------------

export type PricingAlertSummary = {
  openBySeverity: { CRITICAL_LOSS: number; DEFICIT: number; BOOST: number };
  // Sum over open CRITICAL_LOSS alerts of (per-unit shortfall × stock on hand):
  // the loss if today's stock sold at today's price.
  criticalLossExposure: number;
  // Average gap between actual and target margin across open DEFICIT alerts
  // (each part has its own target).
  averageDeficitGapPercent: number | null;
  // Parts with more than one open alert: a pattern, not a one-off price swing.
  partsWithMultipleOpenAlerts: { partId: string; partName: string; openCount: number }[];
};

/** The permission that lets this person see delivery costs and margins
 * (goods receipts, pricing alerts) — the first they hold, or one they do not
 * hold, so the check refuses. */
async function costKey(): Promise<PermissionKey> {
  for (const k of STORE_COST_PERMISSIONS) if (await allows(k)) return k;
  return STORE_COST_PERMISSIONS[0]!;
}

/** Pricing Command Center summary, computed from currently open alerts. */
export async function getPricingAlertSummary(branchId: string): Promise<PricingAlertSummary> {
  await requireUser();
  branchId = await branchWithinReach(await costKey(), branchId);
  const openAlerts = await prisma.pricingAlert.findMany({
    where: { status: 'OPEN', part: { branchId } },
    select: {
      severity: true,
      newUnitCost: true,
      sellingPriceAtAlert: true,
      targetMarginPercentAtAlert: true,
      actualMarginPercent: true,
      partId: true,
      part: { select: { name: true, stock: { select: { quantityOnHand: true } } } },
    },
  });

  const openBySeverity = { CRITICAL_LOSS: 0, DEFICIT: 0, BOOST: 0 };
  let criticalLossExposure = 0;
  let deficitGapSum = 0;
  let deficitCount = 0;
  const alertCountByPart = new Map<string, { partName: string; count: number }>();

  for (const alert of openAlerts) {
    openBySeverity[alert.severity as keyof typeof openBySeverity] += 1;
    const existing = alertCountByPart.get(alert.partId);
    alertCountByPart.set(alert.partId, { partName: alert.part.name, count: (existing?.count ?? 0) + 1 });

    if (alert.severity === 'CRITICAL_LOSS') {
      const perUnitLoss = Number(alert.newUnitCost) - Number(alert.sellingPriceAtAlert);
      const quantityOnHand = alert.part.stock?.quantityOnHand !== undefined ? Number(alert.part.stock.quantityOnHand) : 0;
      if (perUnitLoss > 0 && quantityOnHand > 0) {
        criticalLossExposure += perUnitLoss * quantityOnHand;
      }
    } else if (alert.severity === 'DEFICIT') {
      deficitGapSum += Number(alert.targetMarginPercentAtAlert) - Number(alert.actualMarginPercent);
      deficitCount += 1;
    }
  }

  const partsWithMultipleOpenAlerts = [...alertCountByPart.entries()]
    .filter(([, v]) => v.count > 1)
    .map(([partId, v]) => ({ partId, partName: v.partName, openCount: v.count }))
    .sort((a, b) => b.openCount - a.openCount);

  return {
    openBySeverity,
    criticalLossExposure: Math.round(criticalLossExposure * 100) / 100,
    averageDeficitGapPercent: deficitCount > 0 ? Math.round((deficitGapSum / deficitCount) * 100) / 100 : null,
    partsWithMultipleOpenAlerts,
  };
}

export async function listPricingAlerts(branchId: string, filter?: { severity?: string; status?: string }) {
  await requireUser();
  branchId = await branchWithinReach(await costKey(), branchId);
  return prisma.pricingAlert.findMany({
    where: {
      part: { branchId },
      ...(filter?.severity ? { severity: filter.severity as never } : {}),
      status: (filter?.status as never) ?? 'OPEN',
    },
    orderBy: { createdAt: 'desc' },
    include: {
      part: { select: { id: true, name: true, baseUnitOfMeasure: true } },
      goodsReceiptLine: { select: { goodsReceipt: { select: { referenceNumber: true } } } },
      resolvedBy: { select: { fullName: true } },
    },
  });
}

/** Keeps the current price. Different from RESOLVED, which means the price
 * changed. A reason is required. */
export async function dismissPricingAlert(alertId: string, notes: string): Promise<void> {
  const alert = await prisma.pricingAlert.findUnique({ where: { id: alertId }, select: { status: true, part: { select: { branchId: true, name: true } } } });
  if (!alert) {
    throw new StoreActionError('Pricing alert not found.');
  }
  if (alert.status !== 'OPEN') {
    throw new StoreActionError('This alert has already been decided.');
  }
  const trimmedNotes = notes.trim();
  if (!trimmedNotes) {
    throw new StoreActionError('A reason is required to dismiss a pricing alert.');
  }
  const user = await requireStoreStaff(alert.part.branchId, 'store.parts.manage');
  claimed(await prisma.pricingAlert.updateMany({ where: { id: alertId, status: 'OPEN' },
    data: { status: 'DISMISSED', resolvedById: user.id, resolvedAt: new Date(), resolutionNotes: trimmedNotes },
  }), 'This alert was just decided by someone else — refresh the page.');
  await writeAuditLog({ userId: user.id, action: 'pricing_alert.dismissed', entityType: 'PricingAlert', entityId: alertId, metadata: { partName: alert.part.name, notes: trimmedNotes } });
}

/** Sets the selling price to hold the target margin against the alert's new
 * cost (price = cost ÷ (1 − target/100)) and marks the alert resolved. */
export async function syncPartPriceToTargetMargin(alertId: string): Promise<void> {
  const alert = await prisma.pricingAlert.findUnique({
    where: { id: alertId },
    select: {
      status: true,
      newUnitCost: true,
      targetMarginPercentAtAlert: true,
      part: { select: { id: true, branchId: true, name: true, sellingPrice: true } },
    },
  });
  if (!alert) {
    throw new StoreActionError('Pricing alert not found.');
  }
  if (alert.status !== 'OPEN') {
    throw new StoreActionError('This alert has already been decided.');
  }
  const user = await requireStoreStaff(alert.part.branchId, 'store.parts.manage');
  const targetMargin = Number(alert.targetMarginPercentAtAlert);
  const newUnitCost = Number(alert.newUnitCost);
  // Rounded UP to the kobo, so the target margin is always met.
  const newSellingPrice = roundedPriceForTargetMargin(newUnitCost, targetMargin) ?? 0;
  const previousSellingPrice = alert.part.sellingPrice !== null ? Number(alert.part.sellingPrice) : null;

  // The alert is claimed first (compare-and-set), so a dismiss and a sync —
  // or two syncs — at the same moment can't both happen.
  await prisma.$transaction(async (tx) => {
    claimed(await tx.pricingAlert.updateMany({
      where: { id: alertId, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedById: user.id, resolvedAt: new Date(), resolutionNotes: `Price synced to ${newSellingPrice} to hold ${targetMargin}% margin.` },
    }), 'This alert was just decided by someone else — refresh the page.');
    await tx.part.update({ where: { id: alert.part.id }, data: { sellingPrice: newSellingPrice } });
  });
  await writeAuditLog({
    userId: user.id,
    action: 'part.selling_price_set',
    entityType: 'Part',
    entityId: alert.part.id,
    metadata: { name: alert.part.name, from: previousSellingPrice, to: newSellingPrice, viaPricingAlert: alertId },
  });

  // Same email as a manual price change. Failures never block the change.
  try {
    const part = await prisma.part.findUnique({ where: { id: alert.part.id }, select: { baseUnitOfMeasure: true } });
    const [officers, managers, syncedByUser] = await Promise.all([
      listEligibleStoreOfficersForBranch(alert.part.branchId),
      listEligibleStoreManagersForBranch(alert.part.branchId),
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
    ]);
    const recipients = new Map<string, { fullName: string; email: string }>();
    for (const staffMember of [...officers.staff, ...managers.staff]) {
      recipients.set(staffMember.id, staffMember);
    }
    const orgContext = await getStoreOrgContext();
    const portalUrl = portalBaseUrl();
    const logoUrl = `${portalUrl}/images/logo/email-logo.png`;
    for (const recipient of recipients.values()) {
      await sendEmail(
        recipient.email,
        `Selling price updated — ${alert.part.name}`,
        renderPartSellingPriceSetEmail({
          recipientName: recipient.fullName,
          setByName: syncedByUser?.fullName ?? 'A team member',
          partName: alert.part.name,
          baseUnitOfMeasure: part?.baseUnitOfMeasure ?? '',
          previousSellingPrice,
          newSellingPrice,
          // The alert only stores cost, price and margin, not the quantity/revenue
          // context of a manual edit; the template handles a null insight.
          margin: null,
          targetMarginPercent: targetMargin,
          partUrl: `${portalUrl}/inventory/parts/${alert.part.id}`,
          logoUrl,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send price-sync notification emails', alert.part.id, err);
  }
}

export async function listGoodsReceipts(branchId: string) {
  await requireUser();
  branchId = await branchWithinReach(await costKey(), branchId);
  return prisma.goodsReceipt.findMany({
    take: 500, // newest 500; search reaches older records
    where: { branchId },
    orderBy: { receivedAt: 'desc' },
    include: { receivedBy: { select: { fullName: true } }, lines: { select: { id: true, part: { select: { id: true, name: true } } } } },
  });
}

const SLIP_DESTINATION_SELECT = {
  id: true,
  referenceNumber: true,
  jobCard: { select: { jobNumber: true, customer: { select: { id: true, fullName: true } } } },
  vehicleService: { select: { serviceNumber: true, customer: { select: { id: true, fullName: true } } } },
} as const;

export async function getGoodsReceipt(id: string) {
  await requireUser();
  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      receivedBy: { select: { fullName: true } },
      lines: {
        include: {
          part: {
            select: {
              id: true,
              name: true,
              partNumber: true,
              baseUnitOfMeasure: true,
              trackingType: true,
              // The part's FIFO "selling now" batch (oldest with stock left).
              batches: { where: { remainingQuantity: { gt: 0 } }, orderBy: { receivedAt: 'asc' }, take: 1, select: { id: true } },
            },
          },
          // Forward trace (GRN → where it went), BATCH parts.
          batches: {
            select: {
              id: true,
              batchNumber: true,
              receivedQuantity: true,
              remainingQuantity: true,
              consumptions: { orderBy: { consumedAt: 'asc' }, select: { quantityTaken: true, slipLine: { select: { slip: { select: SLIP_DESTINATION_SELECT } } } } },
            },
          },
          // Forward trace, SERIALIZED parts — each unit and where it went.
          serials: {
            orderBy: { receivedAt: 'asc' },
            select: { id: true, serialNumber: true, status: true, issuedToSlipLine: { select: { slip: { select: SLIP_DESTINATION_SELECT } } } },
          },
        },
      },
    },
  });
  if (!receipt) return null;
  if (!(await canSeeRecord(await costKey(), { branchId: receipt.branchId }, `GoodsReceipt:${id}`))) return null;
  // Forward trace, QUANTITY parts — the same FIFO engine as releases.
  const quantityTraces = await loadQuantityTraces(
    receipt.lines.filter((l: (typeof receipt.lines)[number]) => l.part.trackingType === 'QUANTITY').map((l: (typeof receipt.lines)[number]) => l.partId),
  );
  return { ...receipt, quantityTraces };
}

export async function getGoodsReceiptAuditTrail(goodsReceiptId: string) {
  await requireUser();
  const owner = await prisma.goodsReceipt.findUnique({ where: { id: goodsReceiptId }, select: { branchId: true } });
  if (!owner) return [];
  await seeBranch(await costKey(), owner.branchId, 'getGoodsReceiptAuditTrail');
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'GoodsReceipt', entityId: goodsReceiptId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
  });
  const userIds = [...new Set(entries.map((e: (typeof entries)[number]) => e.userId).filter((id: string | null): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
  const userById = new Map(users.map((u: (typeof users)[number]) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(userById.get(e.userId) ?? 'Unknown', e.metadata) : 'System' }));
}

/** Audit entries for a part (same shape as getGoodsReceiptAuditTrail()). */
export async function getPartAuditTrail(partId: string) {
  await requireUser();
  await seePart(partId, 'getPartAuditTrail');
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'Part', entityId: partId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
  });
  const userIds = [...new Set(entries.map((e: (typeof entries)[number]) => e.userId).filter((id: string | null): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
  const userById = new Map(users.map((u: (typeof users)[number]) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? actorLabel(userById.get(e.userId) ?? 'Unknown', e.metadata) : 'System' }));
}

/** Tells the branch's Store staff when a recorded goods receipt is edited.
 * Receipts are financial records, so edits are announced, not just logged. */
async function notifyStoreOfGoodsReceiptEdit(branchId: string, editedByName: string, referenceNumber: string, changeSummary: string): Promise<void> {
  try {
    const [officers, managers] = await Promise.all([listEligibleStoreOfficersForBranch(branchId), listEligibleStoreManagersForBranch(branchId)]);
    const recipients = new Map<string, { fullName: string; email: string }>();
    for (const staffMember of [...officers.staff, ...managers.staff]) {
      recipients.set(staffMember.id, staffMember);
    }
    const orgContext = await getStoreOrgContext();
    const portalUrl = portalBaseUrl();
    for (const recipient of recipients.values()) {
      await sendEmail(
        recipient.email,
        `Goods receipt edited — ${referenceNumber}`,
        renderGoodsReceiptEditedEmail({
          recipientName: recipient.fullName,
          editedByName,
          referenceNumber,
          changeSummary,
          goodsReceiptUrl: `${portalUrl}/inventory/goods-receipts`,
          logoUrl: `${portalUrl}/images/logo/email-logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    logFailure('Failed to send Goods Receipt edit notification emails', referenceNumber, err);
  }
}

/** Edits supplier and notes only. Quantity, unit and part are physical facts
 * and changing them would need stock reconciliation. */
export async function updateGoodsReceipt(id: string, input: { supplierName: string; notes?: string }): Promise<void> {
  const receipt = await prisma.goodsReceipt.findUnique({ where: { id }, select: { branchId: true, referenceNumber: true, supplierName: true, notes: true } });
  if (!receipt) {
    throw new StoreActionError('Goods Receipt not found.');
  }
  const user = await requireStoreStaff(receipt.branchId, 'store.grn.record');
  const supplierName = input.supplierName.trim();
  if (!supplierName) {
    throw new StoreActionError('Supplier name is required.');
  }
  await prisma.goodsReceipt.update({ where: { id }, data: { supplierName, notes: input.notes?.trim() || null } });
  await writeAuditLog({
    userId: user.id,
    action: 'goods_receipt.updated',
    entityType: 'GoodsReceipt',
    entityId: id,
    metadata: { from: { supplierName: receipt.supplierName, notes: receipt.notes }, to: { supplierName, notes: input.notes } },
  });
  // requireStoreStaff() returns only the id; look up the name for the email.
  const editedByUser = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
  await notifyStoreOfGoodsReceiptEdit(receipt.branchId, editedByUser?.fullName ?? 'A team member', receipt.referenceNumber, `Supplier/notes updated (was "${receipt.supplierName}")`);
}

/** Corrects a mistyped cost, entered per the line's original unit, and
 * converts it to the base-unit cost the same way recordGoodsReceipt() does. */
export async function updateGoodsReceiptLineCost(lineId: string, newUnitCostAsEntered: number): Promise<void> {
  const line = await prisma.goodsReceiptLine.findUnique({
    where: { id: lineId },
    select: {
      unitUsed: true,
      unitCost: true,
      totalCost: true,
      quantityReceivedInUnit: true,
      goodsReceiptId: true,
      part: { select: { branchId: true, name: true, baseUnitOfMeasure: true, alternativeUnits: true } },
      goodsReceipt: { select: { referenceNumber: true } },
    },
  });
  if (!line) {
    throw new StoreActionError('Line not found.');
  }
  const user = await requireStoreStaff(line.part.branchId, 'store.grn.record');
  if (!(newUnitCostAsEntered > 0)) {
    throw new StoreActionError('Unit cost must be greater than zero.');
  }
  let unitCostInBaseUnit = newUnitCostAsEntered;
  if (line.unitUsed !== line.part.baseUnitOfMeasure) {
    const altUnit = line.part.alternativeUnits.find((u: (typeof line.part.alternativeUnits)[number]) => u.unitName === line.unitUsed);
    if (!altUnit) {
      throw new StoreActionError(`"${line.unitUsed}" is no longer a recognized unit for ${line.part.name} — cannot safely re-convert this cost.`);
    }
    unitCostInBaseUnit = Math.round((newUnitCostAsEntered / Number(altUnit.conversionFactor)) * 1_000_000) / 1_000_000;
  }
  // Total from the entered cost × entered quantity, not from the rounded
  // base-unit cost.
  const totalCost = Math.round(newUnitCostAsEntered * Number(line.quantityReceivedInUnit) * 100) / 100;
  const previousCost = line.unitCost;
  const previousTotalCost = line.totalCost;
  await prisma.goodsReceiptLine.update({ where: { id: lineId }, data: { unitCost: unitCostInBaseUnit, totalCost } });
  await writeAuditLog({
    userId: user.id,
    action: 'goods_receipt.line_cost_updated',
    entityType: 'GoodsReceipt',
    entityId: line.goodsReceiptId,
    metadata: {
      partName: line.part.name,
      from: previousCost !== null ? Number(previousCost) : null,
      to: unitCostInBaseUnit,
      fromTotalCost: previousTotalCost !== null ? Number(previousTotalCost) : null,
      toTotalCost: totalCost,
      enteredAs: `${newUnitCostAsEntered} per ${line.unitUsed}`,
    },
  });
  const editedByUser = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
  await notifyStoreOfGoodsReceiptEdit(
    line.part.branchId,
    editedByUser?.fullName ?? 'A team member',
    line.goodsReceipt.referenceNumber,
    `${line.part.name}'s cost corrected to ${newUnitCostAsEntered} per ${line.unitUsed} — total now ₦${totalCost.toLocaleString('en-NG')}`,
  );
}

/** Sets or clears a part's reorder point and safety stock. Safety stock
 * cannot exceed the reorder point. Audited with before and after. */
export async function setPartStockLevels(partId: string, reorderPoint: number | null, safetyStock: number | null): Promise<void> {
  const part = await prisma.part.findUnique({ where: { id: partId }, select: { branchId: true, name: true, reorderPoint: true, safetyStock: true } });
  if (!part) throw new StoreActionError('Part not found.');
  const user = await requireStoreStaff(part.branchId, 'store.parts.manage');
  for (const [label, v] of [['Reorder point', reorderPoint], ['Safety stock', safetyStock]] as const) {
    if (v !== null && (!Number.isFinite(v) || v < 0)) throw new StoreActionError(`${label} must be zero or more.`);
  }
  if (reorderPoint !== null && safetyStock !== null && safetyStock > reorderPoint) {
    throw new StoreActionError('Safety stock cannot be higher than the reorder point.');
  }
  const round3 = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 1000);
  const next = { reorderPoint: round3(reorderPoint), safetyStock: round3(safetyStock) };
  const before = { reorderPoint: part.reorderPoint === null ? null : Number(part.reorderPoint), safetyStock: part.safetyStock === null ? null : Number(part.safetyStock) };
  if (before.reorderPoint === next.reorderPoint && before.safetyStock === next.safetyStock) throw new StoreActionError('Those are already the stock levels.');
  await prisma.part.update({ where: { id: partId }, data: next });
  await writeAuditLog({ userId: user.id, action: 'part.stock_levels_set', entityType: 'Part', entityId: partId, metadata: { name: part.name, from: before, to: next } });
}
