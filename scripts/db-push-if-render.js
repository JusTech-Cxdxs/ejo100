#!/usr/bin/env node
/**
 * Render equivalent of db-push-if-vercel.js — automatically syncs the
 * Prisma schema to the live database as part of the API service's build
 * on Render, so schema changes reach Supabase Postgres without ever
 * requiring a manually-run terminal command.
 *
 * Same design as the Vercel version, mirrored rather than shared, so each
 * platform's script is self-contained and can be deleted independently
 * if that platform is ever dropped:
 * - Uses `prisma db push` (not `migrate deploy`) — no pre-existing
 *   migration history required, so the whole pipeline
 *   (generate -> push -> build) runs unattended on every deploy.
 * - `--accept-data-loss` so it never blocks on an interactive prompt in
 *   a non-interactive build. Same trade-off as the Vercel script: no
 *   migration history, appropriate for a solo project managed entirely
 *   from web dashboards.
 *
 * Render sets the `RENDER` environment variable to "true" automatically
 * on every Render service — this script is a no-op anywhere that
 * variable isn't set (local dev, GitHub Actions CI), so CI never needs a
 * live DATABASE_URL secret.
 *
 * Wire this into the API service's Render "Build Command", e.g.:
 *   npm install && npm run build --workspace=packages/database && npm run build --workspace=apps/api && node scripts/db-push-if-render.js
 */
const { execSync } = require('child_process');
const path = require('path');

if (!process.env.RENDER) {
  console.log('[db-push] Skipping — not running on Render.');
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.log('[db-push] Skipping — DATABASE_URL is not set for this deployment yet.');
  process.exit(0);
}

const schemaPath = path.resolve(__dirname, '..', 'packages/database/prisma/schema.prisma');

console.log('[db-push] Pushing Prisma schema to the database...');
execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss --skip-generate`, {
  stdio: 'inherit',
});
console.log('[db-push] Done.');
