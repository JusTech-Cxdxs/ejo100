'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog } from './workshop';

// Deliberately NOT exported — a 'use server' file may only export
// async functions or types, per the standing rule this project
// already follows everywhere else (sourcing.ts's own
// SourcingActionError uses this exact same private-class pattern).
// Exporting this class the first time around was a real mistake that
// broke the Vercel build with a webpack error; callers still catch it
// fine as a generic Error via `err instanceof Error ? err.message : ...`.
class CompanyActionError extends Error {}

/** The one real Company record this whole portal is scoped to — there's
 * deliberately only ever one, so this fetches it directly rather than
 * requiring an id, the same way a single-tenant settings page should. */
export async function getCompany() {
  await requireUser();
  return prisma.company.findFirst({
    orderBy: { createdAt: 'asc' },
  });
}

export type UpdateCompanyInput = {
  name: string;
  legalName?: string;
  website?: string;
  hotline?: string;
  hqAddress?: string;
  pmb?: string;
  rcNumber?: string;
};

/** Only a Master Administrator can edit the company's own real,
 * printed identity — this is the information every receipt in the
 * whole system carries, not a per-branch setting. */
export async function updateCompany(companyId: string, input: UpdateCompanyInput): Promise<void> {
  const user = await requireUser();
  const isMasterAdmin = await prisma.user.findFirst({
    where: { id: user.id, roles: { some: { role: { isSuperAdmin: true } } } },
    select: { id: true },
  });
  if (!isMasterAdmin) {
    throw new CompanyActionError('Only a Master Administrator can edit company details.');
  }
  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new CompanyActionError('Company name is required.');
  }
  await prisma.company.update({
    where: { id: companyId },
    data: {
      name: trimmedName,
      legalName: input.legalName?.trim() || null,
      website: input.website?.trim() || null,
      hotline: input.hotline?.trim() || null,
      hqAddress: input.hqAddress?.trim() || null,
      pmb: input.pmb?.trim() || null,
      rcNumber: input.rcNumber?.trim() || null,
    },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'company.updated',
    entityType: 'Company',
    entityId: companyId,
    metadata: { name: trimmedName },
  });
}
