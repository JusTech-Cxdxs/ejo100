#!/usr/bin/env node
/**
 * Client-bundle secret scan: everything under <app>/.next/static is public.
 *  - the VALUES of this job's secret env vars must not appear in it;
 *  - no secret-looking strings (private keys, JWTs, DB URLs with passwords, cloud keys);
 *  - which env NAMES appear (non-NEXT_PUBLIC names are only acceptable as library
 *    lookups that resolve to undefined in the browser);
 *  - no source maps are published.
 *   node bundle-scan.mjs apps/portal apps/website
 */
import { readdirSync, readFileSync, statSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SECRET_VARS = ['BETTER_AUTH_SECRET', 'CRON_SECRET', 'SMTP_PASSWORD', 'SMTP_PASS', 'SUPABASE_SERVICE_ROLE_KEY', 'MASTER_ADMIN_PASSWORD', 'DATABASE_URL', 'DIRECT_URL'];
const PATTERNS = { 'private key': /-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'JWT': /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'postgres URL with password': /postgres(?:ql)?:\/\/[^:\s"'/]+:[^@\s"']+@/, 'AWS key': /AKIA[0-9A-Z]{16}/, 'Stripe live key': /sk_live_[0-9a-zA-Z]{10,}/, 'GitHub token': /gh[pousr]_[A-Za-z0-9]{30,}/, 'Resend key': /\bre_[A-Za-z0-9]{20,}/ };
function* walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) yield* walk(p); else yield p; } }

let bad = 0;
const md = ['### Client bundle scan', '', '| App | Files | Secret values found | Secret-looking strings | Env names in bundle | Source maps |', '|---|---|---|---|---|---|'];
for (const app of process.argv.slice(2)) {
  const dir = join(app, '.next', 'static');
  if (!existsSync(dir)) { console.log(`::warning title=bundle scan::${dir} missing (not built)`); continue; }
  const files = [...walk(dir)];
  const values = SECRET_VARS.map((k) => [k, process.env[k]]).filter(([, v]) => v && v.length >= 6).map(([k, v]) => [k, k.endsWith('_URL') ? (v.match(/:\/\/[^:]+:([^@]+)@/)?.[1] ?? '') : v]).filter(([, v]) => v.length >= 6);
  const foundValues = new Set(); const foundPatterns = new Set(); const names = new Set(); let maps = 0;
  for (const f of files) {
    if (f.endsWith('.map')) maps += 1;
    if (!/\.(js|css|json|html|txt)$/.test(f)) continue;
    const src = readFileSync(f, 'utf8');
    for (const [k, v] of values) if (src.includes(v)) foundValues.add(`${k} in ${f.slice(dir.length + 1)}`);
    for (const [k, re] of Object.entries(PATTERNS)) if (re.test(src)) foundPatterns.add(`${k} in ${f.slice(dir.length + 1)}`);
    for (const m of src.matchAll(/\b(NEXT_PUBLIC_[A-Z0-9_]+|BETTER_AUTH_[A-Z_]+|AUTH_SECRET|DATABASE_URL|DIRECT_URL|CRON_SECRET|SMTP_[A-Z]+|SUPABASE_SERVICE_ROLE_KEY|MASTER_ADMIN_[A-Z]+)\b/g)) names.add(m[1]);
  }
  bad += foundValues.size + foundPatterns.size + maps;
  const level = foundValues.size || foundPatterns.size ? 'error' : maps ? 'warning' : 'notice';
  console.log(`::${level} title=bundle scan ${app}::${files.length} files; secret VALUES of ${values.map(([k]) => k).join('/') || '(none set)'}: ${[...foundValues].join('; ') || 'none'}; secret-looking strings: ${[...foundPatterns].join('; ') || 'none'}; env names present: ${[...names].sort().join(', ') || 'none'}; source maps: ${maps}`);
  md.push(`| ${app} | ${files.length} | ${[...foundValues].join('<br>') || 'none'} | ${[...foundPatterns].join('<br>') || 'none'} | ${[...names].sort().join(', ')} | ${maps} |`);
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
console.log(md.join('\n'));
process.exit(bad ? 1 : 0);
