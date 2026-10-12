'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { authorize, getPrincipal } from '@/lib/authz/server';

// Not exported: a 'use server' file may only export async functions and
// types (exporting a class breaks the build). Callers catch it as Error.
class OrganisationActionError extends Error {}

/** The signed-in person's OWN organisation (its name and contacts head every
 * page and document). The platform team, who belong to none, see the first. */
export async function getOrganisation() {
  const user = await requireUser();
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } });
  if (me?.organisationId) {
    const own = await prisma.organisation.findUnique({ where: { id: me.organisationId } });
    if (own) return own;
  }
  return prisma.organisation.findFirst({ orderBy: { createdAt: 'asc' } });
}

export type UpdateOrganisationInput = {
  name: string;
  legalName?: string;
  website?: string;
  email?: string;
  hotlines?: string[];
  hqAddress?: string;
  poBox?: string;
  rcNumber?: string;
};

/** Edits the organisation's printed identity, shown on every receipt.
 * Organisation-wide, not per branch. */
export async function updateOrganisation(organisationId: string, input: UpdateOrganisationInput): Promise<void> {
  const user = await requireUser();
  // The organisation's own administrators (admin.organisation.manage), and
  // only for their own organisation.
  await authorize('admin.organisation.manage', undefined, 'organisation.update', 'You do not have permission to edit organisation details.');
  const [me, principal] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } }), getPrincipal()]);
  if (!principal.isSuperAdmin && me?.organisationId !== organisationId) {
    throw new OrganisationActionError('Organisation not found.');
  }
  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new OrganisationActionError('Organisation name is required.');
  }
  // Hotlines in the order entered, empty rows dropped.
  const hotlines = (input.hotlines ?? []).map((h) => h.trim()).filter(Boolean);
  await prisma.organisation.update({
    where: { id: organisationId },
    data: {
      name: trimmedName,
      legalName: input.legalName?.trim() || null,
      website: input.website?.trim() || null,
      email: input.email?.trim() || null,
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
