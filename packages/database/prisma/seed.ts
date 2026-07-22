/**
 * Phase 2 seed structure — seeds only the organizational skeleton
 * (Platform Module registry + the Kewalram Nigeria hierarchy down to
 * Isolo Branch / Workshop) described in the project constitution.
 * No business data (job cards, customers, etc.) is seeded here — that
 * arrives with the Workshop module in a later phase.
 *
 * Run with: npm run seed --workspace=packages/database
 * (requires DATABASE_URL to point at a real, migrated Postgres instance)
 */
import { PrismaClient, ModuleStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // --- Module registry -----------------------------------------------------
  const modules: { key: string; name: string; status: ModuleStatus; sortOrder: number }[] = [
    { key: 'dashboard', name: 'Dashboard', status: 'LIVE', sortOrder: 0 },
    { key: 'company', name: 'Company', status: 'LIVE', sortOrder: 1 },
    { key: 'business-units', name: 'Business Units', status: 'LIVE', sortOrder: 2 },
    { key: 'workshop', name: 'Workshop', status: 'LIVE', sortOrder: 10 },
    { key: 'inventory', name: 'Inventory', status: 'COMING_SOON', sortOrder: 11 },
    { key: 'procurement', name: 'Procurement', status: 'COMING_SOON', sortOrder: 12 },
    { key: 'finance', name: 'Finance', status: 'COMING_SOON', sortOrder: 13 },
    { key: 'hr', name: 'HR', status: 'COMING_SOON', sortOrder: 14 },
    { key: 'payroll', name: 'Payroll', status: 'COMING_SOON', sortOrder: 15 },
    { key: 'manufacturing', name: 'Manufacturing', status: 'COMING_SOON', sortOrder: 16 },
  ];
  for (const m of modules) {
    await prisma.platformModule.upsert({
      where: { key: m.key },
      update: { name: m.name, status: m.status, sortOrder: m.sortOrder },
      create: m,
    });
  }

  // --- Kewalram Nigeria hierarchy ------------------------------------------
  const company = await prisma.company.upsert({
    where: { slug: 'kewalram-nigeria' },
    update: {},
    create: {
      name: 'Kewalram Nigeria',
      slug: 'kewalram-nigeria',
      legalName: 'Kewalram Chanrai Group Nigeria',
      branding: {
        create: {
          primaryColor: '#16A34A',
          secondaryColor: '#0F172A',
          accentColor: '#22C55E',
        },
      },
    },
  });

  const nigeria = await prisma.country.upsert({
    where: { name: 'Nigeria' },
    update: {},
    create: { name: 'Nigeria', isoCode: 'NG' },
  });

  const automobile = await prisma.businessUnit.upsert({
    where: { companyId_slug: { companyId: company.id, slug: 'automobile-division' } },
    update: {},
    create: { companyId: company.id, name: 'Automobile Division', slug: 'automobile-division' },
  });

  await prisma.countryLink.upsert({
    where: { businessUnitId_countryId: { businessUnitId: automobile.id, countryId: nigeria.id } },
    update: {},
    create: { businessUnitId: automobile.id, countryId: nigeria.id },
  });

  const lagos = await prisma.state.upsert({
    where: { countryId_name: { countryId: nigeria.id, name: 'Lagos State' } },
    update: {},
    create: { countryId: nigeria.id, name: 'Lagos State' },
  });

  const isolo = await prisma.city.upsert({
    where: { stateId_name: { stateId: lagos.id, name: 'Isolo' } },
    update: {},
    create: { stateId: lagos.id, name: 'Isolo' },
  });

  const isoloBranch = await prisma.branch.upsert({
    where: { id: `${automobile.id}-isolo-seed` }, // placeholder unique lookup for idempotency
    update: {},
    create: {
      id: `${automobile.id}-isolo-seed`,
      businessUnitId: automobile.id,
      cityId: isolo.id,
      name: 'Isolo Branch',
      code: 'KWL-WS',
    },
  });

  await prisma.department.upsert({
    where: { branchId_slug: { branchId: isoloBranch.id, slug: 'workshop' } },
    update: {},
    create: { branchId: isoloBranch.id, name: 'Workshop', slug: 'workshop' },
  });

  // --- Baseline roles (system roles, cannot be deleted) --------------------
  const roleNames = ['Administrator', 'Workshop Manager', 'Workshop Supervisor', 'Technician', 'Store Officer'];
  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { companyId_slug: { companyId: company.id, slug: slugify(name) } },
      update: {},
      create: { companyId: company.id, name, slug: slugify(name), isSystem: true },
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete: module registry + Kewalram Nigeria hierarchy.');
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
