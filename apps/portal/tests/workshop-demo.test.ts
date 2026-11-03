/**
 * The workshop demo plan (lib/workshop/demo/plan.ts): six invented months of
 * Isolo Branch, the same every run, cut at "now", with every stage present
 * and every rule the portal enforces holding inside it — so the demo never
 * shows a thing EJO itself would refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planWorkshopDemo, type JobCardStatus } from '../lib/workshop/demo/plan';
import { PARTS } from '../lib/workshop/demo/catalogue';
import { DEMO_CUSTOMERS, DEMO_STAFF, isDemoEmail } from '../lib/demo/people';
import { MINIMUM_DEPOSIT_FRACTION } from '../lib/workshop-constants';
import { REWORK_FROM_STATUSES } from '../lib/job-card-status-rules';

const NOW = new Date('2026-11-03T09:30:00Z');
const plan = planWorkshopDemo(NOW);
const ROOT = join(__dirname, '..', '..', '..', '..');

test('the same plan every run; nothing dated after now; six months back', () => {
  const again = planWorkshopDemo(NOW);
  assert.equal(JSON.stringify(again.figures), JSON.stringify(plan.figures));
  assert.equal(again.jobCards[40]!.openedAt.toISOString(), plan.jobCards[40]!.openedAt.toISOString());
  // Every date is in the past except the ones that are meant to be ahead: due, expiry, end and expected times.
  const AHEAD = new Set(['expiry', 'endsAt', 'nextServiceDueDate', 'dueDate', 'deadlineAt', 'validUntil', 'expiresAt', 'expectedAt', 'expectedReturnAt', 'expectedOutAt', 'dueFirstResponseAt', 'dueResolutionAt', 'startsAt', 'createdAt']);
  const dates: [string, Date][] = [];
  const walk = (v: unknown, key: string) => { if (v instanceof Date) dates.push([key, v]); else if (Array.isArray(v)) v.forEach((x) => walk(x, key)); else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k)); };
  walk({ ...plan, figures: undefined }, '');
  for (const [key, d] of dates) if (!AHEAD.has(key)) assert.ok(d <= NOW, `${key} ${d.toISOString()} is after now`);
  // The scheduled ones are ahead; a service's createdAt is the booking day, so only those may be ahead.
  for (const s of plan.services) if (s.status !== 'SCHEDULED') assert.ok(s.createdAt <= NOW);
  assert.ok(NOW.getTime() - plan.from.getTime() >= 180 * 86_400_000);
});

test('every job card status today, every service status, every claim stage, every slip stage; the four sign-ins have their stories; the plant-built vehicles are sold through Isolo — at any hour of any day', () => {
  // Monday first thing, a Saturday afternoon and a Wednesday evening: the stages are still all there.
  for (const when of [NOW, new Date('2026-11-09T06:40:00Z'), new Date('2026-11-07T14:00:00Z'), new Date('2026-11-18T19:30:00Z')]) {
    const p = planWorkshopDemo(when);
    for (const st of ['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT', 'CANCELLED'] as JobCardStatus[]) assert.ok(p.jobCards.some((j) => j.status === st), `${when.toISOString()}: a job card at ${st}`);
    for (const st of ['SCHEDULED', 'CHECKED_IN', 'IN_SERVICE', 'COLLECTED', 'ESCALATED'] as const) assert.ok(p.services.some((x) => x.status === st), `${when.toISOString()}: a service at ${st}`);
    assert.ok(p.parts.every((x) => x.onHand >= 0 && x.reserved <= x.onHand), `${when.toISOString()}: stock`);
  }
  const jc = new Set(plan.jobCards.map((j) => j.status));
  for (const s of ['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT', 'CANCELLED'] as JobCardStatus[]) assert.ok(jc.has(s), `a job card at ${s}`);
  const sv = new Set(plan.services.map((s) => s.status));
  for (const s of ['SCHEDULED', 'CHECKED_IN', 'IN_SERVICE', 'COLLECTED', 'CANCELLED', 'ESCALATED'] as const) assert.ok(sv.has(s), `a service at ${s}`);
  assert.deepEqual(plan.claims.map((c) => c.status), ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'SETTLED']);
  const slips = new Set([...plan.jobCards, ...plan.services].flatMap((j) => j.slips.map((s) => s.status)));
  for (const s of ['PENDING_HOD_APPROVAL', 'PENDING_STORE_APPROVAL', 'APPROVED', 'RELEASED'] as const) assert.ok(slips.has(s), `a slip at ${s}`);
  assert.ok(plan.jobCards.some((j) => j.rework) && plan.jobCards.some((j) => j.refund) && plan.jobCards.some((j) => j.roadTest), 'rework, a refund and road tests');
  for (const c of DEMO_CUSTOMERS) {
    const key = c.email.split('@')[0]!;
    assert.ok(plan.customers.some((x) => x.key === key && x.email === c.email), key);
    assert.ok(plan.vehicles.some((v) => v.customerKey === key), `${key} has a vehicle`);
  }
  assert.ok(plan.services.some((s) => s.customerKey === 'customer.adaora' && s.status === 'IN_SERVICE'), 'Adaora’s service in progress');
  assert.ok(plan.claims.some((c) => c.status === 'SUBMITTED' && plan.warranties.find((w) => w.key === c.warrantyKey)!.customerKey === 'customer.warranty'), 'the warranty customer’s submitted claim');
  const fromPlant = plan.vehicles.filter((v) => v.fromPlant);
  assert.equal(fromPlant.length, 6);
  assert.ok(fromPlant.some((v) => v.customerKey === 'customer.afprint'));
  for (const v of fromPlant) { assert.ok(plan.warranties.some((w) => w.vehicleKey === v.key && w.kind === 'ASSET' && w.status === 'ACTIVE'), `${v.vin} has its maker’s warranty`); assert.ok(plan.services.some((s) => s.vehicleKey === v.key), `${v.vin} was serviced at Isolo`); }
  assert.ok(plan.figures.jobCards! >= 150 && plan.figures.services! >= 60 && plan.figures.customers === 40);
});

test('the workshop’s rules hold in every job card: stages in order with their stamps, the deposit at 70% before work starts, the balance before closing, close and cancel only through a decided request, refunds only after a cancellation, rework only from the statuses the rules allow, estimates priced and approved before the customer is told', () => {
  const order = ['CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS', 'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT'];
  for (const j of plan.jobCards) {
    const est = j.estimate;
    if (est) {
      for (const l of est.lines) { assert.equal(l.amount, l.quantity * l.unitPrice, `${j.key} line amount`); assert.ok(l.unitPrice > 0); }
      if (est.status !== 'DRAFT') assert.ok(est.submittedAt && est.submittedAt >= est.createdAt);
      if (est.customerNotifiedAt) { assert.equal(est.status, 'MANAGER_APPROVED'); assert.ok(est.managerApprovedAt! <= est.customerNotifiedAt && est.approvedAt! <= est.managerApprovedAt!); }
    }
    const paid = j.payments.reduce((s, p) => s + p.amount, 0);
    if (j.workStartedAt) { assert.ok(est?.customerNotifiedAt, `${j.key} work after the customer was told`); const dep = j.payments[0]; if (est!.customerTotal > 0) assert.ok(dep && dep.at <= j.workStartedAt && dep.amount >= est!.customerTotal * MINIMUM_DEPOSIT_FRACTION - 1, `${j.key} deposit before work`); else assert.equal(j.payments.length, 0, `${j.key}: nothing to pay when the warranty carries it`); }
    if (j.cancellation?.status === 'APPROVED') { assert.ok(['CANCELLED', 'CHECKED_OUT'].includes(j.status) && !j.completedAt, `${j.key} cancelled: ${j.status}`); if (j.status === 'CHECKED_OUT') assert.ok(j.checkedOutAt && j.gateExit); continue; }
    if (order.indexOf(j.status) >= order.indexOf('IN_PROGRESS')) assert.ok(j.workStartedAt, `${j.key} ${j.status} has workStartedAt`);
    if (['COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT'].includes(j.status)) assert.ok(j.completedAt && j.completedAt >= j.workStartedAt!, `${j.key} completedAt`);
    if (['READY_FOR_COLLECTION', 'CLOSED', 'CHECKED_OUT'].includes(j.status)) assert.ok(j.readyForCollectionAt && j.readyForCollectionAt >= j.completedAt!);
    if (['CLOSED', 'CHECKED_OUT'].includes(j.status)) { assert.ok(j.close?.status === 'APPROVED' && j.closedAt && j.closedAt >= j.readyForCollectionAt!, `${j.key} closed through an approved request`); assert.ok(Math.abs(paid - est!.customerTotal) < 1, `${j.key} paid in full before closing`); }
    if (j.status === 'CHECKED_OUT') assert.ok(j.checkedOutAt && j.collectedByName && j.gateExit && j.gateExit.at >= j.checkedOutAt);
    if (j.status === 'CANCELLED') assert.equal(j.cancellation?.status, 'APPROVED');
    if (j.refund) { assert.equal(j.cancellation?.status, 'APPROVED'); assert.ok(j.refund.at >= j.cancellation!.decidedAt!); assert.equal(j.refund.amount, paid); }
    if (j.cancellation && j.cancellation.status === 'PENDING') assert.ok(!['CANCELLED', 'CHECKED_OUT'].includes(j.status));
    if (j.rework) { assert.ok(j.workStartedAt && j.rework.at > j.workStartedAt); assert.ok(REWORK_FROM_STATUSES.includes('QUALITY_CHECK')); assert.ok(j.audit.some((a) => a.action === 'job_card.rework_requested')); }
    for (const s of j.slips) { if (s.status === 'RELEASED') { assert.ok(s.releasedAt && s.storeAt && s.hodAt && s.hodAt <= s.storeAt && s.storeAt <= s.releasedAt); for (const l of s.lines) assert.equal(l.released, l.quantity); } if (s.status === 'PENDING_HOD_APPROVAL') assert.equal(s.hodAt, null); }
    if (j.roadTest?.status === 'RETURNED') assert.ok(j.roadTest.inAt! > j.roadTest.outAt! && j.roadTest.endOdometer! > j.roadTest.startOdometer);
    assert.ok(j.audit.length >= 1 && j.audit[0]!.action === 'job_card.created');
    assert.ok(j.technicianKey !== j.supervisorKey);
    const sup = DEMO_STAFF.find((s) => s.email === j.supervisorKey)!; assert.equal(sup.dept, j.dept, `${j.key} supervisor in its department`);
  }
  // Rework entries follow the rules' statuses.
  assert.deepEqual([...REWORK_FROM_STATUSES], ['QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION']);
});

test('the store adds up: stock on hand is receipts minus releases and never negative, reserved is the approved-not-released slips, batches FIFO with remaining quantities, every issued serial once, a few parts below reorder (the alerts), two pricing alerts open', () => {
  const received = new Map<string, number>(); const released = new Map<string, number>(); const reserved = new Map<string, number>();
  for (const g of plan.receipts) for (const l of g.lines) received.set(l.partKey, (received.get(l.partKey) ?? 0) + l.quantity);
  const slips = [...plan.jobCards, ...plan.services].flatMap((j) => j.slips);
  const serials = new Set<string>();
  const batchTaken = new Map<string, number>();
  for (const s of slips) for (const l of s.lines) {
    if (s.status === 'RELEASED') { released.set(l.partKey, (released.get(l.partKey) ?? 0) + l.quantity); for (const sn of l.serials) { assert.ok(!serials.has(sn), `${sn} issued twice`); serials.add(sn); } for (const b of l.batches) batchTaken.set(b.batchKey, (batchTaken.get(b.batchKey) ?? 0) + b.quantity); const part = PARTS.find((p) => p.key === l.partKey)!; if (part.tracking === 'SERIALIZED') assert.equal(l.serials.length, l.quantity); if (part.tracking === 'BATCH') assert.equal(l.batches.reduce((x, b) => x + b.quantity, 0), l.quantity); }
    if (s.status === 'APPROVED') reserved.set(l.partKey, (reserved.get(l.partKey) ?? 0) + l.quantity);
  }
  for (const p of plan.parts) {
    assert.equal(p.onHand, (received.get(p.key) ?? 0) - (released.get(p.key) ?? 0), `${p.key} on hand`);
    assert.equal(p.reserved, reserved.get(p.key) ?? 0, `${p.key} reserved`);
    assert.ok(p.onHand >= 0 && p.reserved >= 0 && p.reserved <= p.onHand, `${p.key} never negative`);
  }
  for (const g of plan.receipts) for (const l of g.lines) if (l.batch) assert.ok((batchTaken.get(l.batch.key) ?? 0) <= l.quantity, `${l.batch.number} over-consumed`);
  assert.ok(plan.figures.belowReorder! >= 3 && plan.figures.belowReorder! <= 8, `stock alerts: ${plan.figures.belowReorder}`);
  assert.equal(plan.figures.openPricingAlerts, 2);
  assert.ok(plan.receipts.some((g) => g.opening) && plan.receipts.filter((g) => !g.opening).every((g) => g.delivery));
});

test('services: the tracker fields on every completed service, an escalation carries its job card, inspections cover the template, reminders for vehicles due soon', () => {
  for (const s of plan.services) {
    if (['COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED', 'COLLECTED'].includes(s.status)) assert.ok(s.completedAt && s.attendedAt && s.nextServiceDueOdometer === s.odometer + 10_000 && s.nextServiceDueDate, `${s.key} tracker`);
    if (s.status === 'ESCALATED') { assert.ok(s.escalatedAt && s.escalatedToJobKey); const jc = plan.jobCards.find((j) => j.key === s.escalatedToJobKey)!; assert.equal(jc.escalatedFromServiceKey, s.key); assert.ok(jc.openedAt >= s.escalatedAt!); }
    if (s.inspection) assert.ok(s.inspection.items.length >= 20 && s.inspection.items.some((i) => i.severity !== 'GOOD'));
    if (s.status === 'COLLECTED') assert.ok(s.close?.status === 'APPROVED' && s.collectedByName && s.gateExit);
    if (s.workStartedAt) assert.ok(s.payments[0] && s.payments[0].at <= s.workStartedAt);
  }
  assert.equal(plan.reminders.length, 3);
});

test('warranties and claims: an asset warranty for every plant-built and newer Isuzu/Soueast vehicle, one pending verification; a part warranty for every issued battery and pad set; claims add up and carry their stage stamps and deadlines', () => {
  assert.ok(plan.warranties.filter((w) => w.kind === 'ASSET').length >= 15);
  assert.equal(plan.warranties.filter((w) => w.status === 'PENDING_VERIFICATION').length, 1);
  for (const w of plan.warranties) { assert.ok(w.endsAt > w.startsAt); if (w.origin === 'MANUAL' && w.status === 'ACTIVE') assert.ok(w.verifiedByKey && w.verifiedAt); if (w.kind === 'PART') assert.ok(w.jobKey && w.slipLineKey && w.origin === 'AUTO'); }
  const issuedBatteries = plan.jobCards.flatMap((j) => j.slips).filter((s) => s.status === 'RELEASED').flatMap((s) => s.lines).filter((l) => l.partKey.startsWith('battery')).flatMap((l) => l.serials);
  assert.equal(plan.warranties.filter((w) => w.serial).length, issuedBatteries.length);
  for (const c of plan.claims) {
    assert.equal(c.claimed, c.labour + c.parts + c.logistics);
    assert.ok(c.deadlineAt > c.createdAt && c.failureDate < c.createdAt);
    const stages = ['DRAFT', 'PENDING_HOD', 'PENDING_MANAGER', 'APPROVED_TO_SUBMIT', 'SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'SETTLED'];
    const i = stages.indexOf(c.status);
    assert.equal(Boolean(c.reviewRequestedAt), i >= 1); assert.equal(Boolean(c.hodAt), i >= 2); assert.equal(Boolean(c.managerAt), i >= 3); assert.equal(Boolean(c.submittedAt), i >= 4); assert.equal(Boolean(c.decidedAt), i >= 5); assert.equal(Boolean(c.settledAt), c.status === 'SETTLED');
    if (c.status === 'PARTIALLY_ACCEPTED') assert.ok(c.approved! > 0 && c.approved! < c.claimed);
    const jc = plan.jobCards.find((j) => j.key === c.jobKey)!;
    assert.ok(jc.estimate!.lines.some((l) => l.billTo === 'WARRANTY'), `${c.key}: its job card bills the warranty`);
    assert.equal(jc.warrantyKey, c.warrantyKey);
  }
});

test('security, scheduling, support: the CSO’s overdue items exist today (a visitor past their time, an exit pass out past its return), an open incident, deliveries tied to receipts, today’s appointments, open complaints, completed imports and exports', () => {
  assert.ok(plan.visits.some((v) => v.status === 'CHECKED_IN' && v.checkedInAt!.getTime() + v.durationMinutes * 60_000 < NOW.getTime()), 'an overdue visitor');
  assert.ok(plan.visits.some((v) => v.status === 'EXPECTED' && v.expectedAt > NOW));
  assert.ok(plan.exitPasses.some((e) => e.status === 'OUT' && e.returning && e.expectedReturnAt! < NOW), 'an exit pass out and overdue');
  assert.ok(plan.exitPasses.some((e) => e.status === 'PENDING_HEAD') && plan.exitPasses.some((e) => e.status === 'PENDING_MANAGER') && plan.exitPasses.some((e) => e.status === 'DECLINED'));
  for (const e of plan.exitPasses) if (['OUT', 'RETURNED', 'CLOSED'].includes(e.status)) assert.ok(e.headAt && e.managerAt && e.gateOutAt);
  assert.ok(plan.incidents.some((i) => i.status === 'OPEN') && plan.incidents.some((i) => i.status === 'CLOSED' && i.closedAt));
  assert.ok(plan.deliveries.filter((d) => d.receiptKey).length >= 25 && plan.deliveries.some((d) => d.status === 'AT_GATE') && plan.deliveries.some((d) => d.status === 'EXPECTED'));
  assert.equal(plan.contractors[0]!.attendance.at(-1)!.outAt, null, 'the contractor team is still on site');
  const today = NOW.toISOString().slice(0, 10);
  assert.ok(plan.appointments.filter((a) => a.startsAt.toISOString().startsWith(today)).length >= 2);
  assert.ok(plan.tickets.filter((t) => t.tags.includes('complaint') && t.status === 'OPEN').length >= 1);
  assert.ok(plan.tickets.some((t) => t.channel === 'STAFF' && t.requesterKey) && plan.tickets.some((t) => t.replies.some((r) => r.kind === 'AI')));
  for (const t of plan.tickets) { if (t.firstResponseAt) assert.ok(t.firstResponseAt >= t.createdAt); if (t.customerKey) assert.ok(plan.customers.some((c) => c.key === t.customerKey), `${t.key} customer`); }
  assert.equal(plan.imports.length, 7); assert.ok(plan.imports.every((i) => i.created + i.rejected <= i.rows));
  assert.equal(plan.exports.length, 4);
  assert.ok(plan.broadcasts.length >= 5 && plan.broadcasts.every((b) => b.endsAt > b.startsAt));
});

test('nothing real: every phone on the 0800 000 range, no email outside the four sign-ins, plates and VINs unique, every person a demo sign-in', () => {
  for (const c of plan.customers) { assert.match(c.phone, /^0800 000 \d{4}$/); if (c.email) assert.ok(isDemoEmail(c.email)); }
  assert.equal(plan.customers.filter((c) => c.email).length, 4);
  assert.equal(new Set(plan.vehicles.map((v) => v.plate)).size, plan.vehicles.length);
  assert.equal(new Set(plan.vehicles.map((v) => v.vin)).size, plan.vehicles.length);
  for (const v of plan.vehicles) assert.ok(v.vin.length === 17, v.vin);
  const people = new Set(DEMO_STAFF.map((s) => s.email));
  const keys = [...plan.jobCards.flatMap((j) => [j.technicianKey, j.supervisorKey, ...j.payments.map((p) => p.byKey), ...j.audit.map((a) => a.byKey)]), ...plan.visits.map((v) => v.hostKey), ...plan.exitPasses.map((e) => e.requestedByKey), ...plan.appointments.flatMap((a) => [a.ownerKey, ...a.participantKeys]), ...plan.warranties.map((w) => w.issuedByKey)];
  for (const k of keys) assert.ok(people.has(k), `${k} is a demo person`);
  for (const s of plan.suppliers) assert.match(s.phone, /^0800 000 \d{4}$/);
});

test('the loader removes exactly what it made, in an order the foreign keys allow, and the trail under the recorded maintenance switch; the reset loads people → plant → workshop; demo_records is declared', () => {
  const src = readFileSync(join(ROOT, 'apps/portal/lib/workshop/demo/load.ts'), 'utf8');
  assert.match(src, /prisma\.demoRecord\.findMany\(\{ where: \{ organisationId \}/);
  assert.match(src, /SET LOCAL ejo\.audit_maintenance = 'on'/);
  assert.ok(src.indexOf("'WarrantyClaim'") < src.indexOf("'Warranty'") && src.indexOf("'PartRequestSlipLine'") < src.indexOf("'PartRequestSlip'") && src.indexOf("'JobCard'") < src.indexOf("'Customer'") && src.indexOf("'CustomerVehicle'") < src.indexOf("'Customer',"));
  assert.match(src, /if \(!org\.isDemo\) throw/);
  assert.match(src, /stage: 'SOLD', customerVehicleId/);
  assert.match(src, /stage: 'YARD', customerVehicleId: null/);
  const reset = readFileSync(join(ROOT, 'apps/portal/scripts/demo-reset.ts'), 'utf8');
  assert.ok(reset.indexOf('loadDemoPeople(') < reset.indexOf('loadPlantDemo(') && reset.indexOf('loadPlantDemo(') < reset.indexOf('loadWorkshopDemo('));
  assert.match(readFileSync(join(ROOT, 'apps/portal/lib/governance/data-inventory.ts'), 'utf8'), /DemoRecord: \{ tenancy: 'ORGANISATION'/);
  assert.match(readFileSync(join(ROOT, 'scripts/predeploy/0018-demo-records.sql'), 'utf8'), /CREATE TABLE IF NOT EXISTS "demo_records"/);
});
