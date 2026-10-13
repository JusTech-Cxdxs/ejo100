/**
 * The header search's query planner: every reference prefix is searchable
 * on its own, by full number and by its running number; names, plates and
 * phones go to the right fields; and nothing is skipped because a query has
 * no digits ("VX", "RT", "PRS").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REFERENCE_PATTERN, REFERENCE_PREFIXES, REFERENCE_TYPES, groupRank, matchRanges, numberFilters, planSearch, referenceUrl } from '../lib/search-plan';

const ROOT = join(__dirname, '..', '..');

test('"VX" is a prefix: the newest vehicle exits, plus names', () => {
  const p = planSearch('VX');
  assert.equal(p.kind, 'prefix');
  assert.deepEqual(p.prefixes, ['VX']);
  assert.equal(p.textScope, 'all');
  assert.deepEqual(numberFilters(p, 'VX'), [{ startsWith: 'VX-' }]);
  assert.deepEqual(numberFilters(p, 'JC'), [], 'other tables are not asked by number');
  assert.equal(p.take, 5);
});

test('"vx-2026" is that year’s vehicle exits, in any case', () => {
  const p = planSearch('vx-2026');
  assert.equal(p.kind, 'reference');
  assert.deepEqual(p.prefixes, ['VX']);
  assert.deepEqual(numberFilters(p, 'VX'), [{ startsWith: 'VX-2026' }, { startsWith: 'VX-', endsWith: '-002026' }]);
  assert.deepEqual(numberFilters(planSearch('VX 2026'), 'VX'), numberFilters(p, 'VX'));
});

test('"V" (one letter) reaches every V-prefixed type, with fewer results', () => {
  const p = planSearch('V');
  assert.equal(p.kind, 'prefix');
  assert.deepEqual([...p.prefixes].sort(), ['VIS', 'VP', 'VX']);
  assert.equal(p.short, true);
  assert.equal(p.take, 3);
  for (const x of ['VIS', 'VP', 'VX'] as const) assert.deepEqual(numberFilters(p, x), [{ startsWith: `${x}-` }]);
  assert.deepEqual(numberFilters(p, 'SV'), []);
});

test('"RT-2026-000003" is exactly that road test, typed any way', () => {
  for (const q of ['RT-2026-000003', 'rt-2026-000003', 'RT2026000003', 'rt 2026 000003', ' RT-2026-000003 ']) {
    const p = planSearch(q);
    assert.equal(p.kind, 'reference', q);
    assert.deepEqual(p.prefixes, ['RT'], q);
    assert.equal(p.textScope, 'none', `${q}: a complete number needs no name search`);
    assert.deepEqual(numberFilters(p, 'RT'), [{ equals: 'RT-2026-000003' }], q);
    assert.deepEqual(numberFilters(p, 'EP'), [], q);
  }
});

test('a number being typed still finds it: "RT-2026-0000", "JC-2026-12"', () => {
  assert.deepEqual(numberFilters(planSearch('RT-2026-0000'), 'RT'), [{ startsWith: 'RT-2026-0000' }, { equals: 'RT-2026-000000' }]);
  assert.deepEqual(numberFilters(planSearch('JC-2026-12'), 'JC'), [{ startsWith: 'JC-2026-12' }, { equals: 'JC-2026-000012' }]);
  assert.deepEqual(numberFilters(planSearch('VX-20'), 'VX'), [{ startsWith: 'VX-20' }, { startsWith: 'VX-', endsWith: '-000020' }]);
});

test('"000003" searches the running number of every type', () => {
  const p = planSearch('000003');
  assert.equal(p.kind, 'number');
  assert.deepEqual(p.prefixes, REFERENCE_PREFIXES);
  assert.equal(p.textScope, 'codes');
  for (const x of REFERENCE_PREFIXES) assert.deepEqual(numberFilters(p, x), [{ startsWith: `${x}-`, endsWith: '-000003' }]);
  assert.deepEqual(numberFilters(planSearch('12'), 'GRN'), [{ startsWith: 'GRN-', endsWith: '-000012' }]);
  assert.deepEqual(numberFilters(planSearch('2026-000003'), 'DLV'), [{ equals: 'DLV-2026-000003' }]);
});

test('"KJA-219" is a plate, not a reference: names and codes, no number columns', () => {
  const p = planSearch('KJA-219');
  assert.equal(p.kind, 'text');
  assert.equal(p.textScope, 'all');
  assert.equal(p.compact, 'KJA219');
  assert.deepEqual(p.codeForms, ['KJA-219', 'KJA219']);
  assert.deepEqual(planSearch('kja219gx').codeForms, ['kja219gx', 'KJA-219GX'], 'typed without the dash still finds KJA-219GX');
  for (const x of REFERENCE_PREFIXES) assert.deepEqual(numberFilters(p, x), []);
});

test('"Ada" is a name', () => {
  const p = planSearch('Ada');
  assert.equal(p.kind, 'text');
  assert.deepEqual(p.prefixes, []);
  assert.deepEqual(p.phones, []);
  assert.equal(p.take, 5);
});

test('"08031234567" is a phone (both local and international forms) and asks no name fields', () => {
  const p = planSearch('08031234567');
  assert.equal(p.kind, 'number');
  assert.equal(p.textScope, 'codes');
  assert.ok(p.phones.includes('08031234567'));
  assert.ok(p.phones.includes('8031234567'), '+234 803… matches too');
  for (const x of REFERENCE_PREFIXES) assert.deepEqual(numberFilters(p, x), [], 'too long to be a running number');
  assert.ok(planSearch('+2348031234567').phones.includes('08031234567'));
});

test('"PRS" is a prefix; "EP" also reaches EPR (it starts with EP), exact match first', () => {
  const prs = planSearch('PRS');
  assert.equal(prs.kind, 'prefix');
  assert.deepEqual(prs.prefixes, ['PRS']);
  assert.deepEqual(planSearch('ep').prefixes, ['EP', 'EPR']);
  assert.deepEqual(planSearch('jc-').prefixes, ['JC']);
});

test('"epr 12" is EPR number …-000012 of any year', () => {
  const p = planSearch('epr 12');
  assert.equal(p.kind, 'reference');
  assert.deepEqual(p.prefixes, ['EPR']);
  assert.deepEqual(numberFilters(p, 'EPR'), [{ startsWith: 'EPR-', endsWith: '-000012' }]);
  assert.deepEqual(numberFilters(p, 'EP'), []);
});

test('empty and hostile input', () => {
  assert.equal(planSearch('').kind, 'empty');
  assert.equal(planSearch('   ').kind, 'empty');
  assert.equal(planSearch('a'.repeat(300)).q.length, 60);
  assert.equal(planSearch(`'%_\\`).kind, 'text');
});

test('the groups the query points at come first', () => {
  const p = planSearch('VX');
  assert.ok(groupRank(p, 'Vehicle exits') < groupRank(p, 'Pages'));
  assert.equal(groupRank(planSearch('Ada'), 'Vehicle exits'), groupRank(planSearch('Ada'), 'Pages'));
});

test('one list of prefixes: the pattern, the URLs and every generator agree', () => {
  assert.equal(new Set(REFERENCE_PREFIXES).size, REFERENCE_PREFIXES.length);
  for (const x of REFERENCE_PREFIXES) assert.ok(`${x}-2026-000001`.match(new RegExp(`^${REFERENCE_PATTERN.source}$`)), x);
  // Every prefix a generator writes (`XX-${year}-` or nextNumber('XX')) is in the list.
  const src = readdirSync(join(ROOT, 'lib', 'actions')).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(ROOT, 'lib', 'actions', f), 'utf8')).join('\n');
  const generated = new Set([...src.matchAll(/`([A-Z]{2,3})-\$\{(?:year|lagosYear\(\))\}-`/g)].map((m) => m[1]!));
  for (const m of src.matchAll(/nextNumber\('([A-Z]{2,3})'\)/g)) generated.add(m[1]!);
  assert.ok(generated.size >= 15, `found ${generated.size} generators`);
  for (const g of generated) assert.ok((REFERENCE_PREFIXES as string[]).includes(g), `${g} is generated but not searchable`);
});

test('every record link points at a real page', () => {
  const app = join(ROOT, 'app', '(app)');
  for (const t of REFERENCE_TYPES) {
    if (t.prefix === 'RF') continue; // opens on its Job Card / Vehicle Service
    const dir = join(app, referenceUrl(t.prefix, '[id]'));
    assert.ok(statSync(join(dir, 'page.tsx')).isFile(), `${t.prefix} → ${dir}`);
  }
});

test('highlighting finds the query however it was typed', () => {
  assert.deepEqual(matchRanges('VX-2026-000012', 'vx'), [[0, 2]]);
  assert.deepEqual(matchRanges('VX-2026-000012', 'vx2026'), [[0, 7]]);
  assert.deepEqual(matchRanges('RT-2026-000003', 'rt 3'), [[0, 2], [8, 14]]);
  assert.deepEqual(matchRanges('Ada Customer', 'cust'), [[4, 8]]);
  assert.deepEqual(matchRanges('Ada Customer', 'zzz'), []);
});
