'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';

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
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
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
    throw new BranchActionError('You do not have permission to edit branch details.');
  }
  const trimmedName = input.name?.trim();
  if (!trimmedName) {
    throw new BranchActionError('Branch name is required.');
  }
  const hotlines = (input.hotlines ?? []).map((h) => h.trim()).filter(Boolean);
  // Bank details: all three together, or none. Nigerian account numbers
  // (NUBAN) are exactly 10 digits.
  const bankName = input.bankName?.trim() || null;
  const bankAccountName = input.bankAccountName?.trim() || null;
  const bankAccountNumber = input.bankAccountNumber?.replace(/\s+/g, '') || null;
  const anyBank = bankName || bankAccountName || bankAccountNumber;
  if (anyBank && !(bankName && bankAccountName && bankAccountNumber)) {
    throw new BranchActionError('Fill in the bank name, account name and account number together — or leave all three empty.');
  }
  if (bankAccountNumber && !/^\d{10}$/.test(bankAccountNumber)) {
    throw new BranchActionError('The account number must be exactly 10 digits.');
  }
  await prisma.branch.update({
    where: { id: branchId },
    data: {
      name: trimmedName,
      code: input.code?.trim() || null,
      address: input.address?.trim() || null,
      email: input.email?.trim() || null,
      hotlines,
      bankName,
      bankAccountName,
      bankAccountNumber,
    },
  });
  await writeAuditLog({
    userId: user.id,
    action: 'branch.updated',
    entityType: 'Branch',
    entityId: branchId,
    metadata: { name: trimmedName, bankDetails: anyBank ? 'set' : 'not set' },
  });
}
