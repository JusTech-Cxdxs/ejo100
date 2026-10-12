#!/usr/bin/env node
/**
 * Server-action id → { file, name, pages } map, read from a `next build --no-mangling`
 * output (.next/server). Test infrastructure only (CI security job).
 *
 *   node apps/portal/e2e/security/action-map.mjs [apps/portal/.next] > actions.json
 *
 * Server actions are public POST endpoints: anyone holding an id can call it with a
 * `Next-Action: <id>` header. Ids are unguessable per build, but every id used by a
 * client component is in the public JS, and every form action id is in the HTML of the
 * page that renders it — so each action must defend itself. The security tests use this
 * map to call actions by name.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'apps/portal/.next';
const manifest = JSON.parse(readFileSync(join(root, 'server/server-reference-manifest.json'), 'utf8'));
const ids = Object.keys(manifest.node);

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.js')) yield p;
  }
}

const names = new Map();
const files = new Map();
const reg = /\)\(([A-Za-z_$][A-Za-z0-9_$]*),"([0-9a-f]{40,44})",null\)/g;
const exp = /"([0-9a-f]{40,44})":\(\)=>[A-Za-z0-9_$]*?(?:lib_actions|app)_([A-Za-z0-9_$]+?)_tsx?__WEBPACK_IMPORTED_MODULE/g;
for (const f of walk(join(root, 'server'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(reg)) names.set(m[2], m[1]);
  for (const m of src.matchAll(exp)) if (!files.has(m[1])) files.set(m[1], m[2].replace(/_/g, '-'));
}

const pageToPath = (w) => '/' + w.replace(/^app\//, '').replace(/\/page$/, '').split('/').filter((s) => !/^\(.*\)$/.test(s)).join('/');
const out = {};
for (const id of ids) {
  const workers = Object.keys(manifest.node[id].workers ?? {});
  // Prefer a page without dynamic segments (rendered after the action runs).
  const pages = workers.map(pageToPath).sort((a, b) => (a.includes('[') ? 1 : 0) - (b.includes('[') ? 1 : 0) || a.length - b.length);
  out[id] = { name: names.get(id) ?? null, file: files.get(id) ?? null, page: pages[0] ?? null, pages: pages.length };
}
const unnamed = Object.values(out).filter((x) => !x.name).length;
process.stderr.write(`action-map: ${ids.length} actions, ${ids.length - unnamed} named\n`);
process.stdout.write(JSON.stringify(out, null, 1));
