#!/usr/bin/env node
/**
 * Render version of db-push-if-vercel.js: syncs the Prisma schema to the
 * database during the API service's Render build. Kept separate rather than
 * shared so each platform's script stands alone.
 * - `prisma db push`, not `migrate deploy` (no migration history).
 * - No `--accept-data-loss`: anything destructive stops the deploy.
 *
 * Render sets RENDER=true on every service; elsewhere (local dev, GitHub
 * Actions CI) this is a no-op, so CI needs no DATABASE_URL.
 *
 * Render "Build Command", e.g.:
 *   npm install && npm run build --workspace=packages/database && npm run build --workspace=apps/api && node scripts/db-push-if-render.js
 */
const { execSync } = require('child_process');
const path = require('path');
const { applyPredeploySql, applyPostdeploySql } = require('./apply-predeploy-sql');

if (!process.env.RENDER) {
  console.log('[db-push] Skipping — not running on Render.');
  process.exit(0);
}

if (process.env.IS_PULL_REQUEST === 'true') {
  // Render pull-request previews must NEVER change the live database.
  console.log('[db-push] Skipping — pull-request preview; only the main service changes the database.');
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
