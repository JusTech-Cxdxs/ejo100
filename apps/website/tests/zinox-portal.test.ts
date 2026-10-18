/**
 * The customer and dealer portal, Zinox edition: the pure rules the pages
 * rely on (what a device's cover says today, an order's money, a broadcast's
 * changes, who may upload proof), and source checks that every reader is keyed
 * by the signed-in customer and every action re-resolves the customer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deviceCover, orderMoney, broadcastChanges, canUploadProof, serviceStatusForCustomer, orderStatusForCustomer, SERVICE_STATUS_FOR_CUSTOMER } from '../lib/customer-portal/zinox-data';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.UTC(2026, 9, 18) + days * DAY);

test('a device\'s cover today: active, ending soon, expired, pending, suspended, or not activated', () => {
  const now = at(0);
  const active = deviceCover([{ id: 'w1', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-100), endsAt: at(200) }], now);
  assert.equal(active.state, 'active');
  assert.equal(active.warrantyId, 'w1');
  assert.equal(active.daysLeft, 200);
  assert.ok(!active.canActivate);
  assert.equal(deviceCover([{ id: 'w1', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-100), endsAt: at(20) }], now).state, 'expiring');
  const expired = deviceCover([{ id: 'w1', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-500), endsAt: at(-10) }], now);
  assert.equal(expired.state, 'expired');
  assert.ok(!expired.canActivate, 'an expired warranty is not re-activated online');
  assert.equal(deviceCover([{ id: 'w1', kind: 'PRODUCT', status: 'PENDING_VERIFICATION', startsAt: at(-1), endsAt: at(300) }], now).state, 'pending');
  assert.equal(deviceCover([{ id: 'w1', kind: 'PRODUCT', status: 'SUSPENDED', startsAt: at(-1), endsAt: at(300) }], now).label, 'Warranty suspended');
  const none = deviceCover([{ id: 'p', kind: 'PART', status: 'ACTIVE', startsAt: at(-1), endsAt: at(300) }], now);
  assert.equal(none.state, 'none');
  assert.ok(none.canActivate, 'only a device with no product warranty can be activated');
  assert.ok(deviceCover([{ id: 'v', kind: 'PRODUCT', status: 'VOID', startsAt: at(-1), endsAt: at(300) }], now).canActivate, 'a void warranty does not block activation');
  // The latest-ending active one wins.
  assert.equal(deviceCover([{ id: 'a', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-1), endsAt: at(10) }, { id: 'b', kind: 'PRODUCT', status: 'ACTIVE', startsAt: at(-1), endsAt: at(400) }], now).warrantyId, 'b');
});

test('an order\'s money: total, confirmed, pending confirmation, outstanding — never negative', () => {
  const m = orderMoney({ total: '1500000.00', amountPaid: 500000, payments: [{ amount: 500000, status: 'CONFIRMED' }, { amount: '250000.50', status: 'PENDING' }, { amount: 99, status: 'REJECTED' }] });
  assert.deepEqual(m, { total: 1500000, paid: 500000, pending: 250000.5, outstanding: 1000000 });
  assert.equal(orderMoney({ total: 100, amountPaid: 150, payments: [] }).outstanding, 0);
  assert.ok(canUploadProof('AWAITING_PAYMENT', 1000));
  assert.ok(canUploadProof('CONFIRMED', 1000));
  assert.ok(!canUploadProof('AWAITING_PAYMENT', 0), 'nothing outstanding');
  assert.ok(!canUploadProof('DELIVERED', 1000) && !canUploadProof('CANCELLED', 1000) && !canUploadProof('CLOSED', 1000));
});

test('broadcast changes are read defensively from JSON', () => {
  assert.deepEqual(broadcastChanges(null), []);
  assert.deepEqual(broadcastChanges('nope'), []);
  assert.deepEqual(broadcastChanges([{ product: 'Prestige Pro2', from: '450000', to: 445000 }, { name: 'Zpad X9', to: 120000 }, null, 'x']), [
    { product: 'Prestige Pro2', from: 450000, to: 445000 },
    { product: 'Zpad X9', from: null, to: 120000 },
  ]);
  assert.equal(broadcastChanges(Array.from({ length: 150 }, (_, i) => ({ product: `P${i}`, to: i }))).length, 100);
});

test('status words for customers are plain English, one per state', () => {
  for (const s of ['OPEN', 'ASSIGNED', 'DIAGNOSED', 'AWAITING_PARTS', 'REPAIRING', 'QA', 'READY', 'RETURNED', 'CLOSED', 'CANCELLED']) {
    const info = SERVICE_STATUS_FOR_CUSTOMER[s];
    assert.ok(info && info.label.length > 3 && info.explain.length > 10, s);
    assert.doesNotMatch(info.label + info.explain, /technician [A-Z]|cost|₦/, 'no staff names, no costs');
  }
  assert.equal(serviceStatusForCustomer('SOMETHING_NEW').label, 'something new');
  assert.equal(orderStatusForCustomer('AWAITING_PAYMENT').label, 'Awaiting your payment');
  assert.equal(orderStatusForCustomer('UNKNOWN').tone, 'neutral');
});

test('every reader is keyed by the signed-in customer and selects no staff names or costs', () => {
  const src = read('lib/customer-portal/zinox-data.ts');
  for (const fn of ['loadDevices', 'loadOrders', 'loadDealerPrices', 'loadClaims']) {
    const i = src.indexOf(`export const ${fn} = cache(async (customerId: string`);
    assert.ok(i >= 0, `${fn} takes the customer id`);
    const body = src.slice(i, src.indexOf('\n});', i));
    assert.match(body, /customerId/, `${fn} filters by customerId`);
  }
  assert.match(src, /finishedUnit\.findMany\(\{\s*where: \{ customerId \}/);
  assert.match(src, /salesOrder\.findMany\(\{\s*where: \{ customerId \}/);
  assert.match(src, /warrantyClaim\.findMany\(\{\s*where: \{ customerId, warranty: \{ kind: 'PRODUCT' \} \}/);
  assert.match(src, /serviceJob\.findMany\(\{\s*where: \{ customerId \}/);
  assert.match(src, /dealerAccount\.findUnique\(\{ where: \{ customerId \}/);
  for (const forbidden of ['technicianId: true', 'costPrice', 'unitCost: true', 'fullName: true', 'diagnosis: true', 'costCentre', 'ledger']) assert.ok(!src.includes(forbidden), `never selects ${forbidden}`);
  const data = read('lib/customer-portal/data.ts');
  assert.match(data, /export const loadDealerAccount = cache\(async \(customerId: string\)/);
});

test('every action re-resolves the customer and touches only their own rows', () => {
  const src = read('lib/customer-portal/zinox-actions.ts');
  assert.match(src.slice(0, 20), /'use server'/);
  for (const fn of ['activateDeviceWarranty', 'registerDealerDevice', 'uploadPaymentProof', 'reportDeviceFault']) {
    const i = src.indexOf(`export async function ${fn}(`);
    assert.ok(i >= 0, fn);
    const body = src.slice(i, src.indexOf('\nexport ', i + 10) === -1 ? undefined : src.indexOf('\nexport ', i + 10));
    assert.match(body, /const me = await currentCustomer\(\);\s*if \(!me\) return SIGNED_OUT;/, `${fn} starts from the session`);
  }
  assert.match(src, /finishedUnit\.findFirst\(\{\s*where: \{ id: unitId, customerId: me\.id \}/, 'a device is only ever the customer\'s own');
  assert.match(src, /salesOrder\.findFirst\(\{ where: \{ id: orderId, customerId: me\.id \}/, 'an order is only ever the customer\'s own');
  assert.match(src, /status: 'PENDING', proofNote: proofNote \|\| null, recordedByCustomerId: me\.id/, 'proof is a PENDING payment recorded by the customer');
  assert.match(src, /finishedUnit\.updateMany\(\{ where: \{ id: unit\.id, customerId: null \}, data: \{ customerId: me\.id/, 'a dealer-bought unit is attached only if nobody owns it (compare-and-set)');
  assert.match(src, /origin: 'PORTAL'/);
  assert.match(src, /activatedVia: 'portal'/, 'the audit trail says the portal did it');
  assert.match(src, /kind: covered \? 'WARRANTY' : 'PAID'/);
  assert.match(src, /branch\.findFirst\(\{ where: \{ businessUnit: \{ organisationId: me\.organisationId \} \}, orderBy: \{ createdAt: 'asc' \}/, 'the job lands in the organisation\'s first branch');
  assert.doesNotMatch(src, /prisma\.user\.update|prisma\.role|prisma\.session/, 'never touches staff accounts');
});

test('the portal navigation carries the Zinox pages and Prices is dealer-only', () => {
  const nav = read('components/customer/PortalShell.tsx');
  for (const href of ['/devices', '/orders', '/prices', '/claims']) assert.ok(nav.includes(`\`\${BASE}${href}\``), href);
  assert.match(nav, /label: 'Prices', icon: 'chart', dealerOnly: true/);
  assert.match(nav, /NAV\.filter\(\(n\) => !n\.dealerOnly \|\| dealer\)/);
  for (const page of ['devices', 'orders', 'prices', 'claims']) assert.match(read(`app/customer-portal/dashboard/${page}/page.tsx`), /await requireCustomer\(\)/, `${page} page requires the customer`);
  assert.match(read('app/customer-portal/dashboard/prices/page.tsx'), /loadDealerAccount\(me\.id\)/);
});
