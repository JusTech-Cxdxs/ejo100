'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { prisma } from '@ejo/database';
import { authorize, getPrincipal } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { SYSTEM_DEPARTMENTS, SYSTEM_DEPARTMENT_SLUGS } from '@/lib/structure-rules';

/**
 * The organisation's structure: Organisation → Business units → Branches →
 * Departments. Everyone with structure rights (admin.structure.manage) sees
 * and edits only THEIR organisation; the platform team sees all.
 *
 * Departments the workflows depend on (Workshop, Passenger / Commercial
 * Vehicle Workshop, Store) are SYSTEM departments: they can be renamed for
 * display, never switched off — every Job Card routes through them.
 */
class StructureError extends Error {}

const SYSTEM = SYSTEM_DEPARTMENT_SLUGS;

function slugify(v: string): string {
  return v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function cleanName(v: string, what: string): string {
  const n = v.trim().replace(/\s+/g, ' ');
  if (n.length < 2) throw new StructureError(`Give the ${what} a name.`);
  if (n.length > 80) throw new StructureError(`Keep the ${what} name under 80 characters.`);
  return n;
}

async function myOrg(): Promise<{ userId: string; organisationId: string | null; isPlatform: boolean }> {
  const p = await getPrincipal();
  return { userId: p.userId, organisationId: p.organisationId ?? null, isPlatform: p.isSuperAdmin };
}
const orgFence = (o: { organisationId: string | null; isPlatform: boolean }) => (o.isPlatform && !o.organisationId ? {} : { organisationId: o.organisationId ?? '__none__' });

function changed() {
  revalidateTag('org-structure');
  revalidatePath('/structure');
  revalidatePath('/branches');
  revalidatePath('/users');
}

export type StructureView = Awaited<ReturnType<typeof getStructure>>;

/** The whole tree, with how many active people sit in each branch and department. */
export async function getStructure() {
  await authorize('admin.structure.manage', undefined, 'structure.view');
  const o = await myOrg();
  const [org, units, people] = await Promise.all([
    o.organisationId ? prisma.organisation.findUnique({ where: { id: o.organisationId }, select: { id: true, name: true, legalName: true } }) : Promise.resolve(null),
    prisma.businessUnit.findMany({
      where: orgFence(o),
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, isActive: true,
        branches: {
          orderBy: { name: 'asc' },
          select: {
            id: true, name: true, code: true, isActive: true,
            city: { select: { name: true, state: { select: { name: true } } } },
            departments: { orderBy: [{ isActive: 'desc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, isActive: true } },
          },
        },
      },
    }),
    prisma.user.groupBy({ by: ['branchId', 'departmentId'], where: { isActive: true, ...(o.isPlatform && !o.organisationId ? {} : { organisationId: o.organisationId ?? '__none__' }) }, _count: { _all: true } }),
  ]);
  const inBranch = new Map<string, number>();
  const inDept = new Map<string, number>();
  for (const r of people) {
    if (r.branchId) inBranch.set(r.branchId, (inBranch.get(r.branchId) ?? 0) + r._count._all);
    if (r.departmentId) inDept.set(r.departmentId, (inDept.get(r.departmentId) ?? 0) + r._count._all);
  }
  return {
    organisation: org,
    units: units.map((u) => ({
      ...u,
      branches: u.branches.map((b) => ({
        ...b,
        people: inBranch.get(b.id) ?? 0,
        departments: b.departments.map((d) => ({ ...d, people: inDept.get(d.id) ?? 0, system: SYSTEM.has(d.slug) })),
      })),
    })),
  };
}

async function branchInMyOrg(branchId: string) {
  const o = await myOrg();
  const b = await prisma.branch.findFirst({ where: { id: branchId, businessUnit: orgFence(o) }, select: { id: true, name: true } });
  if (!b) throw new StructureError('That branch no longer exists — refresh the page.');
  await authorize('admin.structure.manage', { branchId }, 'structure.branch');
  return { o, b };
}

async function departmentInMyOrg(departmentId: string) {
  const o = await myOrg();
  const d = await prisma.department.findFirst({ where: { id: departmentId, branch: { businessUnit: orgFence(o) } }, select: { id: true, name: true, slug: true, isActive: true, branchId: true } });
  if (!d) throw new StructureError('That department no longer exists — refresh the page.');
  await authorize('admin.structure.manage', { branchId: d.branchId }, 'structure.department');
  return { o, d };
}

export async function createDepartment(branchId: string, name: string): Promise<void> {
  await authorize('admin.structure.manage', undefined, 'structure.department');
  const { o, b } = await branchInMyOrg(branchId);
  const n = cleanName(name, 'department');
  const slug = slugify(n);
  if (!slug) throw new StructureError('Use letters or numbers in the name.');
  const existing = await prisma.department.findUnique({ where: { branchId_slug: { branchId, slug } }, select: { id: true, isActive: true } });
  if (existing) throw new StructureError(existing.isActive ? `${b.name} already has a department called that.` : 'A department with that name exists but is switched off — switch it back on instead.');
  const d = await prisma.department.create({ data: { branchId, name: n, slug }, select: { id: true } });
  await writeAuditLog({ userId: o.userId, action: 'department.created', entityType: 'Department', entityId: d.id, metadata: { name: n, branch: b.name } });
  changed();
}

export async function renameDepartment(departmentId: string, name: string): Promise<void> {
  await authorize('admin.structure.manage', undefined, 'structure.department');
  const { o, d } = await departmentInMyOrg(departmentId);
  const n = cleanName(name, 'department');
  if (n === d.name) return;
  // The name people see changes; the internal key (and so every workflow) does not.
  await prisma.department.update({ where: { id: d.id }, data: { name: n } });
  await writeAuditLog({ userId: o.userId, action: 'department.renamed', entityType: 'Department', entityId: d.id, metadata: { from: d.name, to: n } });
  changed();
}

export async function setDepartmentActive(departmentId: string, active: boolean): Promise<void> {
  await authorize('admin.structure.manage', undefined, 'structure.department');
  const { o, d } = await departmentInMyOrg(departmentId);
  if (d.isActive === active) return;
  if (!active && SYSTEM.has(d.slug)) throw new StructureError(`${d.name} is a system department — the workflows run through it, so it cannot be switched off.`);
  if (!active) {
    const people = await prisma.user.count({ where: { departmentId: d.id, isActive: true } });
    if (people > 0) throw new StructureError(`${people} ${people === 1 ? 'person works' : 'people work'} in ${d.name} — move them to another department first (Users).`);
  }
  await prisma.department.update({ where: { id: d.id }, data: { isActive: active } });
  await writeAuditLog({ userId: o.userId, action: active ? 'department.reactivated' : 'department.deactivated', entityType: 'Department', entityId: d.id, metadata: { name: d.name } });
  changed();
}

export async function createBusinessUnit(name: string): Promise<void> {
  await authorize('admin.structure.manage', undefined, 'structure.businessUnit');
  const o = await myOrg();
  if (!o.organisationId) throw new StructureError('Your account is not placed in an organisation.');
  const n = cleanName(name, 'business unit');
  const slug = slugify(n);
  if (await prisma.businessUnit.findUnique({ where: { organisationId_slug: { organisationId: o.organisationId, slug } }, select: { id: true } })) throw new StructureError('There is already a business unit with that name.');
  const u = await prisma.businessUnit.create({ data: { organisationId: o.organisationId, name: n, slug }, select: { id: true } });
  await writeAuditLog({ userId: o.userId, action: 'business_unit.created', entityType: 'BusinessUnit', entityId: u.id, metadata: { name: n } });
  changed();
}

export async function renameBusinessUnit(id: string, name: string): Promise<void> {
  await authorize('admin.structure.manage', undefined, 'structure.businessUnit');
  const o = await myOrg();
  const u = await prisma.businessUnit.findFirst({ where: { id, ...orgFence(o) }, select: { id: true, name: true } });
  if (!u) throw new StructureError('That business unit no longer exists — refresh the page.');
  const n = cleanName(name, 'business unit');
  if (n === u.name) return;
  await prisma.businessUnit.update({ where: { id }, data: { name: n } });
  await writeAuditLog({ userId: o.userId, action: 'business_unit.renamed', entityType: 'BusinessUnit', entityId: id, metadata: { from: u.name, to: n } });
  changed();
}

/**
 * Open a new branch under a business unit: its city and state (found or
 * added, in the organisation's country), and — by default — the standard
 * departments every branch's workflows need.
 */
export async function createBranch(input: { businessUnitId: string; name: string; code?: string; city: string; state: string; standardDepartments: boolean }): Promise<{ id: string }> {
  await authorize('admin.structure.manage', undefined, 'structure.branch.create');
  const o = await myOrg();
  const unit = await prisma.businessUnit.findFirst({ where: { id: input.businessUnitId, ...orgFence(o) }, select: { id: true, name: true, countries: { select: { countryId: true }, take: 1 } } });
  if (!unit) throw new StructureError('Choose a business unit of your organisation.');
  const name = cleanName(input.name, 'branch');
  const cityName = cleanName(input.city, 'city');
  const stateName = cleanName(input.state, 'state');
  const code = input.code?.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || null;
  if (await prisma.branch.findFirst({ where: { businessUnit: orgFence(o), name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw new StructureError('There is already a branch with that name.');
  // The organisation's country: the business unit's, else that of an existing branch, else Nigeria.
  const countryId = unit.countries[0]?.countryId
    ?? (await prisma.branch.findFirst({ where: { businessUnit: orgFence(o) }, select: { city: { select: { state: { select: { countryId: true } } } } } }))?.city.state.countryId
    ?? (await prisma.country.upsert({ where: { name: 'Nigeria' }, update: {}, create: { name: 'Nigeria', isoCode: 'NG' }, select: { id: true } })).id;
  const branch = await prisma.$transaction(async (tx) => {
    const state = await tx.state.upsert({ where: { countryId_name: { countryId, name: stateName } }, update: {}, create: { countryId, name: stateName } });
    const city = await tx.city.upsert({ where: { stateId_name: { stateId: state.id, name: cityName } }, update: {}, create: { stateId: state.id, name: cityName } });
    const b = await tx.branch.create({ data: { businessUnitId: unit.id, cityId: city.id, name, code }, select: { id: true } });
    if (input.standardDepartments) {
      await tx.department.createMany({ data: SYSTEM_DEPARTMENTS.map((d) => ({ branchId: b.id, name: d.name, slug: d.slug })), skipDuplicates: true });
    }
    return b;
  });
  await writeAuditLog({ userId: o.userId, action: 'branch.created', entityType: 'Branch', entityId: branch.id, metadata: { name, businessUnit: unit.name, city: cityName, state: stateName, standardDepartments: input.standardDepartments } });
  changed();
  return branch;
}

/** One branch's departments with the people in each (for the branch page). */
export async function getBranchDepartments(branchId: string) {
  await branchInMyOrg(branchId);
  const [departments, counts] = await Promise.all([
    prisma.department.findMany({ where: { branchId }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, isActive: true } }),
    prisma.user.groupBy({ by: ['departmentId'], where: { branchId, isActive: true }, _count: { _all: true } }),
  ]);
  const n = new Map(counts.map((c) => [c.departmentId, c._count._all]));
  return departments.map((d) => ({ ...d, people: n.get(d.id) ?? 0, system: SYSTEM.has(d.slug) }));
}
