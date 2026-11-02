'use server';
import { orMasterAdmins } from '@/lib/master-fallback';
import { portalBaseUrl } from '@/lib/portal-url';

import { AREA_BRANCH_TYPES, BRANCH_TYPE_WORDS, departmentsFor, isBranchType } from '@/lib/branch-types';
import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { after } from 'next/server';
import { authorize, getPrincipal } from '@/lib/authz/server';
import { sendEmail } from '@/lib/email';
import { renderWarrantyStaffNoticeEmail } from '@/lib/email-templates/warranty-staff-notice';
import { logError } from '@/lib/errors';
import { PLATFORM } from '@/lib/brand';

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

/** Records that tie a branch to its kind: plant records (kits, vehicles, PDIs) and workshop records (job cards, services, stock). */
async function recordsHeld(branchId: string): Promise<{ plant: number; workshop: number }> {
  const [kits, shipments, vehicles, pdis, jobs, services, receipts] = await Promise.all([
    prisma.plantKit.count({ where: { branchId } }), prisma.plantShipment.count({ where: { branchId } }), prisma.plantVehicle.count({ where: { branchId } }), prisma.pdiInspection.count({ where: { branchId } }),
    prisma.jobCard.count({ where: { branchId } }), prisma.vehicleService.count({ where: { branchId } }), prisma.goodsReceipt.count({ where: { branchId } }),
  ]);
  return { plant: kits + shipments + vehicles + pdis, workshop: jobs + services + receipts };
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
  /** SAP plant code (WERKS), 4 letters or digits; undefined leaves it as it is. */
  sapPlant?: string;
  /** What kind of place it is (lib/branch-types.ts). */
  type?: string;
};

/** Edits a branch's printed identity: the address and hotlines on a Job
 * Card's "Executing Facility" block, and its bank details. */
export async function updateBranch(branchId: string, input: UpdateBranchInput): Promise<void> {
  const user = await requireUser();
  // The organisation's own administrators manage their branches (catalogue:
  // admin.structure.manage); never another organisation's branch.
  await authorize('admin.structure.manage', { branchId }, 'branch.update', 'You do not have permission to edit branch details.');
  const [me, principal, before] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { organisationId: true } }),
    getPrincipal(),
    prisma.branch.findUnique({ where: { id: branchId }, select: { name: true, type: true, sapPlant: true, bankName: true, bankAccountName: true, bankAccountNumber: true, businessUnit: { select: { organisationId: true } } } }),
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
  const sapPlant = input.sapPlant === undefined ? undefined : input.sapPlant.trim().toUpperCase() || null;
  const type = input.type === undefined ? undefined : isBranchType(input.type) ? input.type : before.type;
  if ((type ?? before.type) === 'ASSEMBLY_PLANT' && !(sapPlant === undefined ? before.sapPlant : sapPlant)) {
    throw new BranchActionError('An assembly plant needs its SAP plant code (WERKS), e.g. 1100.');
  }
  // Changing the kind: refused while records of the old kind live here (they
  // would be stranded: a workshop's job cards are never plant records).
  if (type && type !== before.type) {
    const held = await recordsHeld(branchId);
    const stranded = before.type === 'ASSEMBLY_PLANT' && type !== 'ASSEMBLY_PLANT' ? held.plant : AREA_BRANCH_TYPES.workshop.includes(before.type) && !AREA_BRANCH_TYPES.workshop.includes(type) ? held.workshop : 0;
    if (stranded) throw new BranchActionError(`${before.name} holds ${stranded.toLocaleString('en-NG')} ${before.type === 'ASSEMBLY_PLANT' ? 'plant' : 'workshop'} records, so it stays ${BRANCH_TYPE_WORDS[before.type].toLowerCase()}. Open the new kind of place as its own branch.`);
  }
  if (sapPlant && !/^[A-Z0-9]{4}$/.test(sapPlant)) {
    throw new BranchActionError('The SAP plant code is 4 letters or digits (WERKS), e.g. 1000.');
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
      ...(sapPlant !== undefined ? { sapPlant } : {}),
      ...(type !== undefined ? { type } : {}),
    },
  });
  if (type && type !== before.type) {
    // A branch that becomes an assembly plant gets the plant's departments (missing ones only).
    const add = departmentsFor(type);
    if (add.length) await prisma.department.createMany({ data: add.map((d) => ({ branchId, name: d.name, slug: d.slug })), skipDuplicates: true });
    await writeAuditLog({ userId: user.id, action: 'branch.type_changed', entityType: 'Branch', entityId: branchId, metadata: { branch: trimmedName, from: BRANCH_TYPE_WORDS[before.type], to: BRANCH_TYPE_WORDS[type] } });
  }
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
          prisma.user.findMany({ where: { isActive: true, branchId, roles: { some: { role: { slug: { in: ['workshop-manager', 'finance-officer'] } } } } }, select: { fullName: true, email: true } })
            // Nobody holds those roles at the branch yet: the master administrator is told (lib/master-fallback.ts).
            .then(async (w) => orMasterAdmins(w, (await prisma.branch.findUnique({ where: { id: branchId }, select: { businessUnit: { select: { organisationId: true } } } }))?.businessUnit.organisationId ?? null)),
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
              companyName: PLATFORM.name,
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

