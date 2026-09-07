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
class OrganisationActionError extends Error {}

/** The one real Organisation record this whole portal is scoped to —
 * there's deliberately only ever one, so this fetches it directly
 * rather than requiring an id, the same way a single-tenant settings
 * page should. */
export async function getOrganisation() {
  await requireUser();
  return prisma.organisation.findFirst({
    orderBy: { createdAt: 'asc' },
  });
}

export type UpdateOrganisationInput = {
  name: string;
  legalName?: string;
  website?: string;
  hotlines?: string[];
  hqAddress?: string;
  poBox?: string;
  rcNumber?: string;
};

/** Only a Master Administrator can edit the organisation's own real,
 * printed identity — this is the information every receipt in the
 * whole system carries, not a per-branch setting. */
export async function updateOrganisation(organisationId: string, input: UpdateOrganisationInput): Promise<void> {
  const user = await requireUser();
  const isMasterAdmin = await prisma.user.findFirst({
    where: { id: user.id, roles: { some: { role: { isSuperAdmin: true } } } },
    select: { id: true },
  });
  if (!isMasterAdmin) {
    throw new OrganisationActionError('Only a Master Administrator can edit organisation details.');
  }
  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new OrganisationActionError('Organisation name is required.');
  }
  // Every real hotline the operator actually typed, in the order
  // they entered them, with empty rows dropped — the same "only the
  // real, filled-in ones" reasoning already used for a Job Card's own
  // Complaints list.
  const hotlines = (input.hotlines ?? []).map((h) => h.trim()).filter(Boolean);
  await prisma.organisation.update({
    where: { id: organisationId },
    data: {
      name: trimmedName,
      legalName: input.legalName?.trim() || null,
      website: input.website?.trim() || null,
      hotlines,
      hqAddress: input.hqAddress?.trim() || null,
      poBox: input.poBox?.trim() || null,
      rcNumber: input.rcNumber?.trim() || null,
    },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'organisation.updated',
    entityType: 'Organisation',
    entityId: organisationId,
    metadata: { name: trimmedName },
  });
}
