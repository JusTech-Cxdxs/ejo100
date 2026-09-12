'use server';

/**
 * Store Server Actions — Phase 1: the part catalog, unit-of-measure
 * conversion, and goods receipt (stock coming in). Deliberately does NOT
 * yet include the Issue Slip workflow (requesting/releasing stock to a
 * Job Card) or External Procurement — those are their own later phases.
 *
 * Same architecture as apps/portal/lib/actions/workshop.ts: Server Actions
 * calling @ejo/database directly, not the Render API, for the same
 * cross-origin-cookie reason documented there. requireUser()/
 * writeAuditLog() are imported from workshop.ts rather than duplicated —
 * both are auth/audit-sensitive shared logic that shouldn't exist as two
 * copies a future fix could miss one of.
 */

import { prisma, PartTrackingType } from '@ejo/database';
import { pluralize } from '@/lib/utils/pluralize';
import { markupToMargin, marginToMarkup, actualMargin, actualMarkup, priceForTargetMargin } from '@/lib/pricing-math';
import { requireUser, writeAuditLog, currentUserIsMasterAdmin } from './workshop';
import { sendEmail } from '@/lib/email';
import { renderStaffGoodsReceiptRecordedEmail } from '@/lib/email-templates/staff-goods-receipt-recorded';
import { renderPricingAlertRaisedEmail } from '@/lib/email-templates/pricing-alert-raised';
import { renderPartTargetMarginSetEmail } from '@/lib/email-templates/part-target-margin-set';
import { renderStoreMatchingRequestedEmail, renderStoreMatchingStatusEmail } from '@/lib/email-templates/store-matching-status';
import { renderGoodsReceiptEditedEmail } from '@/lib/email-templates/goods-receipt-edited';
import { renderPartSellingPriceSetEmail } from '@/lib/email-templates/part-selling-price-set';

class StoreActionError extends Error {}

/** Mirrors getWorkshopOrgContext() in workshop.ts exactly, scoped to
 * the 'store' department slug instead — kept as its own small
 * function rather than importing a workshop-specific one, since Store
 * is genuinely its own department with its own name/context to show
 * in its own emails. */
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

/** Resolves the Store department's branch — mirrors getWorkshopBranchId()
 * exactly, same reasoning: a single lookup point so nothing hardcodes a
 * branch elsewhere. */
export async function getStoreBranchId(): Promise<string> {
  const department = await prisma.department.findFirst({
    where: { slug: 'store' },
    select: { branchId: true },
  });
  if (!department) {
    throw new StoreActionError('No branch has a Store department yet — run the seed script, or create one under Branches.');
  }
  return department.branchId;
}

export type EligibleStoreStaffResult = { staff: { id: string; fullName: string; email: string }[]; usingFallback: boolean };

/** Any user holding the given role slug for the branch, or a Master Admin
 * if none exist yet — the exact same fallback pattern as
 * listEligibleManagersForBranch() in workshop.ts, for the same reason:
 * the Users/Roles admin pages are still placeholder stubs, so eligibility
 * must never silently come back empty. */
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
  return listEligibleStoreStaffForBranch(branchId, 'store-manager');
}

export async function listEligibleStoreOfficersForBranch(branchId: string): Promise<EligibleStoreStaffResult> {
  return listEligibleStoreStaffForBranch(branchId, 'store-officer');
}

/** Only Store Manager, Store Officer, or Master Admin may record what
 * arrives into the Store's own stock — a real, financial-impact action
 * (it adds real stock value), gated the same way Closed requires a
 * Workshop Manager elsewhere in this project. */
export async function requireStoreStaff(branchId: string): Promise<{ id: string }> {
  const user = await requireUser();
  if (await currentUserIsMasterAdmin()) return user;
  const [managers, officers] = await Promise.all([
    listEligibleStoreManagersForBranch(branchId),
    listEligibleStoreOfficersForBranch(branchId),
  ]);
  const isEligible = [...managers.staff, ...officers.staff].some((s) => s.id === user.id);
  if (!isEligible) {
    throw new StoreActionError('Only Store staff can record a goods receipt.');
  }
  return user;
}

/** GRN-2026-000001 — mirrors generateJobNumber() in workshop.ts exactly:
 * same year-prefixed, zero-padded sequence, same reasoning (string-
 * descending sort on a fixed-width zero-padded sequence correctly
 * matches numeric order). */
async function generateGoodsReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
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
  /** Every new Part now belongs to a real PartType — category (the
   * free-text field Store's own catalog search already uses) and
   * partNumber are both derived from it below, never typed in
   * directly, so a Part can no longer exist with a category that
   * doesn't correspond to anything real in the PartType hierarchy. */
  partTypeId: string;
  trackingType: 'QUANTITY' | 'BATCH' | 'SERIALIZED';
  baseUnitOfMeasure: string;
  reorderPoint?: number;
  safetyStock?: number;
  alternativeUnits?: { unitName: string; conversionFactor: number }[];
};

/** FLU-001, FIL-001, BRK-001 — mirrors generateGoodsReceiptNumber()'s
 * own pattern (same string-descending-sort-matches-numeric-order
 * reasoning), but without a year prefix: a Part Number is a permanent
 * identity for the life of the part, never scoped to when it was
 * added, matching exactly how Kewalram's own real catalog already
 * numbers things today. */
async function generatePartNumber(branchId: string, categoryCode: string): Promise<string> {
  const prefix = `${categoryCode}-`;
  const latest = await prisma.part.findFirst({
    where: { branchId, partNumber: { startsWith: prefix } },
    orderBy: { partNumber: 'desc' },
    select: { partNumber: true },
  });
  const parsedSequence = latest?.partNumber ? parseInt(latest.partNumber.slice(prefix.length), 10) : NaN;
  // A part numbered outside this pattern (possible from before this
  // was auto-generated, when partNumber was free text) shouldn't
  // silently produce "NaN" here — treat it the same as no prior
  // sequence existing at all, and start fresh from 1.
  const nextSequence = Number.isFinite(parsedSequence) ? parsedSequence + 1 : 1;
  return `${prefix}${String(nextSequence).padStart(3, '0')}`;
}

/** Creates a new part in the catalog, with its stock row initialized to
 * zero — a part always has exactly one PartStock row from the moment it
 * exists, so goods-receipt logic never has to branch on whether one is
 * there yet. */
export async function createPart(input: CreatePartInput): Promise<{ id: string }> {
  const user = await requireStoreStaff(input.branchId);
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
    metadata: { name, partNumber: part.partNumber, trackingType: input.trackingType, baseUnitOfMeasure },
  });

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

/** Edits an existing part's own descriptive fields — deliberately never
 * trackingType or baseUnitOfMeasure, since changing either on a part
 * that already has real stock recorded in its original base unit would
 * be genuinely dangerous, not just inconvenient: existing PartStock/
 * PartBatch/GoodsReceiptLine rows would silently disagree with a
 * changed unit. Those two are fixed for the life of the part; everything
 * else here is safe to correct at any time. */
