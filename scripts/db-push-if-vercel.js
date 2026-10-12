#!/usr/bin/env node
/**
 * Automatically syncs the Prisma schema to the live database during a
 * Vercel build — this is what lets schema changes reach Neon without ever
 * requiring a manually-run terminal command.
 *
 * Deliberately uses `prisma db push` rather than `prisma migrate deploy`:
 * migrate deploy only APPLIES migration files that already exist in
 * prisma/migrations, and generating that first migration normally
 * requires running `prisma migrate dev` once against a real database from
 * a terminal — exactly what this project's workflow cannot do. `db push`
 * reads schema.prisma directly and reconciles the live database to match
 * it, with no pre-existing migration history required, so the whole
 * pipeline (generate -> push -> build) can run unattended on every deploy.
 *
 * Trade-off: this does not keep a migration history. It does NOT use
 * --accept-data-loss: anything destructive fails the deploy (safe by
 * default), and only PRODUCTION deploys run it — previews never touch the
 * database. If migration history
 * ever becomes necessary, a terminal-based `prisma migrate dev` session
 * is unavoidable at that point.
 *
 * Skipped entirely outside Vercel (e.g. GitHub Actions CI) so pull-request
 * builds don't require a live DATABASE_URL secret.
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
// No --accept-data-loss: a change that would drop a column or table (or
// any data) now STOPS the deploy instead of silently deleting data. Such
// changes are made deliberately, with a reviewed SQL script and a backup.
execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate`, {
  stdio: 'inherit',
});
// Then the protections that must cover every table — including any the push
// just created: row-level security on, no access for Supabase's public roles.
applyPostdeploySql();
console.log('[db-push] Done.');