// ── Plant records that sit on a branch that is not an assembly plant ──────

export type StrandedPlantRecords = { branches: { id: string; name: string; type: string; kits: number; shipments: number; vehicles: number; pdis: number }[]; plants: { id: string; name: string; sapPlant: string | null }[] };

/**
 * Plant records recorded before branches had kinds (or on the wrong branch):
 * which branches hold them, and the assembly plants they can move to. For
 * the organisation's administrators.
 */
export async function getStrandedPlantRecords(): Promise<StrandedPlantRecords> {
  await authorize('admin.structure.manage', undefined, 'getStrandedPlantRecords');
  const where = await myOrganisationBranches();
  const branches = await prisma.branch.findMany({
    where: { ...where, type: { not: 'ASSEMBLY_PLANT' } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, type: true, _count: { select: { plantKits: true, plantShipments: true, plantVehicles: true, pdiInspections: true } } },
  });
  const plants = await prisma.branch.findMany({ where: { ...where, type: 'ASSEMBLY_PLANT', isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, sapPlant: true } });
  return {
    branches: branches.filter((b) => b._count.plantKits + b._count.plantShipments + b._count.plantVehicles + b._count.pdiInspections > 0).map((b) => ({ id: b.id, name: b.name, type: b.type, kits: b._count.plantKits, shipments: b._count.plantShipments, vehicles: b._count.plantVehicles, pdis: b._count.pdiInspections })),
    plants,
  };
}

/**
 * Moves every plant record of one branch to an assembly plant of the same
 * organisation: kits, shipments, vehicles in the plant and PDIs, in one
 * transaction, with the SAP plant code they now belong under. Audited with
 * the counts; nothing is deleted.
 */
export async function movePlantRecords(fromBranchId: string, toBranchId: string): Promise<{ ok: true; moved: { kits: number; shipments: number; vehicles: number; pdis: number } } | { ok: false; error: string }> {
  await authorize('admin.structure.manage', undefined, 'movePlantRecords');
  const user = await requireUser();
  const where = await myOrganisationBranches();
  const [from, to] = await Promise.all([
    prisma.branch.findFirst({ where: { ...where, id: String(fromBranchId ?? '').slice(0, 40) }, select: { id: true, name: true, type: true } }),
    prisma.branch.findFirst({ where: { ...where, id: String(toBranchId ?? '').slice(0, 40) }, select: { id: true, name: true, type: true, sapPlant: true, isActive: true } }),
  ]);
  if (!from) return { ok: false, error: 'Choose the branch the records are on now.' };
  if (!to || !to.isActive) return { ok: false, error: 'Choose the assembly plant to move them to.' };
  if (to.type !== 'ASSEMBLY_PLANT') return { ok: false, error: `${to.name} is ${BRANCH_TYPE_WORDS[to.type].toLowerCase()}, not an assembly plant.` };
  if (from.id === to.id) return { ok: false, error: 'The records are already there.' };
  const moved = await prisma.$transaction(async (tx) => {
    const w = { branchId: from.id };
    const [kits, shipments, vehicles, pdis] = await Promise.all([
      tx.plantKit.updateMany({ where: w, data: { branchId: to.id } }),
      tx.plantShipment.updateMany({ where: w, data: { branchId: to.id } }),
      tx.plantVehicle.updateMany({ where: w, data: { branchId: to.id, sapPlant: to.sapPlant } }),
      tx.pdiInspection.updateMany({ where: w, data: { branchId: to.id } }),
    ]);
    return { kits: kits.count, shipments: shipments.count, vehicles: vehicles.count, pdis: pdis.count };
  });
  await writeAuditLog({ userId: user.id, action: 'branch.plant_records_moved', entityType: 'Branch', entityId: to.id, metadata: { from: from.name, to: to.name, sapPlant: to.sapPlant, ...moved } });
  return { ok: true, moved };
}

