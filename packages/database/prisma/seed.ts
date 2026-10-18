/**
 * Seeds the platform skeleton: the module registry, the first organisation's
 * hierarchy (down to its first branch and departments), baseline roles and
 * the Master Administrator. No business data.
 *
 * Run with: npm run seed --workspace=packages/database
 * Requires DATABASE_URL (a migrated database) and MASTER_ADMIN_EMAIL /
 * MASTER_ADMIN_PASSWORD (see below).
 */
import { PrismaClient, ModuleStatus } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { seedZinoxCatalogue } from './seed-zinox-catalogue';

const prisma = new PrismaClient();

/**
 * The first Master Administrator, who bootstraps the platform. Everyone
 * else is created from the portal.
 *
 * No fallback credentials: MASTER_ADMIN_EMAIL and MASTER_ADMIN_PASSWORD must
 * be set in the environment, and the script fails if they are missing, so no
 * password ever sits in source control.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in Render's ` +
      `environment variables before running the seed script — this bootstrap ` +
      `script no longer ships with a default credential.`,
    );
  }
  return value;
}

const MASTER_ADMIN = {
  name: process.env.MASTER_ADMIN_NAME ?? 'Master Administrator', // not a secret — harmless default
  email: requireEnv('MASTER_ADMIN_EMAIL'),
};

async function main() {
  // --- Module registry -----------------------------------------------------
  const modules: { key: string; name: string; status: ModuleStatus; sortOrder: number }[] = [
    { key: 'dashboard', name: 'Dashboard', status: 'LIVE', sortOrder: 0 },
    { key: 'organisation', name: 'Organisation', status: 'LIVE', sortOrder: 1 },
    { key: 'business-units', name: 'Business Units', status: 'LIVE', sortOrder: 2 },
    { key: 'workshop', name: 'Workshop', status: 'DISABLED', sortOrder: 10 },
    { key: 'inventory', name: 'Components store', status: 'LIVE', sortOrder: 11 },
    { key: 'procurement', name: 'Procurement', status: 'LIVE', sortOrder: 12 },
    { key: 'catalogue', name: 'Catalogue', status: 'LIVE', sortOrder: 3 },
    { key: 'production', name: 'Production', status: 'LIVE', sortOrder: 4 },
    { key: 'warehouse', name: 'Warehouses', status: 'LIVE', sortOrder: 5 },
    { key: 'sales', name: 'Sales', status: 'LIVE', sortOrder: 6 },
    { key: 'service', name: 'Service Centre', status: 'LIVE', sortOrder: 7 },
    { key: 'projects', name: 'Projects', status: 'LIVE', sortOrder: 8 },
    { key: 'finance', name: 'Finance', status: 'COMING_SOON', sortOrder: 13 },
    { key: 'hr', name: 'HR', status: 'COMING_SOON', sortOrder: 14 },
    { key: 'payroll', name: 'Payroll', status: 'COMING_SOON', sortOrder: 15 },
  ];
  for (const m of modules) {
    await prisma.platformModule.upsert({
      where: { key: m.key },
      update: { name: m.name, status: m.status, sortOrder: m.sortOrder },
      create: m,
    });
  }

  // --- Zinox Technologies hierarchy ----------------------------------------
  const organisation = await prisma.organisation.upsert({
    where: { slug: 'zinox-technologies' },
    update: {},
    create: {
      name: 'Zinox Technologies',
      slug: 'zinox-technologies',
      legalName: 'Zinox Technologies Limited',
      website: 'www.zinoxtechnologies.com',
      email: 'info@zinoxtechnologies.com',
      hqAddress: '5 Redemption Crescent, Gbagada Industrial Layout, Gbagada, Lagos',
      hotlines: ['+234 1 342 8686', '0700 ZINOX NG'],
      branding: {
        create: {
          primaryColor: '#E10600',
          secondaryColor: '#1A1A1A',
          accentColor: '#FF3B3B',
        },
      },
    },
  });

  const nigeria = await prisma.country.upsert({
    where: { name: 'Nigeria' },
    update: {},
    create: { name: 'Nigeria', isoCode: 'NG' },
  });

  const group = await prisma.businessUnit.upsert({
    where: { organisationId_slug: { organisationId: organisation.id, slug: 'zinox' } },
    update: { name: 'Manufacturing & Distribution' },
    create: { organisationId: organisation.id, name: 'Manufacturing & Distribution', slug: 'zinox' },
  });

  await prisma.countryLink.upsert({
    where: { businessUnitId_countryId: { businessUnitId: group.id, countryId: nigeria.id } },
    update: {},
    create: { businessUnitId: group.id, countryId: nigeria.id },
  });

  const lagos = await prisma.state.upsert({ where: { countryId_name: { countryId: nigeria.id, name: 'Lagos State' } }, update: {}, create: { countryId: nigeria.id, name: 'Lagos State' } });
  const fct = await prisma.state.upsert({ where: { countryId_name: { countryId: nigeria.id, name: 'Federal Capital Territory' } }, update: {}, create: { countryId: nigeria.id, name: 'Federal Capital Territory' } });
  const gbagada = await prisma.city.upsert({ where: { stateId_name: { stateId: lagos.id, name: 'Gbagada' } }, update: {}, create: { stateId: lagos.id, name: 'Gbagada' } });
  const garki = await prisma.city.upsert({ where: { stateId_name: { stateId: fct.id, name: 'Garki, Abuja' } }, update: {}, create: { stateId: fct.id, name: 'Garki, Abuja' } });

  // The plant, both warehouses, the showroom and the head office are on one site in Gbagada;
  // Abuja is the northern sales and service office.
  const hq = await prisma.branch.upsert({
    where: { id: `${group.id}-gbagada-seed` },
    update: {},
    create: { id: `${group.id}-gbagada-seed`, businessUnitId: group.id, cityId: gbagada.id, name: 'Gbagada Plant & Head Office', code: 'ZNX-HQ', address: '5 Redemption Crescent, Gbagada Industrial Layout, Lagos', email: 'lagos@zinoxtechnologies.com', hotlines: ['+234 1 342 8686'] },
  });
  const abuja = await prisma.branch.upsert({
    where: { id: `${group.id}-abuja-seed` },
    update: {},
    create: { id: `${group.id}-abuja-seed`, businessUnitId: group.id, cityId: garki.id, name: 'Abuja Regional Office', code: 'ZNX-ABJ', address: '20 Port Harcourt Crescent, Off Gimbiya Street, Garki Area 11, Abuja', email: 'abuja@zinoxtechnologies.com', hotlines: ['+234 9 290 4512'] },
  });

  // Department slugs 'workshop' and 'store' are what the platform's shared code looks up
  // (the Service Centre and the Components Store play those parts at Zinox).
  const departments: [string, string][] = [
    ['workshop', 'Service Centre'], ['store', 'Components Store'], ['production', 'Production'], ['finished-goods', 'Finished Goods Warehouse'],
    ['sales', 'Sales'], ['showroom', 'Showroom'], ['billing', 'Billing & Finance'], ['procurement', 'Procurement'], ['projects', 'Projects'],
    ['security', 'Security'], ['customer-care', 'Customer Care'], ['it', 'IT'],
  ];
  for (const branch of [hq, abuja]) {
    for (const [slug, name] of departments) {
      if (branch.id === abuja.id && ['production', 'finished-goods', 'procurement', 'projects'].includes(slug)) continue;
      await prisma.department.upsert({ where: { branchId_slug: { branchId: branch.id, slug } }, update: {}, create: { branchId: branch.id, name, slug } });
    }
  }
  console.log(`Seeded Zinox Technologies: ${hq.name} (${hq.id}) and ${abuja.name} (${abuja.id})`);

  const roleNames = ['Administrator', 'Workshop Manager', 'Workshop Supervisor', 'Technician', 'Store Manager', 'Store Officer', 'Finance Officer', 'Warranty HOD', 'Warranty Officer', 'Department Head', 'Chief Security Officer', 'Security Officer', 'Receptionist', 'Calendar User', 'Scheduling Admin', 'Broadcaster', 'Customer Care', 'Customer Care Lead', 'Executive', 'IT Administrator',
    // Zinox edition
    'Sales Officer', 'Showroom Officer', 'Key Account Manager', 'Sales Manager', 'Commercial Director', 'Billing Officer', 'Credit Controller', 'Finance Manager',
    'Production Planner', 'Assembler', 'Line Supervisor', 'QA Inspector', 'Production Manager', 'Parts Warehouse Officer', 'Finished Goods Officer', 'Dispatch Officer', 'Warehouse Manager',
    'Procurement Officer', 'Procurement Head', 'Service Technician', 'Service Supervisor', 'Warranty Manager', 'Project Manager'];
  for (const name of roleNames) {
    await prisma.role.upsert({
      where: { organisationId_slug: { organisationId: organisation.id, slug: slugify(name) } },
      update: {},
      // A Manager runs a branch (the role keeps its stable slug).
      create: { organisationId: organisation.id, name: name === 'Workshop Manager' ? 'Manager' : name === 'Procurement Head' ? 'Head of Procurement' : name === 'Finished Goods Officer' ? 'Finished Goods Officer' : name, slug: name === 'Finished Goods Officer' ? 'fg-warehouse-officer' : slugify(name), isSystem: true },
    });
  }

  // --- Master Administrator (bootstrap account) -----------------------------
  // isSuperAdmin bypasses permission checks entirely: every current and future
  // permission without RolePermission rows.
  const superAdminRole = await prisma.role.upsert({
    where: { organisationId_slug: { organisationId: organisation.id, slug: 'master-administrator' } },
    update: { isSuperAdmin: true, isSystem: true },
    create: {
      organisationId: organisation.id,
      name: 'Master Administrator',
      slug: 'master-administrator',
      description: 'System owner. Unrestricted access to every organisation, module, and setting.',
      isSystem: true,
      isSuperAdmin: true,
    },
  });

  const masterAdminUser = await prisma.user.upsert({
    where: { email: MASTER_ADMIN.email },
    update: {},
    create: {
      organisationId: organisation.id,
      accountType: 'ADMIN',
      fullName: MASTER_ADMIN.name,
      email: MASTER_ADMIN.email,
      emailVerified: true, // bootstrap account — skip the email-verification step
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: masterAdminUser.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: masterAdminUser.id, roleId: superAdminRole.id },
  });

  // Better Auth credential row, hashed with Better Auth's hashPassword() so the
  // normal /login page verifies it. Set only when the account is created: once
  // the Master Admin has changed their password in the portal, re-running the
  // seed must never put an older one back (SEC-01c). An existing password is
  // replaced only when RESET_MASTER_ADMIN_PASSWORD=yes is set for that run,
  // and then every open session of that account is signed out.
  const existingAccount = await prisma.account.findFirst({
    where: { userId: masterAdminUser.id, providerId: 'credential' },
    select: { id: true },
  });
  const resetRequested = process.env.RESET_MASTER_ADMIN_PASSWORD === 'yes';
  if (!existingAccount) {
    const password = requireEnv('MASTER_ADMIN_PASSWORD');
    await prisma.account.create({
      data: {
        userId: masterAdminUser.id,
        accountId: masterAdminUser.id,
        providerId: 'credential',
        password: await hashPassword(password),
      },
    });
  } else if (resetRequested) {
    const password = requireEnv('MASTER_ADMIN_PASSWORD');
    await prisma.account.update({ where: { id: existingAccount.id }, data: { password: await hashPassword(password) } });
    await prisma.session.deleteMany({ where: { userId: masterAdminUser.id } });
    // eslint-disable-next-line no-console
    console.log('Master Administrator password reset (RESET_MASTER_ADMIN_PASSWORD=yes); open sessions signed out.');
  } else {
    // eslint-disable-next-line no-console
    console.log('Master Administrator already has a password; left unchanged.');
  }

  // eslint-disable-next-line no-console
  await seedZinoxCatalogue(prisma, organisation.id, hq.id, masterAdminUser.id);

  console.log(`Seed complete: module registry + Zinox Technologies hierarchy + Master Administrator (${MASTER_ADMIN.email}).`);
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
