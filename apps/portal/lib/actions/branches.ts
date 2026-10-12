'use server';
import { portalBaseUrl } from '@/lib/portal-url';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { after } from 'next/server';
import { authorize, getPrincipal } from '@/lib/authz/server';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';
import { logError } from '@/lib/errors';

class BranchActionError extends Error {}

export async function getBranches() {
  return prisma.branch.findMany({
    where: await myOrganisationBranches(),
    orderBy: { name: 'asc' },
    include: {
      businessUnit: { select: { name: true } },
      city: { select: { name: true, state: { select: { name: true } } } },
    },
  });
}

/** Branches of the signed-in person's own organisation (the platform team sees all). */
async function myOrganisationBranches(): Promise<{ businessUnit?: { organisationId: string } }> {
  const user = await requireUser();
  const [me, principal] = await Promise.all([prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } }), getPrincipal()]);
  if (principal.isSuperAdmin) return {};
  return { businessUnit: { organisationId: me?.organisationId ?? '__none__' } };
}

export async function getBranch(id: string) {
  // Another organisation's branch (bank details included) behaves as "not found".
  return prisma.branch.findFirst({
    where: { id, ...(await myOrganisationBranches()) },
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
  // The organisation's own administrators manage their branches (catalogue:
  // admin.structure.manage); never another organisation's branch.
  await authorize('admin.structure.manage', { branchId }, 'branch.update', 'You do not have permission to edit branch details.');
  const [me, principal, before] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } }),
    getPrincipal(),
    prisma.branch.findUnique({ where: { id: branchId }, select: { name: true, bankName: true, bankAccountName: true, bankAccountNumber: true, businessUnit: { select: { organisationId: true } } } }),
  ]);
  if (!before || (!principal.isSuperAdmin && before.businessUnit.organisationId !== me?.organisationId)) {
    throw new BranchActionError('Branch not found.');
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
  // The account customers pay into is a classic fraud target: any change is
  // recorded separately (before → after, account numbers masked) and the
  // branch's managers and finance officers are told at once.
  const changed = (before.bankName ?? null) !== bankName || (before.bankAccountName ?? null) !== bankAccountName || (before.bankAccountNumber ?? null) !== bankAccountNumber;
  if (changed) {
    const mask = (n: string | null) => (n ? `••••••${n.slice(-4)}` : 'none');
    const from = before.bankName ? `${before.bankName} · ${before.bankAccountName} · ${mask(before.bankAccountNumber)}` : 'none';
    const to = bankName ? `${bankName} · ${bankAccountName} · ${mask(bankAccountNumber)}` : 'none';
    await writeAuditLog({ userId: user.id, action: 'branch.bank_details_changed', entityType: 'Branch', entityId: branchId, metadata: { branch: trimmedName, from, to } });
    after(async () => {
      try {
        const [actor, watchers] = await Promise.all([
          prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } }),
          prisma.user.findMany({ where: { isActive: true, branchId, roles: { some: { role: { slug: { in: ['workshop-manager', 'finance-officer'] } } } } }, select: { fullName: true, email: true } }),
        ]);
        const portal = portalBaseUrl();
        for (const w of watchers) {
          if (!w.email) continue;
          await sendEmail(
            w.email,
            `Bank details changed for ${trimmedName}`,
            renderWarrantyStaffNoticeEmail({
              recipientName: w.fullName,
              heading: 'The branch bank account was changed',
              lines: [`Branch: ${trimmedName}`, `From: ${from}`, `To: ${to}`, `Changed by: ${actor?.fullName ?? 'an administrator'}`, 'Customers are told to pay into this account on every estimate. If you did not expect this change, report it immediately.'],
              actionUrl: `${portal}/branches/${branchId}`,
              logoUrl: `${portal}/images/logo/email-logo.png`,
              companyName: 'EJO 100',
              branchName: trimmedName,
            }),
          ).catch((err: unknown) => logError('branch.bank_details_email', err));
        }
      } catch (err) {
        logError('branch.bank_details_email', err);
      }
    });
  }
}
