/**
 * Channel pricing rules (lib/pricing-core.ts): which list a customer gets,
 * which item prices a product, and what the daily broadcast says changed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelFor, resolvePrice, listKey, snapshotKey, changeSummary, broadcastText, lagosDayOf } from '../lib/pricing-core';

test('a customer\'s channel: their dealer account, else retail; the tier only matters for dealers', () => {
  assert.deepEqual(channelFor(null), { channel: 'RETAIL', tier: null });
  assert.deepEqual(channelFor({ channel: 'DEALER', tier: 'TIER_2' }), { channel: 'DEALER', tier: 'TIER_2' });
  assert.deepEqual(channelFor({ channel: 'CORPORATE', tier: 'TIER_1' }), { channel: 'CORPORATE', tier: null });
  assert.equal(listKey('DEALER', 'TIER_1'), 'DEALER:TIER_1');
  assert.equal(listKey('DEALER', null), 'DEALER');
  assert.equal(listKey('RETAIL', 'TIER_1'), 'RETAIL');
});

const items = [
  { productId: 'p1', configurationId: null, unitPrice: 500000, minQuantity: 1 },
  { productId: 'p1', configurationId: null, unitPrice: 480000, minQuantity: 10 },
  { productId: 'p1', configurationId: 'c1', unitPrice: 560000, minQuantity: 1 },
  { productId: 'p2', configurationId: 'c9', unitPrice: 90000, minQuantity: 1 },
];

test('price resolution: configuration beats product; the best quantity break the quantity reaches', () => {
  assert.equal(resolvePrice(items, { productId: 'p1' })?.unitPrice, 500000);
  assert.equal(resolvePrice(items, { productId: 'p1', quantity: 9 })?.unitPrice, 500000);
  assert.equal(resolvePrice(items, { productId: 'p1', quantity: 10 })?.unitPrice, 480000);
  assert.equal(resolvePrice(items, { productId: 'p1', configurationId: 'c1', quantity: 50 })?.unitPrice, 560000, 'an exact configuration price wins even without a quantity break');
  assert.equal(resolvePrice(items, { productId: 'p1', configurationId: 'c2' })?.unitPrice, 500000, 'an unpriced configuration falls back to the product price');
  assert.equal(resolvePrice(items, { productId: 'p2' }), null, 'only a configuration of p2 is priced');
  assert.equal(resolvePrice(items, { productId: 'p3' }), null);
  assert.equal(resolvePrice([], { productId: 'p1' }), null);
});

test('change summary between two broadcasts', () => {
  const key = (p: string, c: string | null, q = 1) => snapshotKey({ productId: p, configurationId: c, minQuantity: q });
  const before = [
    { key: key('p1', null), label: 'Prestige Pro2', unitPrice: 500000, minQuantity: 1 },
    { key: key('p2', null), label: 'Zpad X9', unitPrice: 120000, minQuantity: 1 },
    { key: key('p3', null), label: 'Old monitor', unitPrice: 80000, minQuantity: 1 },
  ];
  const after = [
    { key: key('p1', null), label: 'Prestige Pro2', unitPrice: 520000, minQuantity: 1 },
    { key: key('p2', null), label: 'Zpad X9', unitPrice: 110000, minQuantity: 1 },
    { key: key('p4', null), label: 'New fan', unitPrice: 25000, minQuantity: 1 },
  ];
  const s = changeSummary(before, after);
  assert.equal(s.up, 1);
  assert.equal(s.down, 1);
  assert.equal(s.added, 1);
  assert.equal(s.removed, 1);
  assert.equal(s.unchanged, 0);
  assert.equal(s.summary, '1 price up, 1 price down, 1 new, 1 removed');
  assert.deepEqual(s.changes.find((c) => c.key === key('p1', null)), { key: key('p1', null), label: 'Prestige Pro2', from: 500000, to: 520000, kind: 'UP' });
  const same = changeSummary(after, after);
  assert.equal(same.changes.length, 0);
  assert.match(same.summary, /^No change — 3 prices as before$/);
  const first = changeSummary(null, after);
  assert.equal(first.added, 3);
  assert.match(first.summary, /^First broadcast of this list: 3 prices$/);
  assert.equal(changeSummary(null, [after[0]!]).summary, 'First broadcast of this list: 1 price');
  const text = broadcastText({ companyName: 'Zinox Technologies', listName: 'Dealer Tier 1', dateLabel: '18 Oct 2026', lines: after, changes: s.changes });
  assert.match(text, /Prestige Pro2: ₦520,000\.00 \(up\)/);
  assert.match(text, /Zpad X9: ₦110,000\.00 \(down\)/);
  assert.match(text, /New fan: ₦25,000\.00 \(new\)/);
  assert.match(text, /No longer listed:\n- Old monitor/);
});

test('the broadcast day is the Lagos day', () => {
  assert.equal(lagosDayOf(new Date('2026-10-12T23:30:00Z')), '2026-10-13');
  assert.equal(lagosDayOf(new Date('2026-10-12T12:00:00Z')), '2026-10-12');
});
