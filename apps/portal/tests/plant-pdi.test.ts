/**
 * D1 PDI: the checklists for the plant's models, and the rules — what must be
 * done before a PDI is sent on, rework, the second-person approval (the SAP
 * usage decision) and the wiring that enforces them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDI_TEMPLATES, PLANT_MODELS, afterSubmit, modelByCode, openDefects, parseFaultCodes, pdiBlockers, pdiWarnings, templateFor, type PdiItemState, type PdiReadings } from '../lib/plant/pdi';
import { APPROVAL_PERMISSIONS, PERMISSIONS, ROLE_GRANTS } from '../lib/authz/catalogue';
import { approvalArea } from '../lib/approvals';

const read = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

test('a checklist for every plant model: Isuzu NQR, NPR, QLR, QMR and the Soueast S07', () => {
  assert.deepEqual(PLANT_MODELS.map((m) => m.code), ['NQR', 'NPR', 'QLR', 'QMR', 'S07']);
  for (const m of PLANT_MODELS) assert.ok(templateFor(m.code), m.code);
  assert.equal(templateFor('nqr')!.key, 'isuzu-n');
  assert.equal(templateFor('S07')!.key, 'soueast-s07');
  assert.equal(templateFor('D-MAX'), null);
  assert.equal(modelByCode('qmr')!.make, 'Isuzu');
  for (const t of Object.values(PDI_TEMPLATES)) {
    const codes = t.items.map((i) => i.code);
    assert.equal(new Set(codes).size, codes.length, `${t.key}: item codes are unique (a PDI keeps them)`);
    assert.ok(t.items.length >= 40, `${t.key}: a full checklist (${t.items.length} items)`);
    for (const section of ['Identity and documents', 'Engine and fluids', 'Road test', 'Handover readiness']) assert.ok(t.items.some((i) => i.section === section), `${t.key}: ${section}`);
    assert.ok(t.items.some((i) => /VIN/.test(i.label)), `${t.key}: the VIN is checked against the label`);
  }
  // Truck-only and SUV-only checks land in the right checklist.
  assert.ok(PDI_TEMPLATES['isuzu-n'].items.some((i) => /Cab tilt/.test(i.label)));
  assert.ok(PDI_TEMPLATES['soueast-s07'].items.some((i) => /Reversing camera/.test(i.label)));
  assert.ok(!PDI_TEMPLATES['soueast-s07'].items.some((i) => /Cab tilt/.test(i.label)));
});

const item = (code: string, result: PdiItemState['result'], extra: Partial<PdiItemState> = {}): PdiItemState => ({ code, label: `Item ${code}`, section: 'S', allowNa: false, result, defect: null, reworkedAt: null, ...extra });
const done: PdiReadings = { odometerKm: 12, batteryVolts: 12.6, tyreFrontPsi: 85, tyreRearPsi: 85, faultScanDone: true, faultCodes: [], faultCodesCleared: false };

test('before a PDI is sent on: every item, the scan and its codes, the readings', () => {
  assert.deepEqual(pdiBlockers([item('A', 'OK'), item('B', 'OK')], done), []);
  assert.match(pdiBlockers([item('A', 'OK'), item('B', null)], done)[0]!, /1 item is not checked/);
  assert.match(pdiBlockers([item('A', 'NA')], done)[0]!, /N\/A is not allowed for: Item A/);
  assert.deepEqual(pdiBlockers([item('A', 'NA', { allowNa: true })], done), []);
  assert.match(pdiBlockers([item('A', 'NOT_OK')], done)[0]!, /Say what is wrong for: Item A/);
  assert.deepEqual(pdiBlockers([item('A', 'NOT_OK', { defect: 'Scratch on the door' })], done), [], 'a Not OK with its defect may be sent (to rework)');
  assert.match(pdiBlockers([item('A', 'OK')], { ...done, faultScanDone: false }).join(' '), /diagnostic scan/);
  assert.match(pdiBlockers([item('A', 'OK')], { ...done, faultCodes: ['P0401'] }).join(' '), /clear them/);
  assert.deepEqual(pdiBlockers([item('A', 'OK')], { ...done, faultCodes: ['P0401'], faultCodesCleared: true }), []);
  assert.match(pdiBlockers([item('A', 'OK')], { ...done, odometerKm: null, tyreRearPsi: null }).join(' '), /odometer[\s\S]*tyre pressures/);
});

test('rework and the way on; readings worth a second look; fault codes as typed', () => {
  assert.equal(afterSubmit([item('A', 'OK'), item('B', 'NOT_OK', { defect: 'x' })]), 'REWORK');
  assert.equal(afterSubmit([item('A', 'OK'), item('B', 'OK', { reworkedAt: new Date() })]), 'SUBMITTED');
  assert.equal(openDefects([item('A', 'NOT_OK'), item('B', 'OK')]).length, 1);
  assert.deepEqual(pdiWarnings(done, 'isuzu-n'), []);
  assert.match(pdiWarnings({ ...done, odometerKm: 120 }, 'isuzu-n').join(' '), /120 km/);
  assert.match(pdiWarnings({ ...done, batteryVolts: 11.9 }, 'isuzu-n').join(' '), /11.9 V/);
  assert.match(pdiWarnings({ ...done, tyreFrontPsi: 85 }, 'soueast-s07').join(' '), /Front tyre pressure 85 psi is outside 30–42/);
  assert.match(pdiWarnings({ ...done, faultCodes: ['P0401'], faultCodesCleared: true }, 'isuzu-n').join(' '), /P0401/);
  assert.deepEqual(parseFaultCodes('p0420, u0100  P0171;p0420 hello 12345'), ['P0420', 'U0100', 'P0171', '12345']);
  assert.deepEqual(parseFaultCodes(''), []);
});

test('permissions and roles: inspectors inspect, supervisors approve, never their own; Approvals lists PDIs', () => {
  for (const k of ['plant.view', 'plant.vehicle.register', 'plant.pdi.perform', 'plant.pdi.approve'] as const) assert.ok(PERMISSIONS[k], k);
  assert.ok(ROLE_GRANTS['pdi-inspector']!['plant.pdi.perform']);
  assert.ok(!ROLE_GRANTS['pdi-inspector']!['plant.pdi.approve'], 'an inspector never approves');
  assert.ok(ROLE_GRANTS['pdi-supervisor']!['plant.pdi.approve']);
  assert.ok(ROLE_GRANTS['plant-manager']!['plant.pdi.approve']);
  assert.ok(!ROLE_GRANTS['technician']?.['plant.view'], 'the workshop floor is not the plant');
  assert.ok(APPROVAL_PERMISSIONS.includes('plant.pdi.approve'));
  assert.equal(approvalArea({ id: 'pdi-approve-x', title: 'Approve PDI PDI-2026-000001' }), 'Plant');
  const actions = read('lib/actions/plant.ts');
  // The approver is never the inspector nor anyone who checked an item; approving refuses during assisted sessions.
  assert.match(actions, /export async function approvePdi[\s\S]{0,200}refuseDuringAssist\('approvePdi'\)/);
  assert.match(actions, /export async function approvePdi[\s\S]{0,900}p\.inspectorId === me\.userId \|\| p\.items\.some\(\(i\) => i\.checkedById === me\.userId\)/);
  assert.match(actions, /sapUsageDecision: 'A'/);
  assert.match(actions, /sapUsageDecision: 'R'/);
  // Two tablets never overwrite each other: every change compares the PDI's status.
  assert.match(actions, /pdiItem\.updateMany\(\{ where: \{ inspectionId: p\.id, code: item\.code, inspection: \{ status: \{ in: EDITABLE \} \} \}/);
  assert.match(actions, /updateMany\(\{ where: \{ id: p\.id, status: 'SUBMITTED' \}/);
  // Roles exist for every organisation, and in a fresh seed.
  assert.match(read('../../scripts/postdeploy/0009-plant-roles.sql'), /'pdi-inspector'[\s\S]*ON CONFLICT \("organisationId", "slug"\) DO NOTHING/);
  assert.match(read('../../packages/database/prisma/seed.ts'), /'Plant Manager', 'PDI Supervisor', 'PDI Inspector'/);
  // The vehicle's page and its PDI certificate use the PDI recorded on screen.
  assert.match(read('lib/actions/vehicle-passport.ts'), /stage: 'PDI checklist'/);
  assert.match(read('app/print/pdi-certificate/[vin]/page.tsx'), /p\.pdi\.status === 'PASSED' \? 'passed'/);
});
