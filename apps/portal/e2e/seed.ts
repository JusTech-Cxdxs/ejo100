/**
 * E2E seed — runs AFTER packages/database/prisma/seed.ts and
 * scripts/v24-roles.sql on a throwaway test database (never a real one).
 * Adds: one account per role (all with the same test password), a customer
 * with a passenger vehicle, and a SECOND organisation with its own admin and
 * customer for the cross-organisation tests.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { E2E_PASSWORD, PEOPLE, OTHER_ORG_ADMIN } from './people';

const prisma = new PrismaClient();

async function account(userId: string, password: string) {
  const hash = await hashPassword(password);
  const existing = await prisma.account.findFirst({ where: { userId, providerId: 'credential' } });
  if (existing) await prisma.account.update({ where: { id: existing.id }, data: { password: hash } });
  else await prisma.account.create({ data: { userId, accountId: userId, providerId: 'credential', password: hash } });
}

async function person(organisationId: string, branchId: string, p: { email: string; name: string; role: string; dept?: string }) {
  const dept = p.dept ? await prisma.department.findUnique({ where: { branchId_slug: { branchId, slug: p.dept } } }) : null;
  const role = await prisma.role.findUniqueOrThrow({ where: { organisationId_slug: { organisationId, slug: p.role } } });
  const user = await prisma.user.upsert({
    where: { email: p.email },
    update: { isActive: true, branchId, departmentId: dept?.id ?? null, organisationId },
    create: { email: p.email, fullName: p.name, organisationId, branchId, departmentId: dept?.id ?? null, isActive: true, accountType: 'EMPLOYEE', emailVerified: true },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  await account(user.id, E2E_PASSWORD);
  return user;
}

async function main() {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { businessUnit: { organisationId: org.id } }, orderBy: { createdAt: 'asc' } });
  for (const p of PEOPLE) await person(org.id, branch.id, p);

  const frontDesk = await prisma.user.findUniqueOrThrow({ where: { email: PEOPLE.find((p) => p.role === 'receptionist')!.email } });
  const customer = await prisma.customer.upsert({
    where: { email: 'customer@e2e.test' },
    update: {},
    create: { organisationId: org.id, fullName: 'Ada Customer', email: 'customer@e2e.test', phone: '08000000001', createdById: frontDesk.id },
  });
  await prisma.customerVehicle.upsert({
    where: { plateNumber: 'E2E-001-AA' },
    update: {},
    create: { customerId: customer.id, make: 'Toyota', model: 'Corolla', year: 2020, vehicleType: 'PASSENGER', plateNumber: 'E2E-001-AA', mileage: 42000, createdById: frontDesk.id },
  });
  await prisma.customerVehicle.upsert({
    where: { plateNumber: 'E2E-002-BB' },
    update: {},
    create: { customerId: customer.id, make: 'Honda', model: 'Accord', year: 2019, vehicleType: 'PASSENGER', plateNumber: 'E2E-002-BB', mileage: 61000, createdById: frontDesk.id },
  });

  // A second organisation — nothing of the first may ever be visible to it.
  const other = await prisma.organisation.upsert({ where: { slug: 'other-org-e2e' }, update: {}, create: { name: 'Other Motors', slug: 'other-org-e2e' } });
  const nigeria = await prisma.country.findUniqueOrThrow({ where: { name: 'Nigeria' } });
  const state = await prisma.state.upsert({ where: { countryId_name: { countryId: nigeria.id, name: 'Abuja FCT' } }, update: {}, create: { countryId: nigeria.id, name: 'Abuja FCT' } });
  const city = await prisma.city.upsert({ where: { stateId_name: { stateId: state.id, name: 'Garki' } }, update: {}, create: { stateId: state.id, name: 'Garki' } });
  const bu = await prisma.businessUnit.upsert({ where: { organisationId_slug: { organisationId: other.id, slug: 'automobile' } }, update: {}, create: { organisationId: other.id, name: 'Automobile', slug: 'automobile' } });
  const otherBranch = (await prisma.branch.findFirst({ where: { businessUnitId: bu.id } })) ?? (await prisma.branch.create({ data: { businessUnitId: bu.id, cityId: city.id, name: 'Garki Branch' } }));
  await prisma.department.upsert({ where: { branchId_slug: { branchId: otherBranch.id, slug: 'workshop' } }, update: {}, create: { branchId: otherBranch.id, name: 'Workshop', slug: 'workshop' } });
  await prisma.role.upsert({ where: { organisationId_slug: { organisationId: other.id, slug: 'administrator' } }, update: {}, create: { organisationId: other.id, name: 'Organisation Administrator', slug: 'administrator', isSystem: true } });
  await person(other.id, otherBranch.id, { ...OTHER_ORG_ADMIN, role: 'administrator' });
  await prisma.customer.upsert({ where: { email: 'other-customer@e2e.test' }, update: {}, create: { organisationId: other.id, fullName: 'Other Customer', email: 'other-customer@e2e.test' } });

  // eslint-disable-next-line no-console
  console.log(`E2E seed: ${PEOPLE.length} staff in ${org.name} / ${branch.name}, a customer with 2 vehicles, and ${other.name} with its own admin.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
