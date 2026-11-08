/**
 * The plant's records at the cut-over (P8): the pure row checks (shipments,
 * vehicles, kits, kit issues), the stage and status words, the moments in
 * Lagos time, and how the import is wired: approved by whoever releases kits
 * (the Plant Manager), loaded into an assembly plant, numbers that skip the
 * bin, vehicles on the plant's route, checks done before EJO, undo only for
 * what nobody has used and nothing hangs on — each restorable whole.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, ENTITIES, mappingProblems } from '../lib/data-exchange/fields';
import { checkPlantKitIssueRow, checkPlantKitRow, checkPlantShipmentRow, checkPlantVehicleRow, kitStatus, momentDate, parseMoment, plantStage } from '../lib/data-exchange/check-plant';
import { BIN_KIND, binHref, plantRecordEligibility, SNAPSHOT_ORDER } from '../lib/recycle-bin/rules';
import { DATA_INVENTORY } from '../lib/governance/data-inventory';
import { ROLE_GRANTS } from '../lib/authz/catalogue';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const TODAY = '2026-11-02';
const rowOf = (h: string[]) => (o: Record<string, string>) => h.map((x) => o[x] ?? '');
const errors = (c: { issues: { level: string; message: string }[] }) => c.issues.filter((i) => i.level === 'error').map((i) => i.message);
const notes = (c: { issues: { level: string; message: string }[] }) => c.issues.filter((i) => i.level !== 'error').map((i) => i.message);

test('moments: the registers’ dates and times, read as Lagos time (UTC+1)', () => {
  assert.deepEqual(parseMoment('2026-09-15 08:30'), { day: '2026-09-15', time: '08:30' });
  assert.deepEqual(parseMoment('15.09.2026 8.05'), { day: '2026-09-15', time: '08:05' });
  assert.deepEqual(parseMoment('15/09/2026'), { day: '2026-09-15', time: '09:00' });
  assert.equal(parseMoment('2026-09-15 25:00'), null);
  assert.equal(parseMoment('soon'), null);
  assert.equal(momentDate({ day: '2026-09-15', time: '08:30' }).toISOString(), '2026-09-15T07:30:00.000Z');
});

test('stages and statuses: EJO’s codes and the plant’s words; a kit stage, a sold vehicle and a cancelled kit told apart', () => {
  for (const [w, s] of [['LINE', 'LINE'], ['On the line', 'LINE'], ['QA', 'QA'], ['Quality audit', 'QA'], ['PDI', 'PDI'], ['Waiting for PDI', 'PDI'], ['YARD', 'YARD'], ['PDI passed', 'YARD'], ['Kit', 'KIT'], ['Sold', 'SOLD'], ['Delivered', 'SOLD'], ['Scrapped', null]] as const) assert.equal(plantStage(w), s, w);
  for (const [w, s] of [['', 'ARRIVED'], ['Received', 'ARRIVED'], ['Inspecting', 'INSPECTING'], ['Submitted', 'SUBMITTED'], ['Waiting for release', 'SUBMITTED'], ['ON_HOLD', 'ON_HOLD'], ['Quarantine', 'ON_HOLD'], ['RELEASED', 'RELEASED'], ['Rejected', 'REJECTED'], ['Cancelled', 'CANCELLED'], ['Lost', null]] as const) assert.equal(kitStatus(w), s, w);
});

test('shipments: reference, supplier and arrival required; containers tidied; never in the future', () => {
  const H = ['Shipment ref', 'Supplier', 'Bill of lading', 'Containers', 'Arrived', 'EBELN', 'Branch'];
  const m = autoMap('plantShipments', H);
  assert.deepEqual(mappingProblems('plantShipments', m), []);
  const row = rowOf(H);
  const ok = checkPlantShipmentRow(row({ 'Shipment ref': 'shp1', Supplier: 'Isuzu Motors Ltd', 'Bill of lading': 'maeu 6203', Containers: 'MSKU-410000; msku410111, MSKU410000', Arrived: '15.09.2026 08:30', EBELN: '4500018200' }), m, TODAY);
  assert.equal(ok.status, 'GOOD', JSON.stringify(ok.issues));
  assert.deepEqual(ok.keys, ['shp:SHP1', 'bl:MAEU6203']);
  assert.deepEqual(ok.values?.containers, ['MSKU410000', 'MSKU410111']);
  assert.deepEqual(errors(checkPlantShipmentRow(row({ Supplier: 'X', Arrived: '2026-09-15' }), m, TODAY)), ['The shipment reference is required (the kits file names the shipment by it).']);
  assert.deepEqual(errors(checkPlantShipmentRow(row({ 'Shipment ref': 'S', Arrived: '2026-09-15' }), m, TODAY)), ['Say who shipped the kits (the supplier).']);
  assert.deepEqual(errors(checkPlantShipmentRow(row({ 'Shipment ref': 'S', Supplier: 'X' }), m, TODAY)), ['Arrived is required.']);
  assert.deepEqual(errors(checkPlantShipmentRow(row({ 'Shipment ref': 'S', Supplier: 'X', Arrived: '2027-01-15' }), m, TODAY)), ['Arrived 2027-01-15 is in the future.']);
});

test('plant vehicles: a VIN, a model the plant builds, a stage on the plant’s side; past the line the gate day is required', () => {
  const H = ['VIN', 'Model', 'Stage', 'Current station', 'Line started', 'Gate passed', 'Model year', 'WERKS'];
  const m = autoMap('plantVehicles', H);
  assert.deepEqual(mappingProblems('plantVehicles', m), []);
  const row = rowOf(H);
  const line = checkPlantVehicleRow(row({ VIN: 'jaanlr85el7230001', Model: 'nqr', Stage: 'On the line', 'Current station': 'w1', 'Line started': '2026-10-30 07:30' }), m, TODAY);
  assert.equal(line.status, 'GOOD', JSON.stringify(line.issues));
  assert.equal(line.values?.make, 'Isuzu');
  assert.equal(line.values?.currentStation, 'W1');
  assert.deepEqual(line.keys, ['vin:JAANLR85EL7230001']);
  assert.match(errors(checkPlantVehicleRow(row({ VIN: 'JAANLR85EL7230001', Model: 'NQR', Stage: 'Sold' }), m, TODAY))[0]!, /A sold vehicle is the customer’s/);
  assert.match(errors(checkPlantVehicleRow(row({ VIN: 'JAANLR85EL7230001', Model: 'NQR', Stage: 'KIT' }), m, TODAY))[0]!, /is in the kits file/);
  assert.deepEqual(errors(checkPlantVehicleRow(row({ VIN: 'JAANLR85EL7230001', Model: 'NQR', Stage: 'PDI' }), m, TODAY)), ['Past the line, the day it passed the final quality gate is required (Gate passed).']);
  assert.deepEqual(errors(checkPlantVehicleRow(row({ VIN: 'JAANLR85EL7230001', Model: 'NQR', Stage: 'YARD', 'Line started': '2026-10-02 07:30', 'Gate passed': '2026-10-01 16:00' }), m, TODAY)), ['The gate is passed after the line started, not before.']);
  assert.deepEqual(errors(checkPlantVehicleRow(row({ VIN: 'JAANLR85EL7230001', Model: 'D-MAX', Stage: 'LINE' }), m, TODAY)), ['“D-MAX” is not a model the plant builds: NQR, NPR, QLR, QMR or S07.']);
  assert.match(errors(checkPlantVehicleRow(row({ VIN: 'BRAKE PAD', Model: 'NQR', Stage: 'LINE' }), m, TODAY))[0]!, /does not look like a chassis number/);
  // On the line a gate day is a note (left out), never a refusal.
  const early = checkPlantVehicleRow(row({ VIN: 'JAANLR85EL7230001', Model: 'NQR', Stage: 'LINE', 'Gate passed': '2026-10-30 16:00' }), m, TODAY);
  assert.equal(early.status, 'WARNING');
  assert.equal(early.values?.gatePassedAt, null);
});

test('kits: on a shipment, a VIN and a model; the model’s usual kit type; a cancelled kit refused; notes for a decision without its date or reason', () => {
  const H = ['Shipment ref', 'VIN', 'Model', 'Kit type', 'Cases expected', 'Status', 'Decided', 'Decision note', 'Released with shortages'];
  const m = autoMap('plantKits', H);
  assert.deepEqual(mappingProblems('plantKits', m), []);
  const row = rowOf(H);
  const s07 = checkPlantKitRow(row({ 'Shipment ref': 'shp2', VIN: 'LVVDB21B8RD010100', Model: 'S07', 'Cases expected': '3', Status: 'Released', Decided: '2026-10-01 11:00', 'Released with shortages': 'Yes' }), m, TODAY);
  assert.equal(s07.status, 'GOOD', JSON.stringify(s07.issues));
  assert.equal(s07.values?.kitType, 'SKD');
  assert.equal(s07.values?.shipmentRef, 'SHP2');
  assert.equal(s07.values?.sapUsageDecision, 'A');
  assert.equal(s07.values?.releasedWithShortages, true);
  assert.deepEqual(errors(checkPlantKitRow(row({ 'Shipment ref': 'S', VIN: 'LVVDB21B8RD010100', Model: 'S07', Status: 'Cancelled' }), m, TODAY)), ['A cancelled kit never came: leave it out.']);
  assert.deepEqual(errors(checkPlantKitRow(row({ VIN: 'LVVDB21B8RD010100', Model: 'S07' }), m, TODAY)), ['Which shipment did it come on? Give its reference or its SHP number.']);
  const held = checkPlantKitRow(row({ 'Shipment ref': 'S', VIN: 'JAANLR85EL7230004', Model: 'NQR', Status: 'On hold', 'Cases expected': 'fourteen' }), m, TODAY);
  assert.equal(held.status, 'WARNING');
  assert.deepEqual(notes(held), ['Cases expected “fourteen” is not a number of cases; left out.', 'No decision date: the submission (or the shipment’s arrival) is used.', 'On hold with no reason given: the note reads “Decided before EJO.”']);
});

test('kit issues: on a kit by its VIN; a kind EJO knows and what is wrong; claimed and resolved as they stood', () => {
  const H = ['Kit VIN', 'Kind', 'Description', 'Quantity', 'Stops the line', 'Status', 'Claim reference', 'Resolution'];
  const m = autoMap('plantKitIssues', H);
  assert.deepEqual(mappingProblems('plantKitIssues', m), []);
  const row = rowOf(H);
  const ok = checkPlantKitIssueRow(row({ 'Kit VIN': 'JAANLR85EL7230004', Kind: 'Missing', Description: 'Door glass regulator, right', Quantity: '2', 'Stops the line': 'Yes', Status: 'Claimed', 'Claim reference': 'Q2-300124' }), m, TODAY);
  assert.equal(ok.status, 'GOOD', JSON.stringify(ok.issues));
  assert.deepEqual([ok.values?.kind, ok.values?.quantity, ok.values?.stopsLine, ok.values?.status], ['SHORTAGE', 2, true, 'CLAIMED']);
  assert.deepEqual(errors(checkPlantKitIssueRow(row({ 'Kit VIN': 'JAANLR85EL7230004', Kind: 'Lost', Description: 'x' }), m, TODAY)), ['“Lost” is not a kind EJO knows: Shortage, Damage, Wrong part or Excess.']);
  assert.deepEqual(errors(checkPlantKitIssueRow(row({ 'Kit VIN': 'JAANLR85EL7230004', Kind: 'Damage' }), m, TODAY)), ['Say what is wrong (the description is required).']);
  assert.deepEqual(notes(checkPlantKitIssueRow(row({ 'Kit VIN': 'JAANLR85EL7230004', Kind: 'Damage', Description: 'Bonnet dented', Status: 'Resolved' }), m, TODAY)), ['Resolved with no resolution written: it reads “Resolved before EJO.”']);
});

test('wired in: approved by whoever releases kits, into an assembly plant; numbers skip the bin; route, checks and links as before EJO; nobody emailed', () => {
  for (const e of ['plantShipments', 'plantVehicles', 'plantKits', 'plantKitIssues'] as const) {
    assert.equal(ENTITIES[e].needs, 'plant.kit.release', e);
    assert.equal(ENTITIES[e].branchArea, 'plant', e);
  }
  assert.equal(ROLE_GRANTS['plant-manager']?.['dataexchange.import.approve'], 'BRANCH', 'the Plant Manager approves the plant’s imports');
  const server = read('lib/data-exchange/plant-server.ts');
  assert.doesNotMatch(server, /sendEmail|notify|writeAuditLog/, 'loading emails nobody and writes no history on the records');
  assert.match(server, /entityType: word === 'SHP' \? 'PlantShipment' : 'PlantKit', reference: \{ startsWith: prefix \}/, 'SHP and KIT numbers skip the ones held in the bin');
  assert.match(read('lib/actions/plant-kits.ts'), /entityType: prefixWord === 'SHP' \? 'PlantShipment' : 'PlantKit'/, 'the desk skips them too');
  assert.match(server, /DEFAULT_ROUTES\[f\]\.stations/, 'the plant’s live route, or the default');
  assert.match(server, /status: done \? 'PASSED' : isCurrent \? 'IN_PROGRESS' : 'PENDING'/);
  assert.match(server, /result: decided \? 'OK' : null, note: decided \? 'Checked before EJO\.' : null/, 'checks done before EJO, by nobody in EJO');
  assert.doesNotMatch(server, /checkedById: (actor|res\.|job\.)/, 'nobody in EJO answered the checks');
  const dx = read('lib/actions/data-exchange.ts');
  for (const f of ['checkPlantShipmentRows', 'checkPlantVehicleRows', 'checkPlantKitRows', 'checkPlantKitIssueRows', 'loadPlantShipmentRows', 'loadPlantVehicleRows', 'loadPlantKitRows', 'loadPlantKitIssueRows', 'plantUntouchedSinceImport', 'moveImportedPlantToBinInTx']) assert.match(dx, new RegExp(`${f}\\(`), f);
});

test('the bin: only by an undone plant import; a vehicle with its stations, a kit with its checklist; nothing that hangs on another', () => {
  assert.deepEqual(SNAPSHOT_ORDER.PlantVehicle, ['plantVehicle', 'plantStationVisit']);
  assert.deepEqual(SNAPSHOT_ORDER.PlantKit, ['plantKit', 'plantKitCheck']);
  assert.deepEqual(SNAPSHOT_ORDER.PlantShipment, ['plantShipment']);
  assert.deepEqual(SNAPSHOT_ORDER.PlantKitIssue, ['plantKitIssue']);
  for (const e of ['PlantShipment', 'PlantVehicle', 'PlantKit', 'PlantKitIssue'] as const) {
    assert.equal(plantRecordEligibility(e).eligible, false, e);
    assert.equal(DATA_INVENTORY[e]?.recycleBin, 'IMPORT_UNDO', e);
    assert.ok(BIN_KIND[e].noun && binHref(e, 'x').startsWith('/plant/'), e);
  }
  const bin = read('lib/recycle-bin/server.ts');
  const move = bin.slice(bin.indexOf('export async function moveImportedPlantToBinInTx'), bin.indexOf('const group ='));
  assert.match(move, /plantShipment\.count\(\{ where: \{ id, importJobId, kits: \{ none: \{\} \} \} \}\)/, 'a shipment with kits stays');
  assert.match(move, /plantKit\.count\(\{ where: \{ id, importJobId, issues: \{ none: \{\} \} \} \}\)/, 'a kit with issues stays');
  assert.match(move, /kits: \{ none: \{\} \}, pdis: \{ none: \{\} \}, defects: \{ none: \{\} \}, qaAudits: \{ none: \{\} \}/, 'a vehicle with a kit, a PDI, a defect or an audit stays');
  assert.match(bin, /Restore the shipment first, then this kit\./);
  assert.match(bin, /Restore the kit first, then this issue\./);
  const untouched = read('lib/data-exchange/plant-server.ts');
  assert.match(untouched, /auditLog\.count\(\{ where: \{ entityType, entityId \} \}\)/, 'any audited step on it is use');
  for (const f of ['scripts/predeploy/0022-plant-imports.sql', 'scripts/v-p8-plant-imports.sql']) {
    const sql = read(`../../${f}`);
    for (const t of ['plant_shipments', 'plant_vehicles', 'plant_kits', 'plant_kit_issues']) assert.match(sql, new RegExp(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "importJobId" TEXT`), `${f} ${t}`);
    assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE|UPDATE) /im, 'additive only');
  }
});
