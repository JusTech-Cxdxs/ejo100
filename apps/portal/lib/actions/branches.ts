'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog } from './workshop';

class BranchActionError extends Error {}

export async function getBranches() {
  await requireUser();
  return prisma.branch.findMany({
    orderBy: { name: 'asc' },
    include: {
      businessUnit: { select: { name: true } },
      city: { select: { name: true, state: { select: { name: true } } } },
    },
  });
}

export async function getBranch(id: string) {
  await requireUser();
  return prisma.branch.findUnique({
    where: { id },
    include: {
      businessUnit: { select: { name: true } },
      city: { select: { name: true, state: { select: { name: true } } } },
    },
  });
}

export type UpdateBranchInput = {
  name: string;
  code?: string;
  address?: string;
  email?: string;
  hotlines?: string[];
};

/** Only a Master Administrator edits a branch's own real, printed
 * identity — the same real letterhead reasoning as Organisation, just
 * one level down: this is what a Job Card's own "Executing Facility"
 * block pulls its address and hotlines from. */
export async function updateBranch(branchId: string, input: UpdateBranchInput): Promise<void> {
  const user = await requireUser();
  const isMasterAdmin = await prisma.user.findFirst({
    where: { id: user.id, roles: { some: { role: { isSuperAdmin: true } } } },
    select: { id: true },
  });
  if (!isMasterAdmin) {
    throw new BranchActionError('Only a Master Administrator can edit branch details.');
  }
  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new BranchActionError('Branch name is required.');
  }
  const hotlines = (input.hotlines ?? []).map((h) => h.trim()).filter(Boolean);
  await prisma.branch.update({
    where: { id: branchId },
    data: {
      name: trimmedName,
      code: input.code?.trim() || null,
      address: input.address?.trim() || null,
      email: input.email?.trim() || null,
      hotlines,
    },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'branch.updated',
    entityType: 'Branch',
    entityId: branchId,
    metadata: { name: trimmedName },
  });
}
