#!/usr/bin/env node
/**
 * Syncs the Prisma schema to the production database during a Vercel
 * production build, so schema changes deploy without a manual step.
 *
 * Uses `prisma db push` rather than `prisma migrate deploy`: the project has
 * no migration history, and db push reconciles the database with
 * schema.prisma directly. It never uses --accept-data-loss, so anything
 * destructive fails the deploy. Preview builds never touch the database.
 *
 * Skipped outside Vercel (e.g. GitHub Actions CI), so pull-request builds
 * need no DATABASE_URL.
 */
const { execSync } = require('child_process');
const path = require('path');
const { applyPredeploySql, applyPostdeploySql } = require('./apply-predeploy-sql');

if (!process.env.VERCEL) {
  console.log('[db-push] Skipping — not running on Vercel.');
  process.exit(0);
}

if (process.env.VERCEL_ENV !== 'production') {
  // Preview builds (every pull request) share the same DATABASE_URL — they
  // must NEVER change the live database before the change is merged.
  console.log(`[db-push] Skipping — ${process.env.VERCEL_ENV || 'unknown'} deployment; only production changes the database.`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.log('[db-push] Skipping — DATABASE_URL is not set for this deployment yet.');
  process.exit(0);
}

const schemaPath = path.resolve(__dirname, '..', 'packages/database/prisma/schema.prisma');

// Additive, re-runnable SQL first (unique indexes on new optional columns…),
// so the push below has nothing it would refuse. See apply-predeploy-sql.js.
applyPredeploySql();

console.log('[db-push] Pushing Prisma schema to the database...');
// No --accept-data-loss: a change that would drop a column, table or data
// stops the deploy. Such changes go through a reviewed SQL script and a backup.
execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate`, {
  stdio: 'inherit',
});
// Then the protections that must cover every table — including any the push
// just created: row-level security on, no access for Supabase's public roles.
applyPostdeploySql();

// The demo organisation's people and sign-ins (apps/portal/lib/demo) and, the first time, its demo records, only
// when the environment asks for them. Idempotent and never a reason for a
// deploy to fail: the schema is already in place, so a problem here is
// reported and the build carries on (DEMO_STRICT=1 makes it stop).
if (process.env.DEMO_STAFF_PASSWORD) {
  console.log('[demo] Making the demo people and sign-ins (DEMO_STAFF_PASSWORD is set)...');
  try {
    const fs = require('fs');
    const root = path.resolve(__dirname, '..');
    // The script reads the database through @ejo/database, which must be built.
    if (!fs.existsSync(path.join(root, 'packages/database/dist/index.js'))) execSync('npm run build --workspace=packages/database', { cwd: root, stdio: 'inherit' });
    execSync('npx tsx apps/portal/scripts/demo-people.ts', { cwd: root, stdio: 'inherit' });
    // The demo records, the first time only (the plant's six weeks, the workshop's six months).
    execSync('npx tsx apps/portal/scripts/demo-ensure.ts', { cwd: root, stdio: 'inherit' });
  } catch (err) {
    console.warn(`[demo] WARNING — the demo people were not made (${err && err.message ? err.message.split('\n')[0] : err}). The app still deploys; fix the cause (or DEMO_STRICT=1 to stop the build) and redeploy.`);
    if (process.env.DEMO_STRICT === '1') process.exit(1);
  }
} else {
  console.log('[demo] No demo people: DEMO_STAFF_PASSWORD is not set (set it in Vercel → Settings → Environment Variables to make the demo sign-ins on the next deploy).');
}
console.log('[db-push] Done.');
