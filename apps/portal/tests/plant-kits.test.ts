/**
 * D2 kit arrival and QC: the checklists, the packing-list lines, what must be
 * done before a kit is sent for release, the release verdict (never with a
 * line-stopping issue open; open shortages need a concession), and the wiring
 * that enforces them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_TEMPLATES, KIT_EDITABLE, KIT_OPEN, kitBlockers, kitTemplateFor, kitWarnings, parseKitLines, releaseVerdict, type KitCheckState, type KitIssueState } from '../lib/plant/kits';
import { PLANT_MODELS } from '../lib/plant/pdi';
import { APPROVAL_PERMISSIONS, PERMISSIONS, ROLE_GRANTS, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../lib/authz/catalogue';
import { approvalArea } from '../lib/approvals';
import { REFERENCE_TYPES } from '../lib/search-plan';

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');
const check = (code: string, result: KitCheckState['result'], extra: Partial<KitCheckState> = {}): KitCheckState => ({ code, label: code, section: 'S', allowNa: false, result, note: null, ...extra });
const issue = (extra: Partial<KitIssueState> = {}): KitIssueState => ({ kind: 'SHORTAGE', status: 'OPEN', stopsLine: false, description: 'Mirror bracket', partNumber: '8-97123-456-0', quantity: 1, ...extra });

test('an arrival checklist for every plant model, with unique codes and the checks a receiving bay makes', () => {
  for (const m of PLANT_MODELS) assert.ok(kitTemplateFor(m.code), m.code);
  assert.equal(kitTemplateFor('nqr')!.key, 'isuzu-n');
  assert.equal(kitTemplateFor('S07')!.key, 'soueast-s07');
  assert.equal(kitTemplateFor('D-MAX'), null);
  for (const t of Object.values(KIT_TEMPLATES)) {
    const codes = t.items.map((i) => i.code);
    assert.equal(new Set(codes).size, codes.length, `${t.key}: codes are unique (a kit keeps them)`);
    assert.ok(t.items.length >= 20, `${t.key}: ${t.items.length} checks`);
    for (const s of ['Cases and seals', 'Identity', 'Major units']) assert.ok(t.items.some((i) => i.section === s), `${t.key}: ${s}`);
    assert.ok(t.items.some((i) => /Case count matches the packing list/.test(i.label)));
    assert.ok(t.items.some((i) => /Engine number matches the packing list/.test(i.label)));
    // Only the container seal may be N/A (a kit that came loose, not in a container).
    assert.deepEqual(t.items.filter((i) => i.allowNa).map((i) => i.code), ['CS01']);
  }
  assert.ok(KIT_TEMPLATES['isuzu-n'].items.some((i) => /Frame rails/.test(i.label)), 'trucks: the frame');
  assert.ok(KIT_TEMPLATES['soueast-s07'].items.some((i) => /Paint free of chips/.test(i.label)), 'the SUV: its painted body');
});

test('packing-list lines: VIN, engine, model, lot, cases — commas, semicolons or Excel tabs; a header skipped; every bad line said', () => {
  const ok = parseKitLines('VIN\tEngine\tModel\tLot\tCases\nJAANLR85EL7100101\t4HK1-123456\tNQR\tLOT-01\t14\njaan lr85el7100102; 4hk1-123457; npr; lot-02; 12\nLVVDB21B8RD000101, SQRE4T15C-9, S07, , 3');
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.kits.map((k) => [k.line, k.vin, k.engineNumber, k.modelCode, k.lotNumber, k.kitType, k.casesExpected]), [
    [2, 'JAANLR85EL7100101', '4HK1-123456', 'NQR', 'LOT-01', 'CKD', 14],
    [3, 'JAANLR85EL7100102', '4HK1-123457', 'NPR', 'LOT-02', 'CKD', 12],
    [4, 'LVVDB21B8RD000101', 'SQRE4T15C-9', 'S07', null, 'SKD', 3],
  ]);
  const withDefault = parseKitLines('JAANLR85EL7100103,4HK1-1', { modelCode: 'QMR', kitType: 'SKD' });
  assert.equal(withDefault.kits[0]!.modelCode, 'QMR');
  assert.equal(withDefault.kits[0]!.kitType, 'SKD');
  const bad = parseKitLines('BRAKE PAD,x,NQR\nJAANLR85EL7100104,,D-MAX\nJAANLR85EL7100105,,NQR,,900\nJAANLR85EL7100106,,NQR\nJAANLR85EL7100106,,NPR');
  assert.deepEqual(bad.kits.map((k) => k.vin), ['JAANLR85EL7100106']);
  assert.match(bad.problems[0]!, /^Line 1: “BRAKE PAD” is not a VIN/);
  assert.match(bad.problems[1]!, /^Line 2: choose the model/);
  assert.match(bad.problems[2]!, /^Line 3: 900 cases/);
  assert.match(bad.problems[3]!, /^Line 5: JAANLR85EL7100106 is already on line 4/);
  assert.deepEqual(parseKitLines('').kits, []);
  const many = parseKitLines(Array.from({ length: 205 }, (_, i) => `JAANLR85EL71${String(10000 + i)},,NQR`).join('\n'));
  assert.equal(many.kits.length, 200);
  assert.match(many.problems.at(-1)!, /at most 200 kits/);
});

test('before release: every check done, N/A only where allowed, Not OK says what, the cases counted and consistent', () => {
  assert.deepEqual(kitBlockers([check('A', 'OK'), check('B', 'OK')], 10, 10), []);
  const b = kitBlockers([check('A', null), check('B', 'NA'), check('C', 'NOT_OK'), check('Case count matches the packing list', 'OK')], 14, null);
  assert.equal(b.length, 4);
  assert.match(b[0]!, /1 check is not done yet/);
  assert.match(b[1]!, /N\/A is not allowed for: B/);
  assert.match(b[2]!, /Say what is wrong for: C/);
  assert.match(b[3]!, /how many cases arrived/);
  assert.deepEqual(kitBlockers([check('Case count matches the packing list', 'OK')], 14, 12), ['12 of 14 cases arrived, but “Case count matches the packing list” is marked OK.']);
  assert.deepEqual(kitBlockers([check('Case count matches the packing list', 'NOT_OK', { note: 'two missing' })], 14, 12), []);
  assert.deepEqual(kitWarnings([check('A', 'NOT_OK', { note: 'dent' })], [], 14, 12), ['2 of 14 cases did not arrive.', '1 check is Not OK, but no shortage or damage was raised.']);
  assert.deepEqual(kitWarnings([], [], 14, 15), ['1 more cases arrived than the packing list shows.']);
});

test('the release: never with a line-stopping issue open; open shortages only with a concession note; resolved issues do not count', () => {
  assert.deepEqual(releaseVerdict([], null), { ok: true, withShortages: false });
  assert.deepEqual(releaseVerdict([issue({ status: 'RESOLVED', stopsLine: true })], null), { ok: true, withShortages: false });
  const stop = releaseVerdict([issue({ stopsLine: true }), issue()], 'go anyway');
  assert.equal(stop.ok, false);
  if (!stop.ok) assert.match(stop.why, /An issue that stops the line is still open \(8-97123-456-0\)/);
  const claimedStop = releaseVerdict([issue({ stopsLine: true, status: 'CLAIMED' })], 'claimed');
  assert.equal(claimedStop.ok, false, 'claimed is not put right');
  const needNote = releaseVerdict([issue()], '  ');
  assert.equal(needNote.ok, false);
  if (!needNote.ok) assert.match(needNote.why, /Say why the kit can go to the line anyway \(a concession\)/);
  assert.deepEqual(releaseVerdict([issue(), issue({ status: 'CLAIMED' })], 'Mirror brackets fitted at the trim station when the claim arrives'), { ok: true, withShortages: true });
});

test('statuses: editable while arriving, being checked or on hold; open until decided', () => {
  assert.deepEqual(KIT_EDITABLE, ['ARRIVED', 'INSPECTING', 'ON_HOLD']);
  assert.deepEqual(KIT_OPEN, ['ARRIVED', 'INSPECTING', 'SUBMITTED', 'ON_HOLD']);
});

test('roles and permissions: inspectors receive; the quality supervisor and plant manager release (an approval); KIT and SHP numbers open their pages', () => {
  assert.ok(PERMISSIONS['plant.kit.receive'] && PERMISSIONS['plant.kit.release']);
  assert.ok(APPROVAL_PERMISSIONS.includes('plant.kit.release'));
  assert.ok(ROLE_GRANTS['kit-inspector']!['plant.kit.receive'] && !ROLE_GRANTS['kit-inspector']!['plant.kit.release']);
  assert.ok(ROLE_GRANTS['quality-supervisor']!['plant.kit.release'] && ROLE_GRANTS['quality-supervisor']!['plant.kit.receive']);
  assert.ok(ROLE_GRANTS['plant-manager']!['plant.kit.release']);
  assert.ok(!ROLE_GRANTS['pdi-inspector']!['plant.kit.release'], 'the PDI bay does not release kits');
  for (const r of ['kit-inspector', 'quality-supervisor']) { assert.ok(ROLE_LABELS[r]); assert.ok(ROLE_DESCRIPTIONS[r]); }
  assert.equal(ROLE_LABELS['kit-inspector'], 'Kit Inspector', 'the seed names roles by slugifying their name');
  assert.equal(approvalArea({ id: 'kit-release-abc', title: 'Release kit KIT-2026-000001' }), 'Plant');
  assert.equal(REFERENCE_TYPES.find((t) => t.prefix === 'KIT')!.path('x'), '/plant/kits/x');
  assert.equal(REFERENCE_TYPES.find((t) => t.prefix === 'SHP')!.path('x'), '/plant/shipments/x');
  assert.match(read('../../packages/database/prisma/seed.ts'), /'Quality Supervisor', 'Kit Inspector'\]/);
  assert.match(read('../../scripts/postdeploy/0010-plant-kit-roles.sql'), /\('Kit Inspector', 'kit-inspector'/);
});

test('wired in: second person, compare-and-set, refused during assisted sessions, the vehicle created on release, PDI waits for the kit', () => {
  const a = read('lib/actions/plant-kits.ts');
  const body = (name: string) => { const i = a.indexOf(`export async function ${name}(`); return a.slice(i, a.indexOf('\nexport async function', i + 10)); };
  for (const fn of ['releaseKit', 'holdKit', 'rejectKit']) {
    assert.match(body(fn), /refuseDuringAssist\(/, `${fn}: refused during assisted sessions`);
    assert.match(body(fn), /authorize\('plant\.kit\.release'/, `${fn}: release permission`);
    assert.match(body(fn), /if \(checkedBy\(k, me\.userId\)\) return fail/, `${fn}: never one they checked`);
    assert.match(body(fn), /updateMany\(\{ where: \{ id: k\.id, status:/, `${fn}: compare and set`);
  }
  assert.match(body('releaseKit'), /const verdict = releaseVerdict\(/);
  assert.match(body('releaseKit'), /tx\.plantVehicle\.create\(\{[\s\S]*stage: 'LINE'/);
  assert.match(body('releaseKit'), /stage: 'KIT' \}, data: \{ stage: 'LINE' \}/, 'a vehicle already in the plant moves on only from KIT');
  assert.match(body('setKitCheck'), /kit: \{ status: \{ in: KIT_EDITABLE \} \}/);
  assert.match(body('createShipment'), /vinConflicts\(/);
  assert.match(body('createShipment'), /Nothing was saved\./, 'all or nothing');
  assert.match(body('cancelKit'), /status: \{ in: \['ARRIVED', 'INSPECTING'\] \}/, 'never one already decided');
  assert.doesNotMatch(a, /\.delete\(|\.deleteMany\(/, 'nothing is deleted');
  const pdi = read('lib/actions/plant.ts');
  assert.match(pdi, /This VIN’s kit \$\{kit\.number\} has not been released to the line yet/);
  // Every read of a kit or shipment goes through the fences.
  for (const m of a.matchAll(/prisma\.plant(Kit|Shipment)\.find(First|Many)\(\{ where: \{([^}]*)/g)) assert.match(m[3]!, /organisationId|shipmentId|id: \{ in|vinKey|\.\.\.where|\.\.\.base/, m[0]);
});

test('docs/demo packing list: correct/ gives 12 kits and no problem; with-mistakes/ gives exactly the planted problems, in EJO’s words', () => {
  const demo = (dir: string) => readFileSync(join(__dirname, '..', '..', '..', '..', 'docs', 'demo', dir, '09_kit_packing_list_demo.csv'), 'utf8');
  const good = parseKitLines(demo('correct'));
  assert.deepEqual(good.problems, []);
  assert.equal(good.kits.length, 12);
  assert.deepEqual([...new Set(good.kits.map((k) => `${k.modelCode} ${k.kitType}`))], ['NQR CKD', 'NPR CKD', 'QMR CKD', 'QLR CKD', 'S07 SKD']);
  const planted = (JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', 'docs', 'demo', 'with-mistakes', 'mistakes.json'), 'utf8')) as { file: string; says: string }[]).filter((p) => p.file === '09_kit_packing_list_demo.csv');
  assert.equal(planted.length, 4);
  const bad = parseKitLines(demo('with-mistakes'));
  assert.deepEqual(bad.problems, planted.map((p) => p.says));
  assert.deepEqual(bad.kits.map((k) => k.vin), good.kits.map((k) => k.vin), 'the good lines still read the same');
});
