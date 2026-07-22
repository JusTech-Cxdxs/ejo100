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
 * Trade-off (by design, not an oversight): this does not keep a migration
 * history and uses --accept-data-loss so it never blocks on an interactive
 * prompt in a non-interactive build. For a solo project managed entirely
 * from the browser, that trade-off is the right one; if migration history
 * ever becomes necessary, a terminal-based `prisma migrate dev` session
 * is unavoidable at that point.
 *
 * Skipped entirely outside Vercel (e.g. GitHub Actions CI) so pull-request
 * builds don't require a live DATABASE_URL secret.
 */
const { execSync } = require('child_process');
const path = require('path');

if (!process.env.VERCEL) {
  console.log('[db-push] Skipping — not running on Vercel.');
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
