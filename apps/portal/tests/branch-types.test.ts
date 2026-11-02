/**
 * P1 Branch types: what kind of place a branch is, which records may live on
 * it, the departments a new plant gets, and the wiring that keeps plant work
 * and workshop work on their own branches.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AREA_BRANCH_TYPES, BRANCH_TYPES, BRANCH_TYPE_HINTS, BRANCH_TYPE_WORDS, PLANT_DEPARTMENTS, branchTypeFits, branchTypeMismatch, departmentsFor, isBranchType } from '../lib/branch-types';

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

test('five kinds of branch, each with words and a hint; plant records only on an assembly plant, store records on a workshop or warehouse', () => {
  assert.deepEqual(BRANCH_TYPES, ['WORKSHOP', 'ASSEMBLY_PLANT', 'SALES', 'HEAD_OFFICE', 'WAREHOUSE']);
  for (const t of BRANCH_TYPES) { assert.ok(BRANCH_TYPE_WORDS[t]); assert.ok(BRANCH_TYPE_HINTS[t].length > 20); }
  assert.ok(isBranchType('ASSEMBLY_PLANT') && !isBranchType('PLANT') && !isBranchType(null));
  assert.equal(branchTypeFits('plant', 'ASSEMBLY_PLANT'), true);
  assert.equal(branchTypeFits('plant', 'WORKSHOP'), false);
  assert.equal(branchTypeFits('workshop', 'ASSEMBLY_PLANT'), false);
  assert.equal(branchTypeFits('store', 'WAREHOUSE'), true);
  assert.equal(branchTypeFits('store', 'ASSEMBLY_PLANT'), false, 'the plant store is a department of the plant, not the Store module');
  assert.equal(branchTypeMismatch('plant', 'Afprint Assembly Plant', 'ASSEMBLY_PLANT'), null);
  assert.equal(branchTypeMismatch('plant', 'Isolo Branch', 'WORKSHOP'), 'Isolo Branch is a workshop, so it cannot hold plant records: they belong on an assembly plant branch.');
  assert.equal(branchTypeMismatch('store', 'Afprint Assembly Plant', 'ASSEMBLY_PLANT'), 'Afprint Assembly Plant is an assembly plant, so it cannot hold store records: they belong on a workshop or warehouse branch.');
  assert.deepEqual(AREA_BRANCH_TYPES.workshop, ['WORKSHOP']);
});

test('a new assembly plant gets its departments (stable slugs); other kinds start empty', () => {
  assert.deepEqual(PLANT_DEPARTMENTS.map((d) => d.slug), ['plant-kit-receiving', 'plant-production', 'plant-quality', 'plant-pdi', 'plant-yard', 'plant-maintenance']);
  assert.equal(new Set(PLANT_DEPARTMENTS.map((d) => d.slug)).size, PLANT_DEPARTMENTS.length);
  assert.deepEqual(departmentsFor('ASSEMBLY_PLANT').map((d) => d.name), PLANT_DEPARTMENTS.map((d) => d.name));
  assert.deepEqual(departmentsFor('WORKSHOP'), []);
  assert.deepEqual(departmentsFor('SALES'), []);
  // The seed and the e2e seed create the same departments the code does.
  const seed = read('../../packages/database/prisma/seed.ts');
  for (const d of PLANT_DEPARTMENTS) assert.ok(seed.includes(`'${d.slug}'`), `seed: ${d.slug}`);
  assert.match(seed, /name: 'Afprint Assembly Plant'[\s\S]*type: 'ASSEMBLY_PLANT',\s*sapPlant: '1100'/);
});

test('the SQL is additive and the schema carries the kind with a default of WORKSHOP', () => {
  const schema = read('../../packages/database/prisma/schema.prisma');
  assert.match(schema, /enum BranchType \{\n  WORKSHOP\n  ASSEMBLY_PLANT\n  SALES\n  HEAD_OFFICE\n  WAREHOUSE\n\}/);
  assert.match(schema, /type           BranchType @default\(WORKSHOP\)/);
  for (const f of ['../../scripts/predeploy/0012-branch-types.sql', '../../scripts/v-p1-branch-types.sql']) {
    const sql = read(f);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS "type" "BranchType" NOT NULL DEFAULT 'WORKSHOP'/, f);
    assert.doesNotMatch(sql, /DROP |DELETE |TRUNCATE/i, `${f}: deletes nothing`);
  }
  // The deploy opens the plant and moves records and plant-only staff onto it — once, and never for an organisation that already has a plant.
  const post = read('../../scripts/postdeploy/0011-afprint-plant.sql');
  assert.match(post, /AND NOT EXISTS \(SELECT 1 FROM branches x[\s\S]*x\.type = 'ASSEMBLY_PLANT'\)/);
  assert.match(post, /'Afprint Assembly Plant', 'KWL-AP', 'ASSEMBLY_PLANT', '1100'/);
  assert.match(post, /AND NOT EXISTS \(SELECT 1 FROM user_roles ur JOIN roles r ON r\.id = ur\."roleId" WHERE ur\."userId" = u\.id AND r\.slug NOT IN/, 'people with any other role stay where they are');
  assert.match(post, /'branch\.plant_records_moved'/);
  assert.doesNotMatch(post, /DELETE |DROP |TRUNCATE/i);
});

test('wired in: every plant read goes through the typed reach; the workshop anchors only on workshop branches; a new plant needs its SAP plant code', () => {
  const authz = read('lib/authz/server.ts');
  assert.match(authz, /export async function typedReach\(/);
  assert.match(authz, /return none\('lens-elsewhere'/, 'a lens on a workshop explains instead of showing nothing');
  for (const f of ['lib/actions/plant.ts', 'lib/actions/plant-kits.ts', 'lib/exports/kinds.ts', 'lib/actions/search.ts']) {
    const src = read(f);
    assert.doesNotMatch(src, /reachWhere\('plant\.view'/, `${f}: plant records are read through typedReach, never the plain reach`);
    assert.match(src, /typedReach\('plant\.(view|vehicle\.register|kit\.receive)', AREA_BRANCH_TYPES\.plant/, f);
  }
  const plant = read('lib/actions/plant.ts');
  assert.match(plant, /typedBranchWithinReach\('plant\.vehicle\.register', AREA_BRANCH_TYPES\.plant/);
  const kits = read('lib/actions/plant-kits.ts');
  assert.match(kits, /typedBranchWithinReach\('plant\.kit\.receive', AREA_BRANCH_TYPES\.plant/);
  const core = read('lib/workshop-core.ts');
  assert.match(core, /const fitting = \{ type: \{ in: AREA_BRANCH_TYPES\[slug\] \} \} as const;/);
  assert.match(core, /\['department-branch-v2'\]/, 'the shared lookup is re-keyed, so a stale answer never anchors a plant');
  const structure = read('lib/actions/structure.ts');
  assert.match(structure, /An assembly plant needs its SAP plant code/);
  assert.match(structure, /departmentsFor\(type\)/);
  const branches = read('lib/actions/branches.ts');
  assert.match(branches, /export async function movePlantRecords\(/);
  assert.match(branches, /action: 'branch\.plant_records_moved'/);
  assert.match(branches, /so it stays \$\{BRANCH_TYPE_WORDS\[before\.type\]\.toLowerCase\(\)\}/, 'a branch holding records of its kind keeps that kind');
  const dx = read('lib/actions/data-exchange.ts');
  assert.match(dx, /branchTypeMismatch\('store', b\.name, b\.type\)/);
  for (const page of ['app/(app)/plant/page.tsx', 'app/(app)/plant/vehicles/page.tsx', 'app/(app)/plant/kits/page.tsx', 'app/(app)/plant/shipments/page.tsx']) assert.match(read(page), /PlantReachNotice/, page);
});
