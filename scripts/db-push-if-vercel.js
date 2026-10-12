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
console.log('[db-push] Done.');
