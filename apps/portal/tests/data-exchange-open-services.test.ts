/**
 * Open services and bookings at the cut-over (P6b): the pure row check —
 * a booking needs its day (and reads its time), a service in the workshop
 * the day it came in; closed, collected and cancelled are history; a vehicle
 * is required — and how the import is wired (old numbers kept, the booking's
 * moment in Lagos time, nobody emailed, undo to the bin only untouched).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, ENTITIES, mappingProblems } from '../lib/data-exchange/fields';
import { checkOpenServiceRow, openServiceStage, parseTime } from '../lib/data-exchange/check-open-services';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const TODAY = '2026-11-02';

test('stages: booked by default; the workshop’s words and SAP’s; closed, collected, cancelled and no-shows are history; nonsense refused', () => {
  const cases: [string, string | null][] = [
    ['', 'SCHEDULED'], ['Booked', 'SCHEDULED'], ['Scheduled', 'SCHEDULED'], ['Appointment', 'SCHEDULED'], ['Confirmed', 'SCHEDULED'],
    ['Checked in', 'CHECKED_IN'], ['CRTD', 'CHECKED_IN'], ['Received', 'CHECKED_IN'], ['In service', 'IN_SERVICE'], ['REL', 'IN_SERVICE'], ['In progress', 'IN_SERVICE'],
    ['Completed', 'COMPLETED'], ['TECO', 'COMPLETED'], ['Ready for collection', 'READY_FOR_COLLECTION'],
    ['Collected', 'CLOSED'], ['Closed', 'CLOSED'], ['Cancelled', 'CLOSED'], ['No show', 'CLOSED'], ['Somewhere', null],
  ];
  for (const [w, s] of cases) assert.equal(openServiceStage(w), s, w);
});

test('times of day: 09:30, 9.30, 0930, 2:15 pm, 14h; nonsense is null', () => {
  assert.equal(parseTime('09:30'), '09:30');
  assert.equal(parseTime('9.30'), '09:30');
  assert.equal(parseTime('0930'), '09:30');
  assert.equal(parseTime('2:15 pm'), '14:15');
  assert.equal(parseTime('12 am'), '00:00');
  assert.equal(parseTime('14h'), '14:00');
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('soon'), null);
});

const H = ['Booking number', 'KUNUM', 'VHVIN', 'LICENSE_NUM', 'Stage', 'Booked for', 'Time', 'Checked in on', 'RECDV', 'Work requested', 'Supervisor', 'Technician', 'Notes', 'Branch'];
const m = autoMap('openServices', H);
const row = (o: Partial<Record<(typeof H)[number], string>>) => H.map((h) => o[h] ?? '');

test('a row: a booking with its day and time; a service with the day it came in; refusals', () => {
  assert.deepEqual(mappingProblems('openServices', m), []);
  assert.deepEqual(mappingProblems('openServices', { ...m, vin: null, plateNumber: null }), ['Choose the column for the vehicle’s chassis number (VIN) or plate: a service or a booking is for a vehicle.']);
  const b = checkOpenServiceRow(row({ 'Booking number': 'BK-2026-0600', KUNUM: '0001000113', VHVIN: 'JAANLR85EL7100013', 'Booked for': '03.11.2026', Time: '8.30', 'Work requested': 'Service 15,000 km; check the brakes', Branch: 'Isolo Branch' }), m, TODAY);
  assert.equal(b.status, 'GOOD', JSON.stringify(b.issues));
  assert.equal(b.values!.stage, 'SCHEDULED');
  assert.deepEqual(b.values!.bookedFor, { day: '2026-11-03', time: '08:30' });
  assert.equal(b.values!.checkedInOn, null);
  assert.deepEqual(b.values!.complaints, ['Service 15,000 km', 'check the brakes']);
  assert.deepEqual(b.keys, ['svc:BK-2026-0600', 'vin:JAANLR85EL7100013']);
  // No time: 09:00. A booking on a day already passed: kept, with a note for the front desk.
  assert.deepEqual(checkOpenServiceRow(row({ 'Booking number': 'B1', VHVIN: 'JAANLR85EL7100013', 'Booked for': '05.11.2026' }), m, TODAY).values?.bookedFor, { day: '2026-11-05', time: '09:00' });
  const past = checkOpenServiceRow(row({ 'Booking number': 'B2', VHVIN: 'JAANLR85EL7100013', 'Booked for': '01.11.2026', 'Work requested': 'Service' }), m, TODAY);
  assert.equal(past.status, 'WARNING');
  assert.match(past.issues[0]!.message, /a day that has passed/);
  // In the workshop: the day it came in; the technician is kept (for a booking it is not).
  const s = checkOpenServiceRow(row({ 'Booking number': 'SV-OLD-7101', VHVIN: 'JAANLR85EL7100022', Stage: 'In service', 'Checked in on': '31.10.2026', RECDV: '25,800', 'Work requested': 'Service', Technician: 'EMP-0042' }), m, TODAY);
  assert.equal(s.status, 'GOOD', JSON.stringify(s.issues));
  assert.equal(s.values!.stage, 'IN_SERVICE');
  assert.equal(s.values!.checkedInOn, '2026-10-31');
  assert.equal(s.values!.bookedFor, null);
  assert.equal(s.values!.mileage, 25800);
  assert.equal(s.values!.technician, 'EMP-0042');
  assert.equal(checkOpenServiceRow(row({ 'Booking number': 'B3', VHVIN: 'JAANLR85EL7100013', 'Booked for': '05.11.2026', Technician: 'EMP-0042', 'Work requested': 'Service' }), m, TODAY).values?.technician, null);
  const err = (o: Partial<Record<(typeof H)[number], string>>) => checkOpenServiceRow(row(o), m, TODAY).issues.filter((i) => i.level === 'error').map((i) => i.message);
  assert.deepEqual(err({ VHVIN: 'JAANLR85EL7100013', 'Booked for': '05.11.2026' }), ['Booking or service number is required (SAP AUFNR or QMNUM, or the diary’s booking reference).']);
  assert.match(err({ 'Booking number': 'X', VHVIN: 'JAANLR85EL7100013', Stage: 'Collected', 'Checked in on': '01.10.2026' })[0]!, /is history/);
  assert.match(err({ 'Booking number': 'X', VHVIN: 'JAANLR85EL7100013', Stage: 'Somewhere' })[0]!, /is not a stage EJO knows/);
  assert.deepEqual(err({ 'Booking number': 'X', VHVIN: 'JAANLR85EL7100013' }), ['A booking needs its day (Booked for): when is the customer expected?']);
  assert.match(err({ 'Booking number': 'X', 'Booked for': '05.11.2026' })[0]!, /Which vehicle is it\?/);
  assert.match(err({ 'Booking number': 'X', VHVIN: 'JAANLR85EL7100013', Stage: 'Checked in' })[0]!, /needs the day it came in/);
  assert.match(err({ 'Booking number': 'X', VHVIN: 'JAANLR85EL7100013', Stage: 'Checked in', 'Checked in on': '15.03.2027' })[0]!, /is in the future/);
});

test('wired in: live services and bookings in the chosen workshop, old number kept, the booking’s moment in Lagos time, nobody emailed, undo bins only what nobody touched', () => {
  const server = read('lib/data-exchange/open-services-server.ts');
  assert.match(server, /externalSource: range, externalId: v\.serviceNumber, importJobId: job\.id/);
  assert.match(server, /bookedFor: v\.bookedFor \? bookedAt\(v\.bookedFor\) : null/);
  assert.match(server, /new Date\(`\$\{b\.day\}T\$\{b\.time\}:00\.000\+01:00`\)/, 'Lagos time, UTC+1');
  assert.match(server, /approvalStatus: inWorkshop \? 'APPROVED' : 'PENDING'/);
  assert.match(server, /a vehicle has one open job card or service at a time/);
  assert.doesNotMatch(server, /sendEmail|notify|mailer/i, 'nobody is emailed');
  assert.match(server, /db\.auditLog\.count\(\{ where: \{ entityType: 'VehicleService', entityId: id, createdAt: \{ gt:/, 'a step taken since (audited) keeps it out of the bin');
  const dx = read('lib/actions/data-exchange.ts');
  assert.match(dx, /moveImportedServicesToBinInTx\(tx, quiet, job\.id/);
  assert.match(dx, /openServices: \['svc', 'vin', 'plate'\]/);
  assert.equal(ENTITIES.openServices.branchArea, 'workshop');
  assert.equal(ENTITIES.openServices.needs, 'workshop.close.approve');
  assert.match(read('app/(app)/workshop/vehicle-service/[id]/page.tsx'), /data-testid="service-booking"[\s\S]*data-testid="service-origin"/);
  for (const f of ['scripts/predeploy/0020-service-imports.sql', 'scripts/v-p6b-service-imports.sql']) {
    const sql = read(`../../${f}`);
    assert.match(sql, /ALTER TABLE "vehicle_services" ADD COLUMN IF NOT EXISTS "bookedFor" TIMESTAMP\(3\)/);
    assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE|UPDATE) /im, 'additive only');
  }
});
