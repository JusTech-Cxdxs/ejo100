/**
 * Phase 2 seed structure — seeds only the organizational skeleton
 * (Platform Module registry + the Kewalram Nigeria hierarchy down to
 * Isolo Branch / Workshop) described in the project constitution.
 * No business data (job cards, customers, etc.) is seeded here — that
 * arrives with the Workshop module in a later phase.
 *
 * Run with: npm run seed --workspace=packages/database
 * (requires DATABASE_URL to point at a real, migrated Postgres instance,
 * and MASTER_ADMIN_EMAIL / MASTER_ADMIN_PASSWORD to be set — see below)
 */
import { PrismaClient, ModuleStatus } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';

const prisma = new PrismaClient();

/**
 * First Master Administrator (System Owner / Super Admin) — bootstraps the
 * platform. Every future user, role, and permission is created from the
 * Portal's admin UI, not from this seed.
 *
 * Deliberately NO hardcoded fallback credentials here — this repository
 * may be public, and a real password sitting in source control (even as
 * "just a default") is a genuine, standing security exposure, not a
 * style preference. MASTER_ADMIN_EMAIL and MASTER_ADMIN_PASSWORD must be
 * set explicitly in the deployment platform's environment variables
 * before running this script; it fails loudly rather than silently
 * falling back to a value anyone could read on GitHub.
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
  password: requireEnv('MASTER_ADMIN_PASSWORD'),
};

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

  // --- Master Administrator (bootstrap account) -----------------------------
  // isSuperAdmin bypasses PermissionsGuard entirely (see
  // apps/api/src/common/guards/permissions.guard.ts) — this role has
  // unrestricted access to every current and future module without
  // needing an explicit RolePermission row per permission.
  const superAdminRole = await prisma.role.upsert({
    where: { companyId_slug: { companyId: company.id, slug: 'master-administrator' } },
    update: { isSuperAdmin: true, isSystem: true },
    create: {
      companyId: company.id,
      name: 'Master Administrator',
      slug: 'master-administrator',
      description: 'System owner. Unrestricted access to every company, module, and setting.',
      isSystem: true,
      isSuperAdmin: true,
    },
  });

  const masterAdminUser = await prisma.user.upsert({
    where: { email: MASTER_ADMIN.email },
    update: {},
    create: {
      companyId: company.id,
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

  // Better Auth's own credential provider row — hashed with Better Auth's
  // own hashPassword() so it verifies correctly through the existing
  // /login page (apps/portal/lib/auth.ts) with no special-case login path.
  //
  // Update-or-create (not "only create if entirely missing") so re-running
  // this seed — e.g. after rotating MASTER_ADMIN_PASSWORD — always keeps
  // the stored hash in sync with whatever the environment variable
  // currently says, rather than silently doing nothing on a second run.
  const existingAccount = await prisma.account.findFirst({
    where: { userId: masterAdminUser.id, providerId: 'credential' },
  });
  const passwordHash = await hashPassword(MASTER_ADMIN.password);
  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: passwordHash },
    });
  } else {
    await prisma.account.create({
      data: {
        userId: masterAdminUser.id,
        accountId: masterAdminUser.id,
        providerId: 'credential',
        password: passwordHash,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seed complete: module registry + Kewalram Nigeria hierarchy + Master Administrator (${MASTER_ADMIN.email}).`);
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