export async function updatePart(input: UpdatePartInput): Promise<void> {
  const part = await prisma.part.findUnique({ where: { id: input.id }, select: { branchId: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId);
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

/** Setting the real, deliberate price a customer is actually charged
 * — genuinely separate from cost (what Store paid a supplier), and
 * the only thing Store matching a Store Part line is ever allowed to
 * use for pricing. Never auto-derived from the last Goods Receipt
 * cost, even as a convenience default — that's exactly the
 * conflation this field exists to end, and a suggested figure has a
 * way of becoming the actual figure nobody ever deliberately chose. */
export async function setPartSellingPrice(partId: string, sellingPrice: number): Promise<void> {
  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: {
      branchId: true,
      name: true,
      sellingPrice: true,
      baseUnitOfMeasure: true,
      targetMarginPercent: true,
      // The most recent real delivery — same source the Selling Price
      // Calculator's own margin insight already uses, so the email
      // and the screen never tell two different stories.
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
  const user = await requireStoreStaff(part.branchId);
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
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
    // eslint-disable-next-line no-console
    console.error('Failed to send selling price notification emails', partId, err);
  }
}

/** The real margin Store wants to hold on this Part going forward —
 * what the Pricing Command Center actually compares every new real
 * delivery cost against. Deliberately its own separate action from
 * setPartSellingPrice above, not folded into the same form: the two
 * are genuinely different decisions (what to charge, versus how much
 * margin is acceptable to hold), made at different times for
 * different reasons. */
/** Accepts the target in whichever real unit the business actually
 * thinks in — Margin or Markup — and always converts to the real
 * Margin that gets stored, using the one shared, canonical formula in
 * pricing-math.ts. This is the one real place that conversion has to
 * happen correctly: get it wrong here and every Pricing Alert this
 * Part ever raises compares against the wrong real number, silently,
 * for as long as it goes unnoticed — confirmed directly this is
 * exactly the real mistake a user can otherwise make by hand. */
export async function setPartTargetMargin(partId: string, targetValue: number, pricingMethod: 'MARGIN' | 'MARKUP'): Promise<void> {
  const part = await prisma.part.findUnique({ where: { id: partId }, select: { branchId: true, name: true, targetMarginPercent: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId);
  if (!(targetValue > 0) || targetValue > (pricingMethod === 'MARGIN' ? 100 : 100000)) {
    throw new StoreActionError(
      pricingMethod === 'MARGIN'
        ? 'Target Margin must be a real percentage greater than 0 and no more than 100.'
        : 'Target Markup must be a real percentage greater than 0.',
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

  // Every genuine pricing decision on a Part notifies Store — a
  // Target change is just as real a decision as the selling price
  // itself, since it's the exact number every future Pricing Alert
  // on this Part gets compared against. Never blocks the save if
  // sending fails.
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
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
    // eslint-disable-next-line no-console
    console.error('Failed to send target-margin-set notification emails', partId, err);
  }
}

/** Replaces a part's full set of alternative units in one call — the
 * real correction this was built for: fixing a wrong conversion factor
 * (e.g. a drum genuinely being 205L, not 208L, confirmed against a real
 * carton photo) or adding a newly-discovered one (e.g. Brake Fluid
 * arriving by the Carton as well as loose Bottles) both just mean
 * submitting the corrected full list — never a partial patch that could
 * leave a stale, wrong unit sitting alongside the fix. */
export async function setPartAlternativeUnits(
  partId: string,
  units: { unitName: string; conversionFactor: number }[],
): Promise<void> {
  const part = await prisma.part.findUnique({ where: { id: partId }, select: { branchId: true, baseUnitOfMeasure: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId);
  const cleaned = units
    .map((u) => ({ unitName: u.unitName.trim(), conversionFactor: u.conversionFactor }))
    .filter((u) => u.unitName && u.conversionFactor > 0);
  for (const u of cleaned) {
    if (u.unitName === part.baseUnitOfMeasure) {
      throw new StoreActionError(`"${u.unitName}" is already this part's base unit — an alternative unit must be genuinely different.`);
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

/** Records one real vehicle configuration a part fits. A part with no
 * fitment rows at all is treated as fitting everything (see
 * getFittingPartsForVehicle below) — so this is only ever needed for
 * parts that genuinely vary by vehicle, never as a formality for the
 * universal ones (engine oil, coolant, brake fluid, penetrating oil). */
export async function createPartFitment(input: CreatePartFitmentInput): Promise<{ id: string }> {
  const part = await prisma.part.findUnique({ where: { id: input.partId }, select: { branchId: true } });
  if (!part) {
    throw new StoreActionError('Part not found.');
  }
  const user = await requireStoreStaff(part.branchId);
  const make = input.make.trim();
  const model = input.model?.trim() || null;
  const engineType = input.engineType?.trim() || null;
  if (!make) {
    throw new StoreActionError('Make is required.');
  }
  // The real, standing hierarchy: each narrower field is only ever
  // meaningful once every broader one is genuinely set too — an
  // Engine or a Year range without a real Model doesn't describe
  // anything real (which model's engine? which model's year range?).
  // Model itself has no such requirement beyond Make, which is
  // already always required above.
  if (!model && engineType) {
    throw new StoreActionError('Set a Model before adding a specific Engine — an engine type on its own, without a model, isn\'t a real vehicle configuration.');
  }
  if (!model && (input.yearFrom || input.yearTo)) {
    throw new StoreActionError('Set a Model before adding a Year range — a year range on its own, without a model, isn\'t a real vehicle configuration.');
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

/** Editing an existing fitment row in place — e.g. adding an Engine or
 * Year range that was left blank the first time — rather than forcing
 * a delete-and-recreate, which would needlessly lose the row's own
 * history (createdAt, and the audit trail entry for when it was first
 * added) for what's really just a correction. */
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
  const user = await requireStoreStaff(fitment.part.branchId);
  const make = input.make.trim();
  const model = input.model?.trim() || null;
  const engineType = input.engineType?.trim() || null;
  if (!make) {
    throw new StoreActionError('Make is required.');
  }
  // The exact same real hierarchy as createPartFitment above — a
  // genuine edit that clears Model back out (the real bug this
  // fixes) is only refused if it would leave a real Engine or Year
  // range behind with nothing real left for them to describe.
  if (!model && engineType) {
    throw new StoreActionError('Set a Model before adding a specific Engine — an engine type on its own, without a model, isn\'t a real vehicle configuration.');
  }
  if (!model && (input.yearFrom || input.yearTo)) {
    throw new StoreActionError('Set a Model before adding a Year range — a year range on its own, without a model, isn\'t a real vehicle configuration.');
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
  const user = await requireStoreStaff(fitment.part.branchId);
  await prisma.partFitment.delete({ where: { id: fitmentId } });
  await writeAuditLog({ userId: user.id, action: 'part.fitment_removed', entityType: 'Part', entityId: fitment.partId, metadata: { make: fitment.make, model: fitment.model } });
}

export async function listPartFitments(partId: string) {
  await requireUser();
  return prisma.partFitment.findMany({ where: { partId }, orderBy: { createdAt: 'asc' } });
}

/** The real matching logic: a part with zero fitment rows fits every
 * vehicle (the correct default for the universal parts — nothing extra
 * to configure for them). A part WITH fitment rows fits a given vehicle
 * only if at least one row matches its make+model, and (when that row
 * specifies an engine) the vehicle's own engine too, and (when that row
 * specifies a year range) the vehicle's own year falls inside it. A row
 * that leaves engine/year unset is intentionally permissive on that
 * dimension — "fits every engine of this make/model" or "fits every
 * year of this make/model," not a row that silently never matches. */
export async function getFittingPartsForVehicle(
  branchId: string,
  vehicle: { make?: string | null; model?: string | null; engineType?: string | null; year?: number | null },
  search?: string,
  partTypeId?: string,
) {
  await requireUser();
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
  const user = await requireStoreStaff(branchId);
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new StoreActionError('Part Category name is required.');
  }
  // Uppercased and stripped to letters/digits — this becomes a literal
  // Part Number prefix (e.g. "FIL-001"), so it needs to be exactly
  // what it looks like, not whatever casing or stray punctuation was
  // typed.
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
  return prisma.partCategory.findMany({ where: { branchId }, orderBy: { name: 'asc' } });
}

/** The specific, customer-facing kind of part a technician actually
 * picks (e.g. "Fuel Filter") — always under exactly one parent
 * PartCategory (e.g. "Filter"), confirmed as a genuine two-level tree,
 * not a single flat list: "Filter" containing "Oil Filter"/"Fuel
 * Filter", "Fluid" containing "Coolant"/"Engine Oil"/"Brake Fluid". */
export async function createPartType(branchId: string, categoryId: string, name: string, description?: string): Promise<{ id: string }> {
  const user = await requireStoreStaff(branchId);
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

/** The generic, technician-facing catalog — what a technician actually
 * searches when adding a STORE_PART line to an estimate. Deliberately
 * a completely separate list from listParts()'s own real, vehicle-
 * specific Parts: a technician should never see "Fuel Filter — Foton
 * Tunland" as an option, only the generic "Fuel Filter" itself. Each
 * result carries its own parent category's name, so the real two-
 * level tree (Filter → Oil Filter/Fuel Filter, Fluid → Coolant/Engine
 * Oil/Brake Fluid) is genuinely browsable, not flattened away. */
export async function listPartTypes(branchId: string, search?: string) {
  await requireUser();
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
      // Only ever used to compute typicalUnit below — every real Part
      // under a given Part Type almost always shares the same base
      // unit (they're the same kind of thing, just different vehicle
      // variants), which is what makes this a genuinely honest
      // preview rather than a guess.
      parts: { where: { isActive: true }, select: { baseUnitOfMeasure: true } },
    },
  });
  return types.map((t: (typeof types)[number]) => {
    const distinctUnits = new Set(t.parts.map((p: (typeof t.parts)[number]) => p.baseUnitOfMeasure));
    return {
      ...t,
      // A confident preview only when every real Part under this type
      // genuinely agrees — null (shown as "varies" or "not yet known"
      // by callers) when there are zero Parts yet, or when they
      // disagree, rather than ever guessing wrong.
      typicalUnit: distinctUnits.size === 1 ? ([...distinctUnits][0] ?? null) : null,
    };
  });
}

/** SearchableOption-shaped wrapper around listPartTypes — the real
 * search a technician's Store Part picker and a new Part's own
 * registration form both actually use. Kept separate from
 * listPartTypes itself (which stays exactly as it is for the
 * management page's own full-tree view) since this is a genuinely
 * different shape for a genuinely different purpose: a flat,
 * searchable list of {value, label, sublabel} for SearchableSelect,
 * not the nested category→type tree the management page renders. */
export async function searchPartTypesForSelect(branchId: string, query: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  const types = await listPartTypes(branchId, query);
  return types.map((t: (typeof types)[number]) => ({ value: t.id, label: t.name, sublabel: t.category.name }));
}

/** Shown before the person has typed anything — every Part Type at
 * this branch, so browsing the full (usually short) list needs zero
 * typing, same reasoning as loadDefaultOptions everywhere else this
 * component is used. */
export async function listAllPartTypesForSelect(branchId: string): Promise<{ value: string; label: string; sublabel?: string }[]> {
  return searchPartTypesForSelect(branchId, '');
}

export async function searchPartCategoriesForSelect(branchId: string, query: string): Promise<{ value: string; label: string }[]> {
  const categories = await listPartCategories(branchId);
  const q = query.trim().toLowerCase();
  const filtered = q ? categories.filter((c: (typeof categories)[number]) => c.name.toLowerCase().includes(q)) : categories;
  return filtered.map((c: (typeof categories)[number]) => ({ value: c.id, label: c.name }));
}

export async function listAllPartCategoriesForSelect(branchId: string): Promise<{ value: string; label: string }[]> {
  return searchPartCategoriesForSelect(branchId, '');
}

/** The real "price registered with the last goods receipt" — the exact
 * source of truth this was built around: never a price Store retypes,
 * always the most recent actual cost this Part was genuinely received
 * at. Skips any receipt line that was recorded with no cost at all
 * (unitCost is optional on a Goods Receipt), rather than treating a
 * missing cost as if it were genuinely zero. Returns null when the
 * Part has no cost on record at all — a real, honest "we don't know
 * yet" rather than a silent, misleading zero. */
export async function getLastKnownUnitCostForPart(partId: string): Promise<number | null> {
  await requireUser();
  const line = await prisma.goodsReceiptLine.findFirst({
    where: { partId, unitCost: { not: null } },
    orderBy: { goodsReceipt: { receivedAt: 'desc' } },
    select: { unitCost: true },
  });
  return line ? Number(line.unitCost) : null;
}

/** Store's own real action on an estimate — matching a technician's
 * generic request (a PartType, e.g. "Fuel Filter") to the one real,
 * vehicle-fitting catalog Part that actually satisfies it, with the
 * price pulled from that Part's own last real Goods Receipt cost.
 * Never a price Store types in themselves — matches the same
 * "auto-fill, never retype" principle already established for Goods
 * Receipt's own price recording. Lives here in store.ts rather than
 * workshop.ts specifically to avoid a circular import: store.ts
 * already imports auth/audit helpers from workshop.ts, so the
 * dependency only ever needs to run one direction. */
/** Every Store Part line, across every Job Card at this branch, that's
 * genuinely ready for Store to act on — its estimate has been
 * submitted, but this specific line hasn't been matched to a real
 * catalog Part yet. Includes exactly the vehicle context
 * getFittingPartsForVehicle needs (Make/Model/Engine/Year), so this
 * list can go straight into a matching action without a second
 * lookup. */
export async function listUnmatchedStorePartLines(branchId: string) {
  await requireUser();
  return prisma.estimateLineItem.findMany({
    where: {
      type: 'STORE_PART',
      matchedPartId: null,
      // DRAFT is included alongside SUBMITTED for the same reason
      // matching itself now allows it — but matchingRequestedAt not
      // being null is what actually keeps this queue honest: only
      // estimates a technician has deliberately asked Store to act
      // on show up here, not every in-progress draft someone's still
      // mid-way through building.
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
              vehicle: { select: { make: true, model: true, engineType: true, year: true } },
            },
          },
        },
      },
    },
  });
}

/** The same real queue, scoped to exactly one Job Card — what the
 * dedicated per-Job-Card matching page actually uses, so opening one
 * Job Card's own matching doesn't need to fetch (or discard) every
 * other Job Card's own unmatched lines just to show this one. */
export async function listUnmatchedStorePartLinesForJobCard(jobCardId: string) {
  await requireUser();
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

/** The real fix for a genuine deadlock: a Store Part line only ever
 * gets a price once Store matches it, but an estimate can't be
 * submitted until every line already has one — so without this,
 * submitting any estimate containing a Store Part was never actually
 * possible. This is the explicit request that opens the door: notifies
 * Store (with only this Job Card's own unmatched lines, never the
 * whole estimate) and lets Supervisor/Technician know submission is on
 * hold until Store is done. Repeatable — a newly-added Store Part line
 * later, or a nudge Store missed, is a legitimate reason to call this
 * again; matchingRequestedAt just gets refreshed, not re-validated
 * against being already set. */
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
            select: { description: true, quantity: true },
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
    throw new StoreActionError('Only the assigned supervisor, the assigned technician, or a Master Administrator can request Store matching.');
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;

    for (const recipient of storeRecipients.values()) {
      await sendEmail(
        recipient.email,
        `Store matching requested — Job Card ${jobCard.jobNumber}`,
        renderStoreMatchingRequestedEmail({
          recipientName: recipient.fullName,
          requestedByName: requestedByUser?.fullName ?? 'A team member',
          jobNumber: jobCard.jobNumber,
          customerName: jobCard.customer.fullName,
          lines: jobCard.estimate.lineItems,
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
        `Awaiting Store match — Job Card ${jobCard.jobNumber}`,
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
    // eslint-disable-next-line no-console
    console.error('Failed to send Store matching request emails', jobCardId, err);
  }
}

/** Store's own signal that they're done — the counterpart to
 * requestStoreMatching above. Deliberately requires zero unmatched
 * lines to remain (never a partial "some done" signal, which would
 * just recreate the same ambiguity this whole feature exists to
 * remove) and is itself repeatable, same reasoning as the request
 * side. */
/** The real notification itself, factored out so it can fire two
 * genuinely different ways: automatically, the instant the last real
 * unmatched Store Part line for a Job Card gets matched (the same
 * "the system notices and acts, nobody has to remember to click
 * anything" pattern already proven for the 70%-payment auto-
 * transition), or — kept for now as a fallback — through the
 * existing manual action. Takes an already-verified actor rather than
 * re-checking Store staff itself, since the automatic path is always
 * called from inside an action that already did that check for its
 * own reason (matching the line itself). */
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
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
    // eslint-disable-next-line no-console
    console.error('Failed to send Store matching complete emails', jobCard.id, err);
  }
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
  // DRAFT is included deliberately, not just SUBMITTED — a Store Part
  // line only ever gets a real price once matched, but submission
  // itself requires every line already priced. Restricting matching
  // to SUBMITTED-only would make submitting an estimate with any
  // Store Part in it genuinely impossible: a real deadlock, not just
  // an inconvenience. Matching has to be allowed to happen first,
  // before submission, whenever Store Parts are involved.
  if (lineItem.estimate.status !== 'DRAFT' && lineItem.estimate.status !== 'SUBMITTED') {
    throw new StoreActionError('This estimate is not currently awaiting Store matching.');
  }
  const user = await requireStoreStaff(lineItem.estimate.jobCard.branchId);

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
  // The one real, deliberate safeguard fitment exists for: a Part
  // with no fitment rows at all is genuinely treated as universal
  // (fluids, cleaners, generic consumables — real parts that fit
  // every vehicle, not an oversight) and always allowed through
  // untouched, exactly as already documented and displayed on the
  // Part's own page. A Part that DOES have real fitment rows on
  // record, though, is a real, discrete component this workshop has
  // deliberately said only fits specific vehicles — matching it onto
  // a Job Card whose own vehicle isn't on that list is the exact
  // real mistake this was built to prevent, so it's a genuine block
  // here, not just a warning that's easy to click past.
  if (part.fitments.length > 0) {
    const vehicle = lineItem.estimate.jobCard.vehicle;
    // A Job Card whose own vehicle record is missing make/model
    // entirely can't be checked either way — blocking here would
    // punish an incomplete vehicle record that was never the Store
    // operator's own mistake, so this one real case is let through.
    const canCheck = vehicle?.make && vehicle?.model;
    const fits = !canCheck || part.fitments.some((f: { make: string; model: string | null; engineType: string | null; yearFrom: number | null; yearTo: number | null }) => {
      if (f.make.toLowerCase() !== vehicle!.make!.toLowerCase()) return false;
      // Null model means "fits every model of this make" — the exact
      // real fix for a genuine bug where a fitment row could never be
      // widened back out to this once it had a real model set.
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
        `${part.name} is only recorded to fit specific vehicles, and ${vehicleLabel} isn't one of them — this would be the exact real mistake Vehicle Fitment exists to prevent. If this Part genuinely does fit, add ${vehicleLabel} to its Vehicle Fitment list first.`,
      );
    }
  }
  if (lineItem.partTypeId && part.partTypeId !== lineItem.partTypeId) {
    throw new StoreActionError(`${part.name} is not the requested Part Type for this line.`);
  }

  // The real, deliberately-set customer-facing price — never the raw
  // Goods Receipt cost. Those are genuinely different numbers for a
  // genuine reason: cost is what Store paid a supplier, selling price
  // is what a customer is actually charged, and the gap between them
  // is the whole business's real margin. No silent fallback to cost
  // if this isn't set — that would just recreate the exact bug this
  // was built to fix.
  if (part.sellingPrice === null) {
    throw new StoreActionError(`${part.name} has no selling price set yet — set one on the Part's own page before matching.`);
  }
  // The one real hard-stop the Pricing Command Center enforces, not
  // just a dashboard warning: a Part currently priced below its own
  // real cost can never be matched onto a customer's estimate — every
  // such match would be a genuine, real loss on this specific job,
  // not a hypothetical one. Resolved (someone actually fixed the
  // price) or dismissed (a real, deliberate decision to sell at this
  // price anyway) alerts don't block anything — only a still-open one.
  const openCriticalLoss = await prisma.pricingAlert.findFirst({
    where: { partId, severity: 'CRITICAL_LOSS', status: 'OPEN' },
    select: { id: true },
  });
  if (openCriticalLoss) {
    throw new StoreActionError(`${part.name} is currently priced below its own real cost — resolve the open Pricing Alert on this Part before matching it to an estimate.`);
  }
  const unitPrice = Number(part.sellingPrice);
  const amount = Math.round(unitPrice * lineItem.quantity * 100) / 100;

  await prisma.estimateLineItem.update({
    where: { id: lineItemId },
    // The real unit, auto-synced from the matched Part's own
    // baseUnitOfMeasure — this is the entire point of the request:
    // the technician never enters it, it always matches exactly
    // what's actually registered for the real part.
    data: { matchedPartId: partId, unitPrice, amount, unitOfMeasure: part.baseUnitOfMeasure },
  });

  await writeAuditLog({
    userId: user.id,
    action: 'estimate_line.store_matched',
    entityType: 'EstimateLineItem',
    entityId: lineItemId,
    metadata: { partId, partName: part.name, unitPrice, amount },
  });
  // The real gap this closes: without this second entry, Store's own
  // matching work never showed up on the Job Card's own timeline at
  // all — only on the line item's own, effectively invisible record.
  // Same "one entry against the real entity, one against the Job
  // Card" pattern already proven throughout the Sourcing module.
  await writeAuditLog({
    userId: user.id,
    action: 'estimate_line.store_matched',
    entityType: 'JobCard',
    entityId: lineItem.estimate.jobCard.id,
    metadata: { partName: part.name, unitPrice, amount },
  });

  // The automatic replacement for what used to be a manual "Notify —
  // Matching Complete" button — genuinely the same pattern already
  // proven for the 70%-payment auto-transition: the system notices
  // the real condition (nothing left unmatched for this estimate) the
  // instant it becomes true, and acts on it right then, rather than
  // waiting for someone to remember to click something. Checked fresh
  // here rather than trusted from before this match, since this
  // match itself is what might have just made it true.
  const remainingUnmatched = await prisma.estimateLineItem.count({
    where: { estimateId: lineItem.estimate.id, type: 'STORE_PART', matchedPartId: null },
  });
  if (remainingUnmatched === 0) {
    await sendStoreMatchingCompleteNotification(lineItem.estimate.jobCard, user.id);
  }
}

export async function listParts(branchId: string, search?: string) {
  await requireUser();
  const q = search?.trim();
  return prisma.part.findMany({
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
  return prisma.part.findUnique({
    where: { id },
    include: {
      stock: true,
      alternativeUnits: true,
      // Every batch, not just ones with stock left — a fully sold-out
      // batch is exactly what the real sales/profit tracking below
      // needs to show ("how much sold, how much remaining" genuinely
      // means remaining can be zero), so filtering those out here
      // would hide the very history this view exists to surface.
      batches: {
        orderBy: { receivedAt: 'asc' },
        include: {
          goodsReceiptLine: { select: { unitCost: true, goodsReceipt: { select: { id: true, referenceNumber: true } } } },
          // Every real draw against this batch — who it actually went
          // to, via which real request — the direct answer to "which
          // customer got stock from this delivery" for a warranty or
          // quality-defect trace.
          consumptions: {
            orderBy: { consumedAt: 'desc' },
            include: {
              slipLine: {
                select: {
                  slip: {
                    select: {
                      id: true,
                      referenceNumber: true,
                      jobCard: { select: { id: true, jobNumber: true, customer: { select: { fullName: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // Every serial, not just the ones still in stock — the same
      // real reasoning as batches above: a fully issued-out serial is
      // exactly the kind of real history this tracking view exists to
      // surface, not something to quietly hide.
      serials: {
        orderBy: { receivedAt: 'asc' },
        include: {
          goodsReceiptLine: { select: { unitCost: true, goodsReceipt: { select: { id: true, referenceNumber: true } } } },
          // Exactly which real request this specific physical unit
          // was issued out against — the direct answer to "who has
          // this serial" for a warranty trace.
          issuedToSlipLine: {
            select: {
              slip: {
                select: {
                  id: true,
                  referenceNumber: true,
                  jobCard: { select: { id: true, jobNumber: true, customer: { select: { fullName: true } } } },
                },
              },
            },
          },
        },
      },
      fitments: { orderBy: { createdAt: 'asc' } },
      createdBy: { select: { fullName: true } },
      // Every real delivery, not just the most recent — a
      // quantity-tracked Part keeps no batch or serial records of its
      // own, so this is the only real source for "how much has this
      // Part ever received in total," used alongside the Part's own
      // current on-hand total to show real sold-to-date/profit
      // figures even for a tracking type with no per-delivery split.
      // The most recent one (index 0, since this is already sorted
      // newest-first) is still what the Selling Price Calculator's
      // own "Purchase Details" uses, exactly as before.
      goodsReceiptLines: { orderBy: { goodsReceipt: { receivedAt: 'desc' } }, include: { goodsReceipt: { select: { id: true, referenceNumber: true, receivedAt: true } } } },
      // A QUANTITY-tracked Part's own real "who took what" trail —
      // the same real answer batches/serials give above, for the one
      // tracking type that otherwise has no per-delivery structure at
      // all to hang it on.
      quantityConsumptions: {
        orderBy: { consumedAt: 'desc' },
        include: {
          slipLine: {
            select: {
              slip: {
                select: {
                  id: true,
                  referenceNumber: true,
                  jobCard: { select: { id: true, jobNumber: true, customer: { select: { fullName: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export type GoodsReceiptLineInput = {
  partId: string;
  quantityReceivedInUnit: number;
  unitUsed: string;
  // The real, primary figure Store actually knows and enters — what
  // the whole delivery cost, in whatever unit it was received in
  // (e.g. "₦650,000 for the 1 Drum received"), not a per-unit price
  // nobody has to hand-calculate first. Required now, not optional —
  // a Goods Receipt with no cost on record was never genuinely
  // useful for anything downstream (pricing, valuation), so making
  // it optional just meant catching the gap later instead of now.
  totalCost: number;
  /** Required, and only meaningful, for a BATCH-tracked part. */
  batchNumber?: string;
  /** Required, and only meaningful, for a SERIALIZED part — one entry per
   * physical unit received; its length is the real received quantity for
   * that case, not quantityReceivedInUnit (which still carries whatever
   * the storekeeper typed, for the record, but the serials are the
   * source of truth for how many units this line actually represents). */
  serialNumbers?: string[];
};

export type RecordGoodsReceiptInput = {
  branchId: string;
  supplierName: string;
  notes?: string;
  lines: GoodsReceiptLineInput[];
};

/** The real-time counterpart to recordGoodsReceipt's own server-side
 * duplicate check — a serial number is meant to be a genuine,
 * permanent, one-of-a-kind identity for a single physical unit,
 * checked against every serial ever recorded for any Part, so an
 * operator sees the real problem the moment they type it, not only
 * after submitting the whole form and getting a rejection back. */
export async function checkSerialNumberExists(serialNumber: string): Promise<boolean> {
  await requireUser();
  const trimmed = serialNumber.trim();
  if (!trimmed) return false;
  const existing = await prisma.partSerial.findFirst({ where: { serialNumber: trimmed }, select: { id: true } });
  return existing !== null;
}

/** Records a delivery of stock arriving into the store. Converts each
 * line's entered quantity into the part's own base unit before touching
 * stock — the same drum-to-liters conversion this was designed around —
 * and updates the tracking-type-appropriate stock representation (a
 * batch row, individual serial rows, or just the running total) plus the
 * always-current PartStock aggregate, all inside one transaction so a
 * partial failure can never leave stock and the receipt record
 * disagreeing with each other. */
export async function recordGoodsReceipt(input: RecordGoodsReceiptInput): Promise<{ id: string; referenceNumber: string }> {
  const user = await requireStoreStaff(input.branchId);
  const supplierName = input.supplierName.trim();
  if (!supplierName) {
    throw new StoreActionError('Supplier name is required.');
  }
  if (!input.lines || input.lines.length === 0) {
    throw new StoreActionError('At least one line item is required.');
  }

  const partIds = [...new Set(input.lines.map((l) => l.partId))];
  const parts = await prisma.part.findMany({
    where: { id: { in: partIds } },
    include: { alternativeUnits: true },
  });
  // Derived from `parts`'s own real, Prisma-inferred type — not a
  // hand-written approximation. That distinction matters concretely:
  // an earlier version of this exact line declared conversionFactor as
  // `number`, which is how it's actually *used* (via Number(...)), but
  // its real type here is Prisma's own Decimal — a mismatch the real
  // compiler correctly rejected even though it looked reasonable.
  const partById = new Map<string, (typeof parts)[number]>(parts.map((p) => [p.id, p]));

  // Validated up front, before any writes — every line must resolve to a
  // real conversion and satisfy its tracking type's own requirement,
  // or nothing in this receipt is recorded at all.
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
    // The one, real cost figure that's never subject to a round-trip
    // precision loss — it's exactly what was typed, the total for the
    // whole delivery. Everything else (a per-unit cost in whatever
    // unit was actually used, and the per-base-unit cost used for
    // pricing math) is derived FROM this, once, and never the other
    // way around.
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
      // The real fix for a genuine bug: cost is always entered for
      // the unit actually picked (e.g. "₦650,000 for the Drum
      // received"), but stock — and every later price computed from
      // it — is always tracked in the base unit (Liters). Storing the
      // Drum price as if it were already a per-Liter price meant
      // Store matching would later multiply a customer's real Liter
      // quantity by a cost meant for a whole 205L Drum, producing
      // wildly wrong estimate totals. Converting here, once, at the
      // moment of entry, is what keeps unitCost and quantityInBaseUnit
      // in the same real unit from here on.
      unitCostInBaseUnit = Math.round((unitCostAsEntered / conversionFactor) * 1_000_000) / 1_000_000;
    }
    // Rounded once, at the very end, purely for storage/display — the
    // real value used throughout this function is still the exact
    // line.totalCost the user actually typed, never recomputed from
    // anything derived above.
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
      // The real guarantee, not just the client-side hint — a
      // serialized part's real quantity IS its serial count, so these
      // two numbers disagreeing is never a valid receipt to record.
      if (serials.length !== line.quantityReceivedInUnit) {
        throw new StoreActionError(
          `${part.name}: ${pluralize(serials.length, 'serial number')} entered, but quantity received was ${line.quantityReceivedInUnit}. These must match exactly.`,
        );
      }
    }

    return { ...line, part, quantityInBaseUnit, unitCostInBaseUnit, totalCost };
  });

  // Global, not just within this one receipt — a serial number is
  // meant to be a real, permanent, one-of-a-kind identity for a
  // single physical unit across the entire catalog, not just unique
  // within whatever happened to be typed on this one form. Checked
  // against every serial ever recorded for any Part, not just this
  // one — the same real mistake (re-using a serial by accident) is
  // just as wrong whether it collides with a Tyre or a Rim.
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

  const referenceNumber = await generateGoodsReceiptNumber();

  // The real, most recent prior cost on record for each real Part in
  // this receipt — fetched once, up front, purely for the Pricing
  // Command Center's own historical context on whatever alert gets
  // raised below (what cost was this actually compared against
  // before). A Part with no earlier delivery at all genuinely has no
  // real prior cost — stays unset rather than a fabricated "0" or a
  // copy of the new cost.
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

  // Collected here, sent only after the transaction genuinely
  // commits — a real, immediate email about a Pricing Alert that
  // then rolled back would be a real, honest lie. Never sent from
  // inside the transaction itself for exactly that reason.
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

  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.goodsReceipt.create({
      data: {
        branchId: input.branchId,
        referenceNumber,
        supplierName,
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

      // Pricing Command Center — auto-compared right here, the exact
      // real moment a genuinely new cost is recorded, on every real
      // Goods Receipt line. Silently skipped whenever the Part hasn't
      // had a real sellingPrice AND a real targetMarginPercent set
      // yet — nothing to genuinely compare against, not a problem.
      if (line.part.sellingPrice !== null && line.part.targetMarginPercent !== null) {
        const sellingPrice = Number(line.part.sellingPrice);
        const targetMarginPercent = Number(line.part.targetMarginPercent);
        const actualMarginPercent = ((sellingPrice - line.unitCostInBaseUnit) / sellingPrice) * 100;
        const severity =
          actualMarginPercent < 0
            ? 'CRITICAL_LOSS'
            : actualMarginPercent < targetMarginPercent
              ? 'DEFICIT'
              : actualMarginPercent > targetMarginPercent
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

  await writeAuditLog({
    userId: user.id,
    action: 'goods_receipt.recorded',
    entityType: 'GoodsReceipt',
    entityId: receipt.id,
    metadata: { referenceNumber, supplierName, lineCount: resolvedLines.length },
  });

  // Confirms what was recorded to the person who recorded it (a real
  // written record, same reasoning every other "recorded" email in
  // this project already follows) and their Store Manager, so stock
  // arriving is never something a Manager only discovers by checking
  // the catalog themselves. One email per line — matches the current
  // single-line-per-receipt form exactly; if a future multi-line form
  // ever submits several lines in one call, this sends one email per
  // line rather than a combined summary, a known, honest limitation
  // of the current single-part-focused template.
  try {
    const [recordedByUser, orgContext, storeManagers] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true, email: true } }),
      getStoreOrgContext(),
      listEligibleStoreManagersForBranch(input.branchId),
    ]);
    if (recordedByUser) {
      const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app';
      const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
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
          logoUrl: `${websiteUrl}/images/logo/logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
        });
        for (const to of recipients) {
          await sendEmail(to, `Goods receipt recorded — ${referenceNumber}`, html);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send goods-receipt notification email', receipt.id, err);
  }

  // The real, immediate first notice for any genuinely new Pricing
  // Alert this delivery just raised — a real, separate email from the
  // one above (that one confirms a delivery happened; this one flags
  // a real pricing situation that needs a human decision), sent to
  // the same real Store audience. Never blocks the receipt itself if
  // sending fails.
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
      const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
      const logoUrl = `${portalUrl}/images/logo/logo.png`;
      const formatNairaForAlert = (value: number) => `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      for (const alert of newAlertsForEmail) {
        const recommendedPrice = priceForTargetMargin(alert.newUnitCost, alert.targetMarginPercent);
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
          await sendEmail(recipient.email, `${alert.severity === 'CRITICAL_LOSS' ? 'Critical Loss' : alert.severity === 'DEFICIT' ? 'Margin Deficit' : 'Margin Boost'} — ${alert.partName}`, html);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to send pricing-alert-raised emails', receipt.id, err);
    }
  }

  return { id: receipt.id, referenceNumber };
}

// ----------------------------------------------------------------------------
// PRICING COMMAND CENTER — real alerts auto-raised on every Goods Receipt
// (see recordGoodsReceipt), listed, resolved, dismissed, or acted on here.
// ----------------------------------------------------------------------------

export type PricingAlertSummary = {
  openBySeverity: { CRITICAL_LOSS: number; DEFICIT: number; BOOST: number };
  // The real, honest sum of what a genuine loss actually costs — every
  // open CRITICAL_LOSS alert's own real per-unit shortfall, multiplied
  // by however much of that Part is genuinely sitting in stock right
  // now. Not a projection of future sales, since no one can honestly
  // know those — just the real, current exposure if today's stock
  // sold at today's price.
  criticalLossExposure: number;
  // The real, honest average of how far every open DEFICIT alert's
  // own actual margin sits below its own real target — never a
  // single global number pretending every Part has the same target,
  // since they genuinely don't.
  averageDeficitGapPercent: number | null;
  // Real Parts with more than one open alert right now — the ones
  // worth a genuine, deliberate look rather than a one-off delivery
  // price swing.
  partsWithMultipleOpenAlerts: { partId: string; partName: string; openCount: number }[];
};

/** The real, honest analysis behind the Pricing Command Center's own
 * dashboard — computed fresh from whatever's genuinely open right
 * now, never a stored, potentially-stale snapshot. */
export async function getPricingAlertSummary(branchId: string): Promise<PricingAlertSummary> {
  await requireUser();
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

/** A real, deliberate decision that the current price is fine as it
 * stands — genuinely different from RESOLVED below, which means the
 * price actually changed in response. Requires a real reason, the
 * same "never a silent decision" standard already used for a
 * cancellation or a rework. */
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
    throw new StoreActionError('A real reason is required to dismiss a pricing alert.');
  }
  const user = await requireStoreStaff(alert.part.branchId);
  await prisma.pricingAlert.update({
    where: { id: alertId },
    data: { status: 'DISMISSED', resolvedById: user.id, resolvedAt: new Date(), resolutionNotes: trimmedNotes },
  });
  await writeAuditLog({ userId: user.id, action: 'pricing_alert.dismissed', entityType: 'PricingAlert', entityId: alertId, metadata: { partName: alert.part.name, notes: trimmedNotes } });
}

/** The real "Pricing Action Advisor" one-click move — sets
 * sellingPrice to exactly what's needed to hold the same real target
 * margin against the new cost this alert was raised over, using the
 * standard real formula (price = cost ÷ (1 − target÷100)), then marks
 * the alert genuinely resolved, not just dismissed, since the price
 * itself actually changed. */
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
  const user = await requireStoreStaff(alert.part.branchId);
  const targetMargin = Number(alert.targetMarginPercentAtAlert);
  const newUnitCost = Number(alert.newUnitCost);
  const newSellingPrice = Math.round((newUnitCost / (1 - targetMargin / 100)) * 100) / 100;
  const previousSellingPrice = alert.part.sellingPrice !== null ? Number(alert.part.sellingPrice) : null;

  await prisma.$transaction([
    prisma.part.update({ where: { id: alert.part.id }, data: { sellingPrice: newSellingPrice } }),
    prisma.pricingAlert.update({
      where: { id: alertId },
      data: { status: 'RESOLVED', resolvedById: user.id, resolvedAt: new Date(), resolutionNotes: `Price synced to ${newSellingPrice} to hold ${targetMargin}% margin.` },
    }),
  ]);
  await writeAuditLog({
    userId: user.id,
    action: 'part.selling_price_set',
    entityType: 'Part',
    entityId: alert.part.id,
    metadata: { name: alert.part.name, from: previousSellingPrice, to: newSellingPrice, viaPricingAlert: alertId },
  });

  // Real notification that price genuinely changed — the same
  // real email setPartSellingPrice's own manual-edit path already
  // sends, since this is genuinely the same kind of event (a Part's
  // selling price actually changed), just reached through a
  // different real path (a Pricing Alert's own "Sync Price" action,
  // not a manual edit). Never blocks the price change itself if it
  // fails.
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
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    const logoUrl = `${portalUrl}/images/logo/logo.png`;
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
          // Genuinely null here, not a fabricated insight — this
          // function only ever has the alert's own stored snapshot
          // (cost, price, margin), not the full quantity/revenue
          // context setPartSellingPrice's own manual-edit path has
          // available. The template already handles a null margin
          // insight gracefully; passing the bare target margin number
          // here instead would have been the wrong shape entirely.
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
    // eslint-disable-next-line no-console
    console.error('Failed to send price-sync notification emails', alert.part.id, err);
  }
}

export type PricingAlertDigestGroup = {
  branchId: string;
  branchName: string;
  companyName: string;
  recipients: { id: string; fullName: string; email: string }[];
  items: {
    partId: string;
    partName: string;
    baseUnitOfMeasure: string;
    severity: 'CRITICAL_LOSS' | 'DEFICIT' | 'BOOST';
    newUnitCost: number;
    sellingPriceAtAlert: number;
    actualMarginPercent: number;
    targetMarginPercentAtAlert: number;
  }[];
};

/** Deliberately does NOT call requireUser() — the one real, honest
 * exception to this file's own standard pattern, and a deliberate
 * one: this is only ever meant to be called from inside the real
 * cron route handler itself (see app/api/cron/pricing-alerts), which
 * has no logged-in user at all to require — its own real security is
 * the cron secret the route handler checks before ever calling this,
 * not a user session. Grouped by branch, with the real eligible
 * recipients (Store Manager + Store Officer, or the same Master Admin
 * fallback used everywhere else in this system) resolved per branch,
 * so the real cron route never needs its own copy of that logic. */
export async function getOpenPricingAlertsForDigest(): Promise<PricingAlertDigestGroup[]> {
  type OpenAlertRow = {
    severity: string;
    newUnitCost: unknown;
    sellingPriceAtAlert: unknown;
    actualMarginPercent: unknown;
    targetMarginPercentAtAlert: unknown;
    part: {
      id: string;
      name: string;
      baseUnitOfMeasure: string;
      branchId: string;
      branch: { name: string; businessUnit: { organisation: { name: string } } };
    };
  };
  const openAlerts: OpenAlertRow[] = await prisma.pricingAlert.findMany({
    where: { status: 'OPEN' },
    select: {
      severity: true,
      newUnitCost: true,
      sellingPriceAtAlert: true,
      actualMarginPercent: true,
      targetMarginPercentAtAlert: true,
      part: {
        select: {
          id: true,
          name: true,
          baseUnitOfMeasure: true,
          branchId: true,
          branch: { select: { name: true, businessUnit: { select: { organisation: { select: { name: true } } } } } },
        },
      },
    },
  });
  if (openAlerts.length === 0) return [];

  const branchIds: string[] = [...new Set(openAlerts.map((a: { part: { branchId: string } }) => a.part.branchId))];
  const groups: PricingAlertDigestGroup[] = [];
  for (const branchId of branchIds) {
    const branchAlerts = openAlerts.filter((a: { part: { branchId: string } }) => a.part.branchId === branchId);
    // The exact same real eligibility + Master Admin fallback logic
    // as listEligibleStoreManagersForBranch/listEligibleStoreOfficersForBranch
    // — deliberately re-implemented here inline rather than calling
    // those directly, since both call requireUser() internally and
    // this function is the one real, honest place in this file that
    // genuinely has no user session to give them (see this
    // function's own comment above for why that's correct here, not
    // a mistake).
    const staff: { id: string; fullName: string; email: string }[] = await prisma.user.findMany({
      where: {
        branchId,
        isActive: true,
        roles: { some: { role: { slug: { in: ['store-manager', 'store-officer'] } } } },
      },
      select: { id: true, fullName: true, email: true },
    });
    let recipients = staff;
    if (recipients.length === 0) {
      recipients = await prisma.user.findMany({
        where: { isActive: true, roles: { some: { role: { isSuperAdmin: true } } } },
        select: { id: true, fullName: true, email: true },
      });
    }
    groups.push({
      branchId,
      branchName: String(branchAlerts[0]!.part.branch.name),
      companyName: String(branchAlerts[0]!.part.branch.businessUnit.organisation.name),
      recipients,
      items: branchAlerts.map((a: { part: { id: string; name: string; baseUnitOfMeasure: string }; severity: string; newUnitCost: unknown; sellingPriceAtAlert: unknown; actualMarginPercent: unknown; targetMarginPercentAtAlert: unknown }) => ({
        partId: a.part.id,
        partName: a.part.name,
        baseUnitOfMeasure: a.part.baseUnitOfMeasure,
        severity: a.severity as 'CRITICAL_LOSS' | 'DEFICIT' | 'BOOST',
        newUnitCost: Number(a.newUnitCost),
        sellingPriceAtAlert: Number(a.sellingPriceAtAlert),
        actualMarginPercent: Number(a.actualMarginPercent),
        targetMarginPercentAtAlert: Number(a.targetMarginPercentAtAlert),
      })),
    });
  }
  return groups;
}

export async function listGoodsReceipts(branchId: string) {
  await requireUser();
  return prisma.goodsReceipt.findMany({
    where: { branchId },
    orderBy: { receivedAt: 'desc' },
    include: { receivedBy: { select: { fullName: true } }, lines: { select: { id: true } } },
  });
}

export async function getGoodsReceipt(id: string) {
  await requireUser();
  return prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      receivedBy: { select: { fullName: true } },
      lines: { include: { part: { select: { name: true, baseUnitOfMeasure: true } } } },
    },
  });
}

export async function getGoodsReceiptAuditTrail(goodsReceiptId: string) {
  await requireUser();
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'GoodsReceipt', entityId: goodsReceiptId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const userIds = [...new Set(entries.map((e: (typeof entries)[number]) => e.userId).filter((id: string | null): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
  const userById = new Map(users.map((u: (typeof users)[number]) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? (userById.get(e.userId) ?? 'Unknown') : 'System' }));
}

/** Mirrors getGoodsReceiptAuditTrail() exactly — the same real gap it
 * closed applies here too: without this, every selling-price decision
 * (and any future Part edit) would have a real audit_log row sitting
 * in the database with nobody ever able to actually see it on the
 * Part's own page. */
export async function getPartAuditTrail(partId: string) {
  await requireUser();
  const entries = await prisma.auditLog.findMany({
    where: { entityType: 'Part', entityId: partId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const userIds = [...new Set(entries.map((e: (typeof entries)[number]) => e.userId).filter((id: string | null): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
  const userById = new Map(users.map((u: (typeof users)[number]) => [u.id, u.fullName]));
  return entries.map((e: (typeof entries)[number]) => ({ ...e, userName: e.userId ? (userById.get(e.userId) ?? 'Unknown') : 'System' }));
}

/** Notifies every real Store Officer/Manager at the branch whenever a
 * recorded Goods Receipt is edited — deliberately more visible than a
 * quiet audit-log-only trail, since this is genuinely delicate: it's
 * a real historical financial record, and anyone editing it should
 * know Store itself is watching, not just a log nobody reads. */
async function notifyStoreOfGoodsReceiptEdit(branchId: string, editedByName: string, referenceNumber: string, changeSummary: string): Promise<void> {
  try {
    const [officers, managers] = await Promise.all([listEligibleStoreOfficersForBranch(branchId), listEligibleStoreManagersForBranch(branchId)]);
    const recipients = new Map<string, { fullName: string; email: string }>();
    for (const staffMember of [...officers.staff, ...managers.staff]) {
      recipients.set(staffMember.id, staffMember);
    }
    const orgContext = await getStoreOrgContext();
    const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
    for (const recipient of recipients.values()) {
      await sendEmail(
        recipient.email,
        `Goods Receipt edited — ${referenceNumber}`,
        renderGoodsReceiptEditedEmail({
          recipientName: recipient.fullName,
          editedByName,
          referenceNumber,
          changeSummary,
          goodsReceiptUrl: `${portalUrl}/inventory/goods-receipts`,
          logoUrl: `${portalUrl}/images/logo/logo.png`,
          companyName: orgContext.companyName,
          branchName: orgContext.branchName,
          departmentName: orgContext.departmentName,
        }),
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send Goods Receipt edit notification emails', referenceNumber, err);
  }
}

/** Editing only the header — Supplier and Notes — deliberately never
 * quantity, unit, or which Part: those are real physical facts about
 * what arrived, and correcting them safely would need real stock
 * reconciliation this doesn't attempt. Supplier and Notes are safe:
 * pure record-keeping, no effect on stock or price. */
export async function updateGoodsReceipt(id: string, input: { supplierName: string; notes?: string }): Promise<void> {
  const receipt = await prisma.goodsReceipt.findUnique({ where: { id }, select: { branchId: true, referenceNumber: true, supplierName: true, notes: true } });
  if (!receipt) {
    throw new StoreActionError('Goods Receipt not found.');
  }
  const user = await requireStoreStaff(receipt.branchId);
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
  // requireStoreStaff() only guarantees `{ id }` in its own declared
  // type — the real name for the email has to be looked up
  // separately, not assumed to already be on hand.
  const editedByUser = await prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
  await notifyStoreOfGoodsReceiptEdit(receipt.branchId, editedByUser?.fullName ?? 'A team member', receipt.referenceNumber, `Supplier/notes updated (was "${receipt.supplierName}")`);
}

/** The one field this whole page really exists for — correcting a
 * mistyped cost, entered in the exact same unit the line was
 * originally recorded in (e.g. "per Drum"), then re-converted to the
 * Part's own base-unit cost the same way recordGoodsReceipt() already
 * does it — never re-introducing the raw-unit-mismatch bug this
 * whole delivery started with. */
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
  const user = await requireStoreStaff(line.part.branchId);
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
  // The real, exact total — computed directly from what was actually
  // entered here (newUnitCostAsEntered × the quantity in that same
  // unit), never re-derived from the imprecise per-base-unit figure
  // above. The same fix as recordGoodsReceipt's own totalCost, kept
  // consistent through every later correction too.
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
    `${line.part.name}'s cost corrected to ${newUnitCostAsEntered} per ${line.unitUsed} — real total now ₦${totalCost.toLocaleString('en-NG')}`,
  );
}