/**
 * Opens the organisation's assembly plant in one step, for an organisation
 * that has none yet: a branch of kind Assembly plant (Afprint Assembly Plant,
 * code KWL-AP, SAP plant 1100 — rename or recode it under Branches) in the
 * same business unit and city as its first workshop, with the plant's
 * departments; then the plant records and plant-only staff move onto it.
 * Audited. Refused when the organisation already has an assembly plant.
 */
export async function openAssemblyPlant(): Promise<{ ok: true; id: string; name: string; moved: { kits: number; shipments: number; vehicles: number; pdis: number; people: number } } | { ok: false; error: string }> {
  await authorize('admin.structure.manage', undefined, 'openAssemblyPlant');
  const user = await requireUser();
  const where = await myOrganisationBranches();
  const existing = await prisma.branch.findFirst({ where: { ...where, type: 'ASSEMBLY_PLANT' }, select: { id: true, name: true } });
  if (existing) return { ok: false, error: `${existing.name} is already the assembly plant.` };
  const anchor = await prisma.branch.findFirst({ where: { ...where, type: { in: AREA_BRANCH_TYPES.workshop } }, orderBy: { createdAt: 'asc' }, select: { id: true, businessUnitId: true, cityId: true, name: true, businessUnit: { select: { organisationId: true } } } });
  if (!anchor) return { ok: false, error: 'Open a workshop branch first: the plant joins its business unit.' };
  const name = 'Afprint Assembly Plant';
  if (await prisma.branch.findFirst({ where: { ...where, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) return { ok: false, error: `A branch named ${name} exists but is not of kind Assembly plant: set its kind under Branches.` };
  const out = await prisma.$transaction(async (tx) => {
    const plant = await tx.branch.create({ data: { businessUnitId: anchor.businessUnitId, cityId: anchor.cityId, name, code: 'KWL-AP', type: 'ASSEMBLY_PLANT', sapPlant: '1100' }, select: { id: true, name: true, sapPlant: true } });
    await tx.department.createMany({ data: departmentsFor('ASSEMBLY_PLANT').map((d) => ({ branchId: plant.id, name: d.name, slug: d.slug })), skipDuplicates: true });
    const w = { branch: { businessUnit: { organisationId: anchor.businessUnit.organisationId } }, branchId: { not: plant.id } };
    const [kits, shipments, vehicles, pdis] = await Promise.all([
      tx.plantKit.updateMany({ where: w, data: { branchId: plant.id } }),
      tx.plantShipment.updateMany({ where: w, data: { branchId: plant.id } }),
      tx.plantVehicle.updateMany({ where: w, data: { branchId: plant.id, sapPlant: plant.sapPlant } }),
      tx.pdiInspection.updateMany({ where: w, data: { branchId: plant.id } }),
    ]);
    // People whose roles are plant roles only, with a department by role.
    const PLANT_ROLES = ['plant-manager', 'pdi-inspector', 'pdi-supervisor', 'kit-inspector', 'quality-supervisor'];
    const staff = await tx.user.findMany({ where: { organisationId: anchor.businessUnit.organisationId, branchId: { not: plant.id }, roles: { some: { role: { slug: { in: PLANT_ROLES } } }, none: { role: { slug: { notIn: PLANT_ROLES } } } } }, select: { id: true, roles: { select: { role: { select: { slug: true } } } } } });
    const depts = await tx.department.findMany({ where: { branchId: plant.id }, select: { id: true, slug: true } });
    const dept = (slug: string) => depts.find((d) => d.slug === slug)?.id ?? null;
    for (const u of staff) {
      const slugs = u.roles.map((r) => r.role.slug);
      const d = slugs.some((x) => x.startsWith('pdi')) ? dept('plant-pdi') : slugs.includes('kit-inspector') ? dept('plant-kit-receiving') : slugs.includes('quality-supervisor') ? dept('plant-quality') : dept('plant-production');
      await tx.user.update({ where: { id: u.id }, data: { branchId: plant.id, departmentId: d } });
    }
    return { plant, moved: { kits: kits.count, shipments: shipments.count, vehicles: vehicles.count, pdis: pdis.count, people: staff.length } };
  });
  await writeAuditLog({ userId: user.id, action: 'branch.created', entityType: 'Branch', entityId: out.plant.id, metadata: { name: out.plant.name, type: 'Assembly plant', sapPlant: out.plant.sapPlant, businessUnit: anchor.name, opened: 'from the plant page' } });
  await writeAuditLog({ userId: user.id, action: 'branch.plant_records_moved', entityType: 'Branch', entityId: out.plant.id, metadata: { from: anchor.name, to: out.plant.name, sapPlant: out.plant.sapPlant, ...out.moved } });
  revalidatePath('/', 'layout');
  return { ok: true, id: out.plant.id, name: out.plant.name, moved: out.moved };
}
