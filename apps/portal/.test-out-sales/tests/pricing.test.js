"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Channel pricing rules (lib/pricing-core.ts): which list a customer gets,
 * which item prices a product, and what the daily broadcast says changed.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const pricing_core_1 = require("../lib/pricing-core");
(0, node_test_1.test)('a customer\'s channel: their dealer account, else retail; the tier only matters for dealers', () => {
    strict_1.default.deepEqual((0, pricing_core_1.channelFor)(null), { channel: 'RETAIL', tier: null });
    strict_1.default.deepEqual((0, pricing_core_1.channelFor)({ channel: 'DEALER', tier: 'TIER_2' }), { channel: 'DEALER', tier: 'TIER_2' });
    strict_1.default.deepEqual((0, pricing_core_1.channelFor)({ channel: 'CORPORATE', tier: 'TIER_1' }), { channel: 'CORPORATE', tier: null });
    strict_1.default.equal((0, pricing_core_1.listKey)('DEALER', 'TIER_1'), 'DEALER:TIER_1');
    strict_1.default.equal((0, pricing_core_1.listKey)('DEALER', null), 'DEALER');
    strict_1.default.equal((0, pricing_core_1.listKey)('RETAIL', 'TIER_1'), 'RETAIL');
});
const items = [
    { productId: 'p1', configurationId: null, unitPrice: 500000, minQuantity: 1 },
    { productId: 'p1', configurationId: null, unitPrice: 480000, minQuantity: 10 },
    { productId: 'p1', configurationId: 'c1', unitPrice: 560000, minQuantity: 1 },
    { productId: 'p2', configurationId: 'c9', unitPrice: 90000, minQuantity: 1 },
];
(0, node_test_1.test)('price resolution: configuration beats product; the best quantity break the quantity reaches', () => {
    strict_1.default.equal((0, pricing_core_1.resolvePrice)(items, { productId: 'p1' })?.unitPrice, 500000);
    strict_1.default.equal((0, pricing_core_1.resolvePrice)(items, { productId: 'p1', quantity: 9 })?.unitPrice, 500000);
    strict_1.default.equal((0, pricing_core_1.resolvePrice)(items, { productId: 'p1', quantity: 10 })?.unitPrice, 480000);
    strict_1.default.equal((0, pricing_core_1.resolvePrice)(items, { productId: 'p1', configurationId: 'c1', quantity: 50 })?.unitPrice, 560000, 'an exact configuration price wins even without a quantity break');
    strict_1.default.equal((0, pricing_core_1.resolvePrice)(items, { productId: 'p1', configurationId: 'c2' })?.unitPrice, 500000, 'an unpriced configuration falls back to the product price');
    strict_1.default.equal((0, pricing_core_1.resolvePrice)(items, { productId: 'p2' }), null, 'only a configuration of p2 is priced');
    strict_1.default.equal((0, pricing_core_1.resolvePrice)(items, { productId: 'p3' }), null);
    strict_1.default.equal((0, pricing_core_1.resolvePrice)([], { productId: 'p1' }), null);
});
(0, node_test_1.test)('change summary between two broadcasts', () => {
    const key = (p, c, q = 1) => (0, pricing_core_1.snapshotKey)({ productId: p, configurationId: c, minQuantity: q });
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
    const s = (0, pricing_core_1.changeSummary)(before, after);
    strict_1.default.equal(s.up, 1);
    strict_1.default.equal(s.down, 1);
    strict_1.default.equal(s.added, 1);
    strict_1.default.equal(s.removed, 1);
    strict_1.default.equal(s.unchanged, 0);
    strict_1.default.equal(s.summary, '1 price up, 1 price down, 1 new, 1 removed');
    strict_1.default.deepEqual(s.changes.find((c) => c.key === key('p1', null)), { key: key('p1', null), label: 'Prestige Pro2', from: 500000, to: 520000, kind: 'UP' });
    const same = (0, pricing_core_1.changeSummary)(after, after);
    strict_1.default.equal(same.changes.length, 0);
    strict_1.default.match(same.summary, /^No change — 3 prices as before$/);
    const first = (0, pricing_core_1.changeSummary)(null, after);
    strict_1.default.equal(first.added, 3);
    strict_1.default.match(first.summary, /^First broadcast of this list: 3 prices$/);
    strict_1.default.equal((0, pricing_core_1.changeSummary)(null, [after[0]]).summary, 'First broadcast of this list: 1 price');
    const text = (0, pricing_core_1.broadcastText)({ companyName: 'Zinox Technologies', listName: 'Dealer Tier 1', dateLabel: '18 Oct 2026', lines: after, changes: s.changes });
    strict_1.default.match(text, /Prestige Pro2: ₦520,000\.00 \(up\)/);
    strict_1.default.match(text, /Zpad X9: ₦110,000\.00 \(down\)/);
    strict_1.default.match(text, /New fan: ₦25,000\.00 \(new\)/);
    strict_1.default.match(text, /No longer listed:\n- Old monitor/);
});
(0, node_test_1.test)('the broadcast day is the Lagos day', () => {
    strict_1.default.equal((0, pricing_core_1.lagosDayOf)(new Date('2026-10-12T23:30:00Z')), '2026-10-13');
    strict_1.default.equal((0, pricing_core_1.lagosDayOf)(new Date('2026-10-12T12:00:00Z')), '2026-10-12');
});
