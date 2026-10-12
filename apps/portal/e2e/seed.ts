/**
 * E2E seed — runs AFTER packages/database/prisma/seed.ts and
 * scripts/v24-roles.sql on a throwaway test database (never a real one).
 * Idempotent (upserts only) — safe to run twice.
 * Adds: one account per role (all with the same test password, one person
 * holding both Supervisor and Manager for the segregation-of-duties checks),
 * customers with vehicles (two of them with customer-portal passwords), a
 * Store with priced, stocked parts (each workflow spec has its own part, with
 * a real goods-receipt layer under the stock), a warranty provider and a part
 * warranty policy, and a SECOND organisation with its own admin and customer
 * for the cross-organisation tests.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { E2E_PASSWORD, PEOPLE, RESET, OTHER_ORG_ADMIN, OTHER_BRANCH_TECH, SECOND_BRANCH, CUSTOMER, PORTAL_CUSTOMERS, SEED_PARTS, SEED_CATEGORY, SEED_WARRANTY, type Person } from './people';

const prisma = new PrismaClient();

async function account(userId: string, password: string) {
  const hash = await hashPassword(password);
  const existing = await prisma.account.findFirst({ where: { userId, providerId: 'credential' } });
  if (existing) await prisma.account.update({ where: { id: existing.id }, data: { password: hash } });
  else await prisma.account.create({ data: { userId, accountId: userId, providerId: 'credential', password: hash } });
}

async function person(organisationId: string, branchId: string, p: Person) {
  const dept = p.dept ? await prisma.department.findUnique({ where: { branchId_slug: { branchId, slug: p.dept } } }) : null;
  const user = await prisma.user.upsert({
    where: { email: p.email },
    update: { isActive: true, branchId, departmentId: dept?.id ?? null, organisationId },
    create: { email: p.email, fullName: p.name, organisationId, branchId, departmentId: dept?.id ?? null, isActive: true, accountType: 'EMPLOYEE', emailVerified: true },
  });
  for (const slug of [p.role, ...(p.extraRoles ?? [])]) {
    const role = await prisma.role.findUniqueOrThrow({ where: { organisationId_slug: { organisationId, slug } } });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  }
  await account(user.id, E2E_PASSWORD);
  return user;
}

async function customerAccount(customerId: string, password: string) {
  const hash = await hashPassword(password);
  const existing = await prisma.customerAccount.findFirst({ where: { customerId, providerId: 'credential' } });
  if (existing) await prisma.customerAccount.update({ where: { id: existing.id }, data: { password: hash } });
  else await prisma.customerAccount.create({ data: { customerId, accountId: customerId, providerId: 'credential', password: hash } });
}

async function main() {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { slug: 'kewalram-nigeria' } });
  const branch = await prisma.branch.findFirstOrThrow({ where: { businessUnit: { organisationId: org.id } }, orderBy: { createdAt: 'asc' } });
  for (const p of [...PEOPLE, RESET]) await person(org.id, branch.id, p);

  const frontDesk = await prisma.user.findUniqueOrThrow({ where: { email: PEOPLE.find((p) => p.role === 'receptionist')!.email } });
  const store = await prisma.user.findUniqueOrThrow({ where: { email: PEOPLE.find((p) => p.role === 'store-manager')!.email } });

  // ── Customers ──────────────────────────────────────────────────────
  const customer = await prisma.customer.upsert({
    where: { email: CUSTOMER.email },
    update: {},
    // Registration requires a primary address and phone (v28).
    create: { organisationId: org.id, fullName: CUSTOMER.name, email: CUSTOMER.email, phone: '08000000001', address: '1 Test Street, Ikeja', createdById: frontDesk.id },
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
  for (const [i, c] of PORTAL_CUSTOMERS.entries()) {
    const row = await prisma.customer.upsert({
      where: { email: c.email },
      update: { isActive: true },
      create: { organisationId: org.id, fullName: c.name, email: c.email, phone: `0800000010${i}`, address: `${i + 2} Portal Road, Lekki`, createdById: frontDesk.id, emailVerified: true },
    });
    await customerAccount(row.id, c.password);
    await prisma.customerVehicle.upsert({
      where: { plateNumber: c.plate },
      update: {},
      create: { customerId: row.id, make: ['Kia', 'Nissan', 'Hyundai', 'Peugeot'][i]!, model: ['Rio', 'Almera', 'Accent', '301'][i]!, year: 2021, vehicleType: 'PASSENGER', plateNumber: c.plate, mileage: 15000 + i, createdById: frontDesk.id },
    });
  }

  // ── Warranty: a provider and a part policy, owned by this organisation ──
  const provider = await prisma.warrantyProvider.upsert({
    where: { name: SEED_WARRANTY.provider },
    update: {},
    create: { name: SEED_WARRANTY.provider, type: 'SUPPLIER', organisationId: org.id, contactName: 'Pat Provider', email: 'claims@provider.e2e.test', claimSubmissionDays: 30, createdById: store.id },
  });
  const policy = await prisma.warrantyPolicy.upsert({
    where: { code: SEED_WARRANTY.policyCode },
    update: {},
    create: { code: SEED_WARRANTY.policyCode, name: SEED_WARRANTY.policyName, kind: 'PART', providerId: provider.id, durationMonths: 12, durationUnit: 'MONTHS', coverageSummary: 'Manufacturing defects', exclusions: 'Wear and tear', organisationId: org.id, createdById: store.id },
  });
  // A vehicle (asset) policy — the customer-portal spec registers a warranty with it.
  await prisma.warrantyPolicy.upsert({
    where: { code: SEED_WARRANTY.vehiclePolicyCode },
    update: {},
    create: { code: SEED_WARRANTY.vehiclePolicyCode, name: SEED_WARRANTY.vehiclePolicyName, kind: 'ASSET', providerId: provider.id, durationMonths: 24, durationUnit: 'MONTHS', distanceLimit: 100000, coverageSummary: 'Engine and gearbox', exclusions: 'Wear and tear', organisationId: org.id, createdById: store.id },
  });

  // ── Store: category, part types, priced parts with real stock layers ──
  const category = await prisma.partCategory.upsert({
    where: { branchId_name: { branchId: branch.id, name: SEED_CATEGORY.name } },
    update: {},
    create: { branchId: branch.id, name: SEED_CATEGORY.name, code: SEED_CATEGORY.code, createdById: store.id },
  });
  for (const [key, p] of Object.entries(SEED_PARTS)) {
    const type = await prisma.partType.upsert({
      where: { branchId_categoryId_name: { branchId: branch.id, categoryId: category.id, name: p.type } },
      update: {},
      create: { branchId: branch.id, categoryId: category.id, name: p.type, createdById: store.id },
    });
    const part = await prisma.part.upsert({
      where: { branchId_partNumber: { branchId: branch.id, partNumber: p.number } },
      update: {},
      create: {
        branchId: branch.id, name: p.name, partNumber: p.number, category: SEED_CATEGORY.name, partTypeId: type.id, baseUnitOfMeasure: 'Piece',
        sellingPrice: p.price, targetMarginPercent: 30, createdById: store.id, warrantyPolicyId: key === 'brakePads' ? policy.id : null,
      },
    });
    const ref = `GRN-E2ESEED-${p.number}`;
    if (!(await prisma.goodsReceipt.findUnique({ where: { referenceNumber: ref } }))) {
      await prisma.goodsReceipt.create({
        data: {
          branchId: branch.id, referenceNumber: ref, supplierName: 'E2E Opening Stock Ltd', receivedById: store.id, notes: 'Opening stock (test seed)',
          lines: { create: { partId: part.id, quantityReceivedInUnit: p.stock, unitUsed: 'Piece', quantityInBaseUnit: p.stock, totalCost: p.stock * p.price * 0.6, unitCost: p.price * 0.6 } },
        },
      });
      await prisma.partStock.upsert({ where: { partId: part.id }, update: { quantityOnHand: p.stock }, create: { partId: part.id, quantityOnHand: p.stock } });
    }
  }

  // ── A second branch of THIS organisation, with one technician (branch fences) ──
  const second = (await prisma.branch.findFirst({ where: { businessUnitId: branch.businessUnitId, name: SECOND_BRANCH } }))
    ?? (await prisma.branch.create({ data: { businessUnitId: branch.businessUnitId, cityId: branch.cityId, name: SECOND_BRANCH } }));
  await person(org.id, second.id, OTHER_BRANCH_TECH);

  // ── A second organisation — nothing of the first may ever be visible to it ──
  const other = await prisma.organisation.upsert({ where: { slug: 'other-org-e2e' }, update: {}, create: { name: 'Other Motors', slug: 'other-org-e2e' } });
  const nigeria = await prisma.country.findUniqueOrThrow({ where: { name: 'Nigeria' } });
  const state = await prisma.state.upsert({ where: { countryId_name: { countryId: nigeria.id, name: 'Abuja FCT' } }, update: {}, create: { countryId: nigeria.id, name: 'Abuja FCT' } });
  const city = await prisma.city.upsert({ where: { stateId_name: { stateId: state.id, name: 'Garki' } }, update: {}, create: { stateId: state.id, name: 'Garki' } });
  const bu = await prisma.businessUnit.upsert({ where: { organisationId_slug: { organisationId: other.id, slug: 'automobile' } }, update: {}, create: { organisationId: other.id, name: 'Automobile', slug: 'automobile' } });
  const otherBranch = (await prisma.branch.findFirst({ where: { businessUnitId: bu.id } })) ?? (await prisma.branch.create({ data: { businessUnitId: bu.id, cityId: city.id, name: 'Garki Branch' } }));
  await prisma.department.upsert({ where: { branchId_slug: { branchId: otherBranch.id, slug: 'workshop' } }, update: {}, create: { branchId: otherBranch.id, name: 'Workshop', slug: 'workshop' } });
  await prisma.role.upsert({ where: { organisationId_slug: { organisationId: other.id, slug: 'administrator' } }, update: {}, create: { organisationId: other.id, name: 'Organisation Administrator', slug: 'administrator', isSystem: true } });
  await person(other.id, otherBranch.id, { ...OTHER_ORG_ADMIN, role: 'administrator' });
  await prisma.customer.upsert({ where: { email: 'other-customer@e2e.test' }, update: {}, create: { organisationId: other.id, fullName: 'Other Customer', email: 'other-customer@e2e.test', phone: '08000000009', address: 'Garki, Abuja' } });

  // eslint-disable-next-line no-console
  console.log(`E2E seed: ${PEOPLE.length + 1} staff in ${org.name} / ${branch.name}, 3 customers (2 with portal passwords), ${Object.keys(SEED_PARTS).length} stocked parts, a part warranty policy, and ${other.name} with its own admin.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
