"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Analytics reconciliation — the numbers on Business Analytics and Inventory
 * Analytics, checked against answers worked out by hand from a small, known
 * set of jobs, payments and stock movements. Pure: no database.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const master_analytics_1 = require("../lib/master-analytics");
const inventory_analytics_1 = require("../lib/inventory-analytics");
const at = (s) => new Date(`${s}+01:00`); // Lagos time
const NOW = at('2026-10-15T12:00:00');
const FROM = at('2026-10-01T00:00:00');
const TO = at('2026-10-16T00:00:00');
const job = (o) => ({
    number: o.id, customer: 'Customer', status: 'COMPLETED', openedAt: at('2026-09-20T09:00:00'), finishedAt: null, cancelled: false,
    lines: [], partsCost: 0, partsIssuedWithoutCost: 0, subletCost: 0, payments: [], refunds: [], ...o,
});
const JOBS = [
    // Finished 5 Oct: ₦50,000 labour + ₦30,000 parts, all customer; parts cost ₦20,000; paid in full.
    job({ id: 'J1', kind: 'JC', customerId: 'c1', customer: 'Ada', finishedAt: at('2026-10-05T15:00:00'), lines: [{ type: 'LABOUR', amount: 50000, billTo: 'CUSTOMER' }, { type: 'STORE_PART', amount: 30000, billTo: 'CUSTOMER' }], partsCost: 20000, payments: [{ at: at('2026-10-05T15:00:00'), amount: 80000 }] }),
    // Finished 10 Oct: ₦20,000 labour (customer), ₦10,000 part (warranty pays), ₦5,000 sundry given as goodwill; parts cost ₦6,000; customer paid ₦10,000.
    job({ id: 'J2', kind: 'JC', customerId: 'c2', customer: 'Ada', finishedAt: at('2026-10-10T10:00:00'), lines: [{ type: 'LABOUR', amount: 20000, billTo: 'CUSTOMER' }, { type: 'STORE_PART', amount: 10000, billTo: 'WARRANTY' }, { type: 'SUNDRY', amount: 5000, billTo: 'GOODWILL' }], partsCost: 6000, payments: [{ at: at('2026-10-10T10:00:00'), amount: 10000 }] }),
    // A booking for next week — not work in progress.
    job({ id: 'S1', kind: 'SV', status: 'SCHEDULED', openedAt: at('2026-10-14T09:00:00') }),
    // Being worked on since 1 September — work in progress, and stalled.
    job({ id: 'J4', kind: 'JC', status: 'IN_PROGRESS', openedAt: at('2026-09-01T09:00:00'), lines: [{ type: 'LABOUR', amount: 12000, billTo: 'CUSTOMER' }] }),
    // Cancelled after a ₦5,000 deposit on 2 Oct, not yet refunded: owed back.
    job({ id: 'J5', kind: 'JC', status: 'CANCELLED', cancelled: true, payments: [{ at: at('2026-10-02T09:00:00'), amount: 5000 }] }),
    // Finished in September, a ₦3,000 refund recorded in October.
    job({ id: 'J6', kind: 'JC', finishedAt: at('2026-09-12T09:00:00'), lines: [{ type: 'LABOUR', amount: 7000, billTo: 'CUSTOMER' }], payments: [{ at: at('2026-09-12T09:00:00'), amount: 10000 }], refunds: [{ at: at('2026-10-03T09:00:00'), amount: 3000 }] }),
];
(0, node_test_1.test)('one job: customer, warranty and given-away money are kept apart', () => {
    const m = (0, master_analytics_1.jobMoney)(JOBS[1]);
    strict_1.default.equal(m.customer, 20000);
    strict_1.default.equal(m.warranty, 10000);
    strict_1.default.equal(m.givenAway, 5000);
    strict_1.default.equal(m.sales, 30000, 'goodwill is not a sale');
    strict_1.default.equal(m.owed, 10000, 'the customer owes only their own lines');
});
(0, node_test_1.test)('business analytics reconcile to the hand-worked answers', () => {
    const a = (0, master_analytics_1.computeMasterAnalytics)({ jobs: JOBS, purchases: [{ at: at('2026-10-04T09:00:00'), cost: 40000 }], settlements: [{ at: at('2026-10-11T09:00:00'), amount: 10000 }], from: FROM, to: TO, now: NOW });
    const c = a.current;
    strict_1.default.equal(c.sales, 110000, '₦80,000 + ₦30,000');
    strict_1.default.equal(c.customerSales, 100000);
    strict_1.default.equal(c.warrantySales, 10000);
    strict_1.default.equal(c.givenAway, 5000);
    strict_1.default.equal(c.cost, 26000);
    strict_1.default.equal(c.grossProfit, 84000);
    strict_1.default.equal(c.grossMargin, 76.4);
    strict_1.default.equal(c.jobsCompleted, 2);
    strict_1.default.equal(c.averageJob, 55000);
    strict_1.default.equal(c.collections, 92000, 'payments ₦95,000 − refund ₦3,000 recorded in October');
    strict_1.default.equal(c.refunds, 3000);
    strict_1.default.equal(c.purchases, 40000);
    strict_1.default.equal(c.warrantySettled, 10000);
    // Position now
    strict_1.default.equal(a.position.wipJobs, 1, 'the booking is not work in progress');
    strict_1.default.equal(a.position.wipServices, 0);
    strict_1.default.equal(a.position.wipValue, 12000);
    strict_1.default.equal(a.position.receivables, 10000, 'J2’s balance');
    strict_1.default.equal(a.position.receivableJobs, 1);
    strict_1.default.equal(a.position.overpaidTotal, 5000, 'J5’s ₦5,000 deposit is owed back (J6 was refunded its overpayment)');
    // Top customers are grouped by customer, not by name.
    strict_1.default.equal(a.diagnostic.topCustomers.length, 2, 'two different customers called Ada stay apart');
    // Actions point at the exact records.
    const stalled = a.actions.find((x) => /open for more than 10 working days/.test(x.title));
    strict_1.default.ok(stalled, 'the stalled job is flagged');
    strict_1.default.deepEqual(stalled.items.map((i) => i.href), ['/workshop/job-cards/J4']);
    strict_1.default.ok(!a.actions.some((x) => /S1/.test(JSON.stringify(x.items))), 'a future booking is never "stalled"');
});
(0, node_test_1.test)('forecast ignores the unfinished current week', () => {
    // Eleven flat weeks of ₦5m, then a Monday with only ₦0.7m so far.
    const jobs = [];
    const monday = at('2026-10-12T10:00:00');
    for (let w = 1; w <= 11; w += 1)
        jobs.push(job({ id: `W${w}`, kind: 'JC', finishedAt: new Date(+monday - w * 7 * 86400000), lines: [{ type: 'LABOUR', amount: 5_000_000, billTo: 'CUSTOMER' }] }));
    jobs.push(job({ id: 'NOW', kind: 'JC', finishedAt: monday, lines: [{ type: 'LABOUR', amount: 700_000, billTo: 'CUSTOMER' }] }));
    const a = (0, master_analytics_1.computeMasterAnalytics)({ jobs, purchases: [], settlements: [], from: FROM, to: TO, now: at('2026-10-12T12:00:00') });
    strict_1.default.equal(a.predictive.trendPerWeek, 0, 'flat history = flat trend');
    strict_1.default.equal(a.predictive.forecast[0].expected, 5_000_000);
});
(0, node_test_1.test)('inventory: stock valued at FIFO receipt cost; uncosted stock is counted; goodwill earns nothing', () => {
    const part = { id: 'P1', name: 'Oil filter', partNumber: null, category: 'Filters', unit: 'pcs', isActive: true, onHand: 15, reserved: 0, reorderPoint: null, safetyStock: null, sellingPrice: 3000, targetMarginPercent: null, createdAt: at('2026-01-01T09:00:00') };
    const receipts = [
        { partId: 'P1', qty: 10, unitCost: 1000, date: at('2026-03-01T09:00:00'), supplier: 'A' },
        { partId: 'P1', qty: 10, unitCost: 1500, date: at('2026-08-01T09:00:00'), supplier: 'A' },
        { partId: 'P1', qty: 5, unitCost: null, date: at('2026-10-01T09:00:00'), supplier: 'B' },
    ];
    const issues = [
        { partId: 'P1', qty: 10, date: at('2026-09-01T09:00:00'), unitCost: 1000, unitPrice: 3000, priceIsEstimated: false },
        { partId: 'P1', qty: 1, date: at('2026-10-05T09:00:00'), unitCost: 1500, unitPrice: 0, priceIsEstimated: false }, // goodwill
    ];
    const a = (0, inventory_analytics_1.computeInventoryAnalytics)({ parts: [part], receipts, issues, openPricingAlerts: 0, now: NOW });
    const row = a.rows.find((r) => r.id === 'P1');
    // FIFO: the 15 on hand are the newest — 5 uncosted (valued at the average ₦1,250) + 10 at ₦1,500.
    strict_1.default.equal(row.stockValue, 5 * 1250 + 10 * 1500);
    strict_1.default.equal(row.uncostedUnits, 5);
    strict_1.default.equal(a.descriptive.partsWithUncostedStock, 1);
    strict_1.default.equal(row.revenue365, 30000, 'the goodwill unit adds no revenue');
    strict_1.default.equal(row.cogs365, 11500, 'but its cost still counts');
});
(0, node_test_1.test)('inventory months follow Lagos time: 00:30 on 1 October is October', () => {
    const part = { id: 'P2', name: 'Bulb', partNumber: null, category: 'Electrical', unit: 'pcs', isActive: true, onHand: 0, reserved: 0, reorderPoint: null, safetyStock: null, sellingPrice: 500, targetMarginPercent: null, createdAt: at('2026-01-01T09:00:00') };
    const a = (0, inventory_analytics_1.computeInventoryAnalytics)({
        parts: [part], receipts: [], openPricingAlerts: 0, now: NOW,
        issues: [{ partId: 'P2', qty: 1, date: at('2026-10-01T00:30:00'), unitCost: 100, unitPrice: 500, priceIsEstimated: false }],
    });
    const list = a.descriptive.trend;
    const oct = list.find((m) => /Oct/.test(m.label));
    const sep = list.find((m) => /Sep/.test(m.label));
    strict_1.default.equal(oct?.revenue, 500);
    strict_1.default.equal(sep?.revenue ?? 0, 0);
});
