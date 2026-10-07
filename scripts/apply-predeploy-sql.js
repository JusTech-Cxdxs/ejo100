#!/usr/bin/env node
/**
 * Runs every scripts/predeploy/*.sql file, in name order, against the
 * production database — just before `prisma db push`.
 *
 * Why: `db push` (rightly, without --accept-data-loss) stops a deploy on any
 * change it cannot prove harmless — including adding a UNIQUE index to a new,
 * empty, optional column. Such purely additive changes are written here as
 * plain, re-runnable SQL (IF NOT EXISTS), so the push that follows finds
 * nothing left to do and the deploy carries on.
 *
 * Rules for files in scripts/predeploy/ (checked by a test):
 *   • additive only — never DROP, DELETE, TRUNCATE, or a type change;
 *   • re-runnable — every CREATE / ADD uses IF NOT EXISTS;
 *   • never edited once deployed — add a new, higher-numbered file instead.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function applyPredeploySql() {
  const dir = path.resolve(__dirname, 'predeploy');
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  // A direct (non-pooled) connection when one is configured — DDL through a
  // transaction pooler works, but a direct connection is the safe choice.
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  for (const f of files) {
    console.log(`[predeploy] ${f}`);
    execSync(`npx prisma db execute --file="${path.join(dir, f)}" --url="$PREDEPLOY_URL"`, {
      stdio: 'inherit',
      env: { ...process.env, PREDEPLOY_URL: url },
    });
  }
}

module.exports = { applyPredeploySql };
