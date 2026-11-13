/**
 * Which areas a person is offered, by the kind of branch in view. Workshop,
 * Inventory and the Assembly plant exist only on branches of the right kind:
 * leadership sees every area (whatever branch they are attached to) until
 * they choose one branch in the branch bar; someone whose access is to their
 * own branch is offered only what that branch has. The rule hides menu
 * entries only — permissions decide what anyone may do, as before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decide, ROLE_GRANTS, type Principal } from '../lib/authz/catalogue';
import { hrefInView, moduleInView, navigationFor } from '../lib/authz/navigation';
import { branchHostsModule, MODULE_AREA, moduleOfPath } from '../lib/branch-types';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'b', departmentId: null, ...extra });
const AREAS = ['workshop', 'inventory', 'warranty', 'plant'];
const menu = (roles: string[], view: { ownBranchType?: string | null; lensBranchType?: string | null } = {}, extra: Partial<Principal> = {}) =>
  navigationFor(who(roles, extra), view).map((i) => i.key).filter((k) => AREAS.includes(k));

test('which kind of branch has which area', () => {
  assert.deepEqual(MODULE_AREA, { workshop: 'workshop', inventory: 'store', warranty: 'workshop', plant: 'plant' });
  assert.equal(branchHostsModule('inventory', 'ASSEMBLY_PLANT'), false, 'the plant has no store');
  assert.equal(branchHostsModule('inventory', 'WORKSHOP'), true);
  assert.equal(branchHostsModule('inventory', 'WAREHOUSE'), true);
  assert.equal(branchHostsModule('workshop', 'WAREHOUSE'), false);
  assert.equal(branchHostsModule('plant', 'WORKSHOP'), false, 'a workshop has no line');
  assert.equal(branchHostsModule('plant', 'ASSEMBLY_PLANT'), true);
  for (const type of ['WORKSHOP', 'ASSEMBLY_PLANT', 'WAREHOUSE', 'SALES', 'HEAD_OFFICE']) for (const everywhere of ['crm', 'security', 'analytics', 'dashboard', 'users']) assert.equal(branchHostsModule(everywhere, type), true, `${everywhere} at ${type}`);
  assert.equal(branchHostsModule('plant', null), true, 'an unknown kind of branch hides nothing');
  assert.equal(moduleOfPath('/inventory/parts?q=x'), 'inventory');
  assert.equal(moduleOfPath('/plant/pdi/abc'), 'plant');
  assert.equal(moduleOfPath('/workshop'), 'workshop');
  for (const p of ['/dashboard', '/vehicles/ABC', '/crm/customers/1', '/', '', null]) assert.equal(moduleOfPath(p), null, String(p));
});

test('leadership oversees every branch, whichever branch they are attached to — until they choose one in the branch bar', () => {
  for (const role of ['executive', 'administrator']) {
    for (const own of ['WORKSHOP', 'ASSEMBLY_PLANT', 'HEAD_OFFICE', 'WAREHOUSE', null]) assert.deepEqual(menu([role], { ownBranchType: own }), AREAS, `${role} attached to ${own}`);
    assert.deepEqual(menu([role], {}, { branchId: null }), AREAS, `${role} attached to no branch`);
    assert.deepEqual(menu([role], { ownBranchType: 'WORKSHOP', lensBranchType: 'ASSEMBLY_PLANT' }), ['plant'], `${role} viewing the plant: no Workshop, no Inventory`);
    assert.deepEqual(menu([role], { ownBranchType: 'ASSEMBLY_PLANT', lensBranchType: 'WORKSHOP' }), ['workshop', 'inventory', 'warranty'], `${role} viewing the workshop: no line`);
    assert.deepEqual(menu([role], { lensBranchType: 'WAREHOUSE' }), ['inventory'], `${role} viewing a warehouse`);
    assert.deepEqual(menu([role], { lensBranchType: 'HEAD_OFFICE' }), [], `${role} viewing head office`);
    // What they may do never depends on the branch in view.
    for (const k of ['workshop.view', 'store.view', 'warranty.view', 'plant.view'] as const) assert.equal(decide(who([role], { branchId: null }), k).scope, 'ALL', `${role} ${k}`);
  }
});

test('someone whose access is to their own branch is offered only what that branch has', () => {
  // A Branch Administrator's role covers every area a branch could have: the branch decides which exist.
  assert.deepEqual(menu(['branch-administrator'], { ownBranchType: 'ASSEMBLY_PLANT' }), ['plant'], 'at the plant: no Workshop, no Inventory');
  assert.deepEqual(menu(['branch-administrator'], { ownBranchType: 'WORKSHOP' }), ['workshop', 'inventory', 'warranty'], 'at the workshop: no Assembly plant');
  assert.deepEqual(menu(['branch-administrator'], { ownBranchType: 'WAREHOUSE' }), ['inventory']);
  assert.deepEqual(menu(['plant-manager'], { ownBranchType: 'ASSEMBLY_PLANT' }), ['plant'], 'the plant manager is not offered the workshop’s warranties and claims');
  assert.deepEqual(menu(['workshop-manager'], { ownBranchType: 'WORKSHOP' }).includes('plant'), false);
  assert.deepEqual(menu(['store-manager'], { ownBranchType: 'WAREHOUSE' }).includes('inventory'), true);
  // Areas not tied to a kind of branch are untouched.
  const full = (type: string) => navigationFor(who(['branch-administrator']), { ownBranchType: type }).map((i) => i.key);
  for (const k of ['dashboard', 'crm', 'security', 'analytics', 'users']) assert.ok(full('ASSEMBLY_PLANT').includes(k), `${k} at the plant`);
});

test('no role is offered an area its own branch cannot have; with no branch known, nothing is hidden (as before)', () => {
  for (const role of Object.keys(ROLE_GRANTS)) {
    const p = who([role]);
    for (const [type, never] of [['ASSEMBLY_PLANT', ['workshop', 'inventory', 'warranty']], ['WORKSHOP', ['plant']], ['WAREHOUSE', ['workshop', 'warranty', 'plant']]] as const) {
      const shown = navigationFor(p, { ownBranchType: type }).map((i) => i.key);
      for (const area of never) {
        const key = area === 'inventory' ? 'store.view' : area === 'plant' ? 'plant.view' : area === 'warranty' ? 'warranty.view' : 'workshop.view';
        if (decide(p, key).scope === 'ALL') continue;
        assert.ok(!shown.includes(area), `${role} at ${type} is offered ${area}`);
      }
    }
    assert.deepEqual(navigationFor(p, {}).map((i) => i.key), navigationFor(p).map((i) => i.key), role);
  }
  assert.equal(moduleInView(who([], { isSuperAdmin: true }), 'plant', ['plant.view'], { ownBranchType: 'WORKSHOP' }), true, 'the platform team');
});

test('wired in: the layout and search use the branch in view; the branch bar offers only the branches that have the area', () => {
  assert.match(read('app/(app)/layout.tsx'), /navigationFor\(principal, view\)/);
  assert.match(read('lib/actions/search.ts'), /navigationFor\(principal, await getBranchView\(\)/);
  const bar = read('components/BranchLensBar.tsx');
  assert.match(bar, /const here = options\.branches\.filter\(\(b\) => branchHostsModule\(area, b\.type\)\)/);
  assert.match(bar, /data-testid="branch-lens-elsewhere"/);
  const srv = read('lib/authz/server.ts');
  assert.match(srv, /export const getBranchView = cache\(/);
});

test('dashboard tiles and shortcuts never lead into an area the branch in view does not have; Headquarters is for the whole organisation', () => {
  const plantAdmin = who(['branch-administrator']);
  for (const href of ['/inventory/parts', '/inventory/goods-receipts/new', '/workshop/custody', '/warranty/claims/new']) assert.equal(hrefInView(plantAdmin, href, { ownBranchType: 'ASSEMBLY_PLANT' }), false, href);
  for (const href of ['/plant/line', '/crm', '/security/visitors', '/analytics', '/notifications']) assert.equal(hrefInView(plantAdmin, href, { ownBranchType: 'ASSEMBLY_PLANT' }), true, href);
  assert.equal(hrefInView(who(['executive']), '/inventory/parts', { ownBranchType: 'ASSEMBLY_PLANT' }), true, 'a director attached to the plant still oversees the store');
  assert.equal(hrefInView(who(['executive']), '/inventory/parts', { lensBranchType: 'ASSEMBLY_PLANT' }), false, 'until they choose the plant in the branch bar');
  const dash = read('app/(app)/dashboard/page.tsx');
  assert.match(dash, /quickAllowed\[i\] && inView\(q\.href\)/);
  assert.match(dash, /glance\.filter\(\(t\) => inView\(t\.href\)\)/);
  for (const page of ['app/(app)/headquarters/page.tsx', 'app/(app)/headquarters/team/page.tsx']) assert.match(read(page), /await guardOrganisationWide\('analytics\.business\.view'/, page);
  assert.match(read('lib/authz/server.ts'), /if \(p\.isSuperAdmin \|\| scopeFor\(p, key\) === 'ALL'\) return;/);
  const dx = read('lib/actions/data-exchange.ts');
  assert.match(dx, /if \(!\(await allows\('dataexchange\.import\.run', \{ branchId: b\.id \}\)\)\) throw new DataExchangeError\(`You may bring records into your own branch only/, 'an import loads only into a branch the importer may use');
  assert.match(read('lib/actions/leadership.ts'), /const reach = await typedReach\('plant\.view', AREA_BRANCH_TYPES\.plant\);/, 'the plant’s figures on the director’s dashboard are fenced like every plant page');
});

test('an area the person’s own branch does not have explains itself when opened by a pasted link — the same rule as the menu', () => {
  const server = read('lib/authz/server.ts');
  const gate = server.slice(server.indexOf('export async function areaNotAtMyBranch'));
  assert.match(gate.slice(0, 900), /moduleInView\(p, moduleKey, \[AREA_VIEW\[moduleKey\]!\], view\)/, 'one rule for the menu and the page');
  assert.match(gate.slice(0, 900), /view\.lensBranchType \|\| !view\.ownBranchType/, 'the branch bar explains a chosen branch; an unknown kind hides nothing');
  for (const [area, key] of [['workshop', 'workshop.view'], ['inventory', 'store.view'], ['warranty', 'warranty.view']] as const) {
    const layout = read(`app/(app)/${area}/layout.tsx`);
    assert.ok(layout.indexOf(`guardAnyPage(['${key}']`) < layout.indexOf(`areaNotAtMyBranch('${area}')`), `${area}: permission first, then the branch`);
    assert.match(layout, new RegExp(`<AreaNotHere area="${area}"`));
  }
  // The plant manager holds warranty.view at their branch; the plant has no Warranty desk.
  const pm = who(['plant-manager']);
  assert.equal(decide(pm, 'warranty.view').allowed, true);
  assert.equal(moduleInView(pm, 'warranty', ['warranty.view'], { ownBranchType: 'ASSEMBLY_PLANT' }), false);
  assert.equal(moduleInView(pm, 'warranty', ['warranty.view'], { ownBranchType: 'WORKSHOP' }), true);
  // Leadership is never turned away, whatever branch their account is placed at.
  for (const role of ['executive', 'administrator']) for (const area of ['workshop', 'inventory', 'warranty']) assert.equal(moduleInView(who([role]), area, [({ workshop: 'workshop.view', inventory: 'store.view', warranty: 'warranty.view' } as const)[area as 'workshop']], { ownBranchType: 'ASSEMBLY_PLANT' }), true, `${role} ${area}`);
  // The notice shows no records and names no person.
  const notice = read('components/AreaNotHere.tsx');
  assert.doesNotMatch(notice, /prisma|lib\/actions/);
});
