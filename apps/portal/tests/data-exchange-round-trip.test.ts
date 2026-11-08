/**
 * The round trip (P10): an edited export comes back as updates. Found by the
 * EJO record only; only real changes count (a phone, a plate, a SAP number
 * written another way is the same value); an empty cell never blanks a
 * field; what identifies a record is never changed by a file; an odometer
 * never goes back; and the wiring — the mode only for the lists an export
 * writes, with the EJO record matched; a change applied only while still
 * true, audited with its from and to; undo puts back the from; the templates
 * never carry the EJO record.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, ENTITIES } from '../lib/data-exchange/fields';
import { checkCustomerRow, checkVehicleRow } from '../lib/data-exchange/check';
import { checkPartRow, checkSupplierRow } from '../lib/data-exchange/check-inventory';
import { changeWords, diffRecord, ejoRecordOf, isRoundTripEntity, ROUND_TRIP_ENTITIES, UPDATABLE } from '../lib/data-exchange/round-trip';
import { templateCsv } from '../lib/data-exchange/templates';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const ID = 'ckx1abcdefghijklmnop';

test('the EJO record: the export’s column is matched by its name and SAP’s; only an EJO number counts', () => {
  for (const e of ROUND_TRIP_ENTITIES) {
    assert.equal(autoMap(e, ['EJO record']).ejoRecord, 0, e);
    assert.equal(autoMap(e, ['ZZ_EJO_ID']).ejoRecord, 0, e);
    assert.ok(ENTITIES[e].fields.find((f) => f.key === 'ejoRecord')?.roundTrip, e);
  }
  const m = autoMap('customers', ['EJO record']);
  assert.equal(ejoRecordOf([ID], m), ID);
  assert.equal(ejoRecordOf(['not an id!'], m), null);
  assert.equal(ejoRecordOf([''], m), null);
  assert.equal(isRoundTripEntity('invoices'), false, 'Finance’s history is never changed by a file');
  assert.equal(isRoundTripEntity('stock'), false, 'stock moves only by receipts and issues');
});

test('customers: only real changes; a phone written another way, an email in capitals are the same; an empty cell leaves the field', () => {
  const H = ['Name', 'Phone', 'Second phone', 'Email', 'Address', 'Customer since', 'Customer number (SAP or old system)', 'EJO record'];
  const m = autoMap('customers', H);
  const cur = { fullName: 'Ada Okafor', phone: '08031234567', altPhone: '08099998888', email: 'ada@example.ng', address: '3 Old Road', customerSince: null, externalId: '1000101', externalSource: 'SAP' };
  const cells = ['Ada Okafor', "'+234 803 123 4567", '', 'ADA@example.ng', '12 New Road', '14.03.2019', '0001000101', ID];
  const v = checkCustomerRow(cells, m).values!;
  const d = diffRecord('customers', cur, v, cells, m);
  assert.deepEqual(d.errors, []);
  assert.deepEqual(d.changes.map(changeWords), ['Address: 3 Old Road → 12 New Road', 'Customer since: (empty) → 2019-03-14']);
});

test('vehicles: the chassis number is the vehicle (never changed by a file, though filled when empty); mileage never goes back; a plate with a space is the same', () => {
  const H = ['Plate', 'Chassis number (VIN)', 'Mileage (km)', 'Make', 'Category', 'EJO record'];
  const m = autoMap('vehicles', H);
  const cur = { plateNumber: 'KJA-123AB', chassisNumber: 'JAANLR85EL7100001', mileage: 50000, make: 'Isuzu', vehicleType: 'COMMERCIAL', engineNumber: null, engineType: null, model: null, year: null, externalId: null, externalSource: null };
  const row = (o: Partial<Record<string, string>>) => H.map((h) => o[h] ?? '');
  const same = row({ Plate: 'KJA 123AB', 'Chassis number (VIN)': 'JAANLR85EL7100001', 'Mileage (km)': '52,300', Make: 'ISUZU', Category: 'Commercial', 'EJO record': ID });
  const v = checkVehicleRow(same, m, 2026, true).values!;
  assert.ok(v, 'no owner needed: the EJO record names the vehicle');
  assert.deepEqual(diffRecord('vehicles', cur, v, same, m).changes.map(changeWords), ['Mileage (km): 50,000 → 52,300']);
  const vin = row({ 'Chassis number (VIN)': 'JAANLR85EL7100009', 'EJO record': ID });
  assert.match(diffRecord('vehicles', cur, checkVehicleRow(vin, m, 2026, true).values!, vin, m).errors[0]!, /The chassis number is the vehicle/);
  assert.deepEqual(diffRecord('vehicles', { ...cur, chassisNumber: null }, checkVehicleRow(vin, m, 2026, true).values!, vin, m).changes.map((c) => c.field), ['chassisNumber'], 'filled when EJO has none');
  const back = row({ Plate: 'KJA-123AB', 'Mileage (km)': '40000', 'EJO record': ID });
  const dd = diffRecord('vehicles', cur, checkVehicleRow(back, m, 2026, true).values!, back, m);
  assert.deepEqual(dd.changes, []);
  assert.match(dd.notes[0]!.message, /an odometer only goes up/);
});

test('parts: the part number, tracking and base unit are never changed by a file; prices and levels are', () => {
  const H = ['Part number', 'Description', 'Base unit', 'Tracking', 'Selling price', 'Reorder point', 'EJO record'];
  const m = autoMap('parts', H);
  const cur = { partNumber: '8-98100000-0', name: 'Brake pad set', baseUnitOfMeasure: 'Set', trackingType: 'QUANTITY', sellingPrice: 45000, reorderPoint: 10, safetyStock: null, category: null, barcode: null, externalId: null, externalSource: null };
  const cells = ['8-98100000-0', 'Brake pad set', 'Set', 'Quantity', '47,500', '10', ID];
  assert.deepEqual(diffRecord('parts', cur, checkPartRow(cells, m).values!, cells, m).changes.map(changeWords), ['Selling price (₦): 45,000 → 47,500']);
  const renamed = ['8-98100000-9', 'Brake pad set', 'Set', 'Batch', '45000', '10', ID];
  const d = diffRecord('parts', cur, checkPartRow(renamed, m).values!, renamed, m);
  assert.match(d.errors[0]!, /never changed by a file/);
  assert.match(d.notes[0]!.message, /How the part is tracked is changed on its page/);
});

test('suppliers: name, contact, phone, email, address, tax ID and number', () => {
  const H = ['Supplier number (SAP or old system)', 'Name', 'Contact person', 'Phone', 'EJO record'];
  const m = autoMap('suppliers', H);
  const cur = { name: 'Isuzu Motors Ltd', contactName: null, phone: null, email: null, address: null, taxId: null, externalId: 'V-77', externalSource: 'SAP' };
  const cells = ['V-77', 'Isuzu Motors Ltd', 'Sales desk', '0803 123 4567', ID];
  assert.deepEqual(diffRecord('suppliers', cur, checkSupplierRow(cells, m).values!, cells, m).changes.map((c) => c.field), ['contactName', 'phone']);
  assert.deepEqual(UPDATABLE.suppliers.map((s) => s.field), ['name', 'contactName', 'phone', 'email', 'address', 'taxId', 'externalId']);
});

test('wired in: the mode only for these lists with the EJO record matched; applied only while still true; audited; undone field by field; never in a template', () => {
  const dx = read('lib/actions/data-exchange.ts');
  assert.match(dx, /input\.matchMode === 'UPDATE' && isRoundTripEntity\(entity\) \? 'UPDATE'/);
  assert.match(dx, /Match the “EJO record” column: each row is found by it, and only by it\./);
  assert.match(dx, /job\.matchMode === 'UPDATE' \? \[\] : await undoBlockers/);
  const s = read('lib/data-exchange/round-trip-server.ts');
  assert.match(s, /was changed in EJO since the check: left as it is\./, 'a change applied only while the record still holds its "from"');
  assert.match(s, /lockRows\(tx, AUDIT\[entity\]\.lock, ids\)/, 'under a lock on the records');
  assert.match(s, /metadata: \{ via: 'import', import: job\.number, changes:/, 'one audit entry per record, with every from and to');
  assert.match(s, /changed in EJO since the import, so kept as it is now/);
  assert.doesNotMatch(s, /\.create\(\{ data: \{ (organisationId|id): [^}]*fullName/, 'nothing is added');
  assert.match(s, /organisationId: job\.organisationId \}/, 'fenced to the organisation');
  assert.match(s, /branchId: job\.branchId \}/, 'a part fenced to the branch');
  for (const e of ROUND_TRIP_ENTITIES) assert.doesNotMatch(templateCsv(e), /EJO record/, `${e}: the template never carries the EJO record`);
  for (const f of ['scripts/predeploy/0023-round-trip-changes.sql', 'scripts/v-p10-round-trip.sql']) {
    const sql = read(`../../${f}`);
    assert.match(sql, /ALTER TABLE "import_rows" ADD COLUMN IF NOT EXISTS "changes" JSONB/);
    assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE|UPDATE) /im, 'additive only');
  }
});
