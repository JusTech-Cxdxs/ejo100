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

/** Does not call requireUser() — the one real, honest
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
