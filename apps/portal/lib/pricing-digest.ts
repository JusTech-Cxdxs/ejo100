import { prisma } from '@ejo/database';

/**
 * Server-only (NOT a 'use server' file — so it is never a callable endpoint).
 * Used only by the pricing-alerts cron route, which checks the cron secret.
 */


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

/** Open pricing alerts grouped by branch, with each branch's Store Manager
 * and Store Officer recipients (or the Master Admin fallback).
 * No requireUser(): only called from the pricing-alerts cron route, which
 * has no user session and checks the cron secret first. */
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
    // Same eligibility and fallback as listEligibleStoreManagersForBranch(),
    // inlined because those functions call requireUser().
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
