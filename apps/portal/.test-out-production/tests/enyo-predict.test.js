"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Enyo's workshop intelligence (lib/enyo/predict): text normalisation,
 * TF-IDF similarity, combining similar jobs' lines into a prediction,
 * scoring a prediction against the approved estimate, and the training
 * export's no-personal-data rule. Pure: no database.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const text_1 = require("../lib/enyo/predict/text");
const lines_core_1 = require("../lib/enyo/predict/lines-core");
const similar_core_1 = require("../lib/enyo/predict/similar-core");
const dataset_core_1 = require("../lib/enyo/predict/dataset-core");
// ── Normalisation and tokens ───────────────────────────────────────────
(0, node_test_1.test)('normalises case, punctuation and contractions', () => {
    strict_1.default.equal((0, text_1.normaliseText)("  The A/C won't   COOL!!  "), 'the ac wont cool');
    strict_1.default.equal((0, text_1.normaliseText)('Brake-pads (front)'), 'brake pads front');
    strict_1.default.equal((0, text_1.normaliseText)('Café'), 'cafe');
});
(0, node_test_1.test)('maps workshop and Nigerian-English phrases to one word each', () => {
    for (const s of ['AC not cooling', 'a/c not cooling', 'Aircon not cooling', 'air conditioning not cooling', 'air condition is blowing hot air']) {
        const t = (0, text_1.tokenise)(s);
        strict_1.default.ok(t.includes('aircon'), `${s} → ${t.join(' ')}`);
        strict_1.default.ok(t.includes('notcooling'), `${s} → ${t.join(' ')}`);
    }
    for (const s of ["car won't start", 'vehicle not starting', 'refusing to start', 'Car cannot start', "doesn't start"]) {
        strict_1.default.deepEqual((0, text_1.tokenise)(s), ['nostart'], s);
    }
    strict_1.default.deepEqual((0, text_1.tokenise)('Car is shaking'), ['vibration']);
    strict_1.default.deepEqual((0, text_1.tokenise)('vibration at high speed'), ['vibration', 'high', 'speed']);
    strict_1.default.ok((0, text_1.tokenise)('Change brake pad').includes('brakepad'));
    strict_1.default.ok((0, text_1.tokenise)('front pads worn').includes('brakepad'));
    strict_1.default.ok((0, text_1.tokenise)('Engine knocking sound').includes('knocking'));
    strict_1.default.ok((0, text_1.tokenise)('check engine light on').includes('checkengine'));
    strict_1.default.equal((0, text_1.applySynonyms)('the ac is not cooling'), 'the aircon is notcooling');
});
(0, node_test_1.test)('drops filler words and numbers, and stems lightly', () => {
    strict_1.default.deepEqual((0, text_1.tokenise)('Please the customer complains the car is overheating at 50000 km'), ['overheating', 'km']);
    strict_1.default.equal((0, text_1.stem)('leaking'), 'leak');
    strict_1.default.equal((0, text_1.stem)('wheels'), 'wheel');
    strict_1.default.equal((0, text_1.stem)('batteries'), 'battery');
    strict_1.default.equal((0, text_1.stem)('glass'), 'glass');
    strict_1.default.equal((0, text_1.stem)('aircon'), 'aircon');
    strict_1.default.equal((0, text_1.stem)('stopped'), 'stop');
    strict_1.default.deepEqual((0, text_1.tokenise)(''), []);
    strict_1.default.deepEqual((0, text_1.tokenise)('!!!'), []);
});
(0, node_test_1.test)('model family is the first word of the model', () => {
    strict_1.default.equal((0, text_1.modelFamily)('Hilux Revo 2.8'), 'hilux');
    strict_1.default.equal((0, text_1.modelFamily)(null), '');
});
// ── TF-IDF ─────────────────────────────────────────────────────────────
(0, node_test_1.test)('TF-IDF cosine: identical text is 1, unrelated text is 0, rare words weigh more', () => {
    const docs = [(0, text_1.tokenise)('aircon not cooling'), (0, text_1.tokenise)('brake pads worn squealing'), (0, text_1.tokenise)('engine overheating'), (0, text_1.tokenise)('aircon noise')];
    const idf = (0, text_1.buildIdf)(docs);
    const v = (s) => (0, text_1.tfidfVector)((0, text_1.tokenise)(s), idf);
    strict_1.default.ok(Math.abs((0, text_1.cosine)(v('AC not cooling'), v('aircon not cooling')) - 1) < 1e-9);
    strict_1.default.equal((0, text_1.cosine)(v('AC not cooling'), v('engine overheating')), 0);
    // "aircon" appears in two documents, "notcooling" in one: sharing the rarer word scores higher.
    strict_1.default.ok((0, text_1.cosine)(v('aircon not cooling'), v('not cooling')) > (0, text_1.cosine)(v('aircon not cooling'), v('aircon')));
    // Vectors are unit length.
    const vec = v('brake pads worn squealing');
    const norm = Math.sqrt([...vec.values()].reduce((s, w) => s + w * w, 0));
    strict_1.default.ok(Math.abs(norm - 1) < 1e-9);
    strict_1.default.equal((0, text_1.cosine)(new Map(), vec), 0);
});
// ── Scoring candidates ─────────────────────────────────────────────────
const cand = (o) => ({
    kind: 'JOB_CARD', number: o.id, branchId: 'b1', createdAt: new Date('2026-05-01T10:00:00Z'), make: 'Toyota', model: 'Corolla', year: 2018, mileage: 80000, ...o,
});
(0, node_test_1.test)('vehicle bonus: make, model family, year band and mileage', () => {
    const q = { make: 'Toyota', model: 'Corolla LE', year: 2018, mileage: 80000 };
    strict_1.default.equal((0, similar_core_1.vehicleBonus)(q, { make: 'Honda', model: 'Corolla', year: 2018, mileage: 80000 }), 0);
    strict_1.default.equal((0, similar_core_1.vehicleBonus)(q, { make: 'toyota', model: 'Camry', year: 2018, mileage: 10000 }), 0.04);
    strict_1.default.equal((0, similar_core_1.vehicleBonus)(q, { make: 'TOYOTA', model: 'corolla', year: 2016, mileage: 70000 }), 0.2);
    strict_1.default.equal((0, similar_core_1.vehicleBonus)(q, { make: 'Toyota', model: 'Corolla', year: 2010, mileage: null }), 0.12);
});
(0, node_test_1.test)('similar jobs: ranked by text first, vehicle second; unrelated jobs are left out', () => {
    const ranked = (0, similar_core_1.scoreCandidates)({ text: 'AC not cooling', make: 'Toyota', model: 'Corolla', year: 2018, mileage: 82000 }, [
        cand({ id: 'brakes', text: 'Brake pads worn, squealing' }),
        cand({ id: 'ac-honda', text: 'Air conditioning not cooling', make: 'Honda', model: 'Accord' }),
        cand({ id: 'ac-toyota', text: 'aircon is not cooling well' }),
        cand({ id: 'ac-noise', text: 'AC making noise', createdAt: new Date('2026-06-01T10:00:00Z') }),
    ], { k: 9 });
    strict_1.default.deepEqual(ranked.map((r) => r.id), ['ac-toyota', 'ac-honda', 'ac-noise']);
    strict_1.default.ok(ranked[0].similarity > ranked[1].similarity);
    strict_1.default.ok(ranked[0].shared.includes('notcooling'));
    strict_1.default.equal((0, similar_core_1.scoreCandidates)({ text: 'the car', make: null, model: null, year: null, mileage: null }, [cand({ id: 'x', text: 'car' })]).length, 0);
    strict_1.default.equal((0, similar_core_1.scoreCandidates)({ text: 'AC not cooling', make: null, model: null, year: null, mileage: null }, [cand({ id: 'x', text: 'AC not cooling' })], { k: 0 }).length, 0);
});
// ── Line identity ──────────────────────────────────────────────────────
const L = (type, description, o = {}) => ({ type, description, quantity: 1, unitPrice: null, amount: null, ...o });
(0, node_test_1.test)('line keys: Store parts by part type, Sundry as one, others by their meaningful words', () => {
    strict_1.default.equal((0, lines_core_1.lineKey)(L('STORE_PART', 'Brake Pads', { partTypeName: 'Brake Pads' })), 'STORE_PART:brake pads');
    strict_1.default.equal((0, lines_core_1.lineKey)(L('STORE_PART', 'whatever', { partTypeName: 'BRAKE  pads' })), 'STORE_PART:brake pads');
    strict_1.default.equal((0, lines_core_1.lineKey)(L('LABOUR', 'Labour for Brake')), (0, lines_core_1.lineKey)(L('LABOUR', 'brake labour')));
    strict_1.default.equal((0, lines_core_1.lineKey)(L('LABOUR', 'Labour for Brake')), 'LABOUR:brake');
    strict_1.default.equal((0, lines_core_1.lineKey)(L('SUNDRY', 'Rags and cleaner')), 'SUNDRY');
    strict_1.default.equal((0, lines_core_1.lineKey)(L('SUNDRY', 'Consumables')), 'SUNDRY');
    strict_1.default.equal((0, lines_core_1.lineKey)(L('INTERNAL_JOB', 'A/C gas refill')), (0, lines_core_1.lineKey)(L('INTERNAL_JOB', 'AC gas refill')));
    strict_1.default.notEqual((0, lines_core_1.lineKey)(L('INTERNAL_JOB', 'Wheel alignment')), (0, lines_core_1.lineKey)(L('LABOUR', 'Wheel alignment')));
    strict_1.default.equal((0, lines_core_1.lineKey)(L('LABOUR', 'Labour')), 'LABOUR');
});
// ── Statistics ─────────────────────────────────────────────────────────
(0, node_test_1.test)('median and percentiles (linear interpolation, as numpy)', () => {
    strict_1.default.equal((0, lines_core_1.median)([3, 1, 2]), 2);
    strict_1.default.equal((0, lines_core_1.median)([1, 2, 3, 4]), 2.5);
    strict_1.default.equal((0, lines_core_1.percentile)([10, 20, 30, 40, 50], 0.25), 20);
    strict_1.default.equal((0, lines_core_1.percentile)([10, 20, 30, 40], 0.75), 32.5);
    strict_1.default.equal((0, lines_core_1.percentile)([7], 0.25), 7);
    strict_1.default.ok(Number.isNaN((0, lines_core_1.median)([])));
});
// ── Aggregation ────────────────────────────────────────────────────────
const nb = (id, similarity, lines) => ({ id, kind: 'JOB_CARD', number: id, branchId: 'b1', similarity, lines });
(0, node_test_1.test)('needs at least 3 similar jobs, and says why when it has fewer', () => {
    strict_1.default.equal(lines_core_1.MIN_NEIGHBOURS, 3);
    const none = (0, lines_core_1.aggregateLines)([]);
    strict_1.default.equal(none.ok, false);
    if (!none.ok)
        strict_1.default.match(none.reason, /No similar finished jobs/);
    const two = (0, lines_core_1.aggregateLines)([nb('a', 0.9, [L('LABOUR', 'Labour', { amount: 1 })]), nb('b', 0.9, [L('LABOUR', 'Labour', { amount: 1 })])]);
    strict_1.default.equal(two.ok, false);
    if (!two.ok)
        strict_1.default.match(two.reason, /Only 2 similar finished jobs were found; at least 3/);
    const one = (0, lines_core_1.aggregateLines)([nb('a', 0.9, [])]);
    if (!one.ok)
        strict_1.default.match(one.reason, /Only 1 similar finished job was found/);
});
(0, node_test_1.test)('support, confidence, median quantity and the labour range', () => {
    const pads = (q) => L('STORE_PART', 'Brake Pads', { partTypeName: 'Brake Pads', categoryName: 'Brakes', quantity: q, unitPrice: 15000, amount: 15000 * q });
    const labour = (amount) => L('LABOUR', 'Labour for brake', { quantity: 1, unitPrice: amount, amount });
    const r = (0, lines_core_1.aggregateLines)([
        nb('j1', 0.9, [pads(2), labour(10000), L('SUNDRY', 'Rags', { amount: 500, unitPrice: 500 })]),
        nb('j2', 0.8, [pads(1), pads(1), labour(12000)]),
        nb('j3', 0.7, [pads(4), labour(20000), L('EXTERNAL_PART', 'Disc skimming', { amount: 8000, unitPrice: 8000 })]),
        nb('j4', 0.6, [labour(14000)]),
        nb('j5', 0.5, [L('SUNDRY', 'Brake cleaner', { amount: 700, unitPrice: 700 })]),
    ]);
    strict_1.default.equal(r.ok, true);
    if (!r.ok)
        return;
    const byKey = new Map(r.lines.map((l) => [l.key, l]));
    const p = byKey.get('STORE_PART:brake pads');
    strict_1.default.equal(p.support, 3);
    strict_1.default.equal(p.of, 5);
    // Two pad lines on one job count once, with their quantities added: 2, 2, 4.
    strict_1.default.equal(p.quantity, 2);
    strict_1.default.equal(p.unitPrice, null, 'Store parts are never priced from history');
    strict_1.default.equal(p.amount, null);
    strict_1.default.equal(p.categoryName, 'Brakes');
    strict_1.default.equal(p.confidence, Math.round(((0.9 + 0.8 + 0.7) / 3.5) * 1000) / 1000);
    const lab = byKey.get('LABOUR:brake');
    strict_1.default.equal(lab.support, 4);
    strict_1.default.deepEqual(lab.amount, { median: 13000, p25: 11500, p75: 15500 });
    strict_1.default.deepEqual(lab.unitPrice, { median: 13000, p25: 11500, p75: 15500 });
    strict_1.default.equal(lab.label, 'Labour for brake');
    // Sundry: 2 of 5 = 40% share, support 2 → just in.
    strict_1.default.equal(byKey.get('SUNDRY').support, 2);
    // The outside part appeared once: left out.
    strict_1.default.equal([...byKey.keys()].some((k) => k.startsWith('EXTERNAL_PART')), false);
    // Most confident first.
    strict_1.default.equal(r.lines[0].key, 'LABOUR:brake');
    strict_1.default.deepEqual(lab.evidence, ['j1', 'j2', 'j3', 'j4']);
});
(0, node_test_1.test)('a Vehicle Service prediction only uses the line types a service can hold', () => {
    const ext = L('EXTERNAL_JOB', 'Lathe work', { amount: 5000, unitPrice: 5000 });
    const r = (0, lines_core_1.aggregateLines)([nb('a', 0.9, [ext]), nb('b', 0.9, [ext]), nb('c', 0.9, [ext])], { allowedTypes: lines_core_1.SERVICE_LINE_TYPES });
    strict_1.default.equal(r.ok, false);
    if (!r.ok)
        strict_1.default.match(r.reason, /no line in common/);
});
// ── Precision and recall ───────────────────────────────────────────────
(0, node_test_1.test)('precision, recall and labour error against the approved estimate', () => {
    const predicted = [
        { key: 'STORE_PART:brake pads', type: 'STORE_PART', label: 'Brake Pads', amount: null },
        { key: 'LABOUR:brake', type: 'LABOUR', label: 'Labour for brake', amount: { median: 13000, p25: 11000, p75: 15000 } },
        { key: 'SUNDRY', type: 'SUNDRY', label: 'Rags', amount: { median: 500, p25: 500, p75: 500 } },
    ];
    const approved = [
        L('STORE_PART', 'Brake Pads', { partTypeName: 'Brake Pads', quantity: 2 }),
        L('LABOUR', 'Brake labour', { unitPrice: 15000, amount: 15000 }),
        L('STORE_PART', 'Brake Fluid', { partTypeName: 'Brake Fluid' }),
        L('INTERNAL_JOB', 'Brake bleeding', { amount: 3000 }),
    ];
    const c = (0, lines_core_1.compareLines)(predicted, approved);
    strict_1.default.deepEqual(c.kept.sort(), ['LABOUR:brake', 'STORE_PART:brake pads']);
    strict_1.default.equal(c.precision, 0.6667);
    strict_1.default.equal(c.recall, 0.5);
    strict_1.default.deepEqual(c.missed.map((m) => m.label).sort(), ['Brake Fluid', 'Brake bleeding']);
    strict_1.default.deepEqual(c.extra.map((m) => m.key), ['SUNDRY']);
    strict_1.default.deepEqual(c.labour, { predicted: 13000, approved: 15000, error: 2000 });
    const empty = (0, lines_core_1.compareLines)([], approved);
    strict_1.default.equal(empty.precision, null);
    strict_1.default.equal(empty.recall, 0);
    strict_1.default.deepEqual(empty.labour, { predicted: null, approved: 15000, error: 15000 });
    const nothingApproved = (0, lines_core_1.compareLines)(predicted, []);
    strict_1.default.equal(nothingApproved.recall, null);
    strict_1.default.equal(nothingApproved.precision, 0);
    strict_1.default.deepEqual((0, lines_core_1.compareLines)([], []).labour, { predicted: null, approved: null, error: null });
});
// ── Training export: no personal data ──────────────────────────────────
(0, node_test_1.test)('scrubbing removes emails, phones, plates, VINs, links and known names', () => {
    const s = (0, dataset_core_1.scrubText)('Mr Adebayo Okafor (adebayo.okafor@gmail.com, 0803 123 4567, +234-803-123-4567) says LSR-123-XY and KJA 456 AB shake at 80 km/h. VIN JTDBR32E720123456, see https://x.y/z. Okafor wants it today.', ['Adebayo Okafor']);
    for (const bad of ['Adebayo', 'Okafor', 'gmail', '0803', '4567', 'LSR-123-XY', 'KJA 456 AB', 'JTDBR32E720123456', 'https://'])
        strict_1.default.ok(!s.includes(bad), `${bad} left in: ${s}`);
    for (const kept of ['shake at 80 km/h', '[email]', '[phone]', '[plate]', '[vin]', '[name]', '[link]'])
        strict_1.default.ok(s.includes(kept), `${kept} missing: ${s}`);
    // Ordinary workshop text is left alone.
    strict_1.default.equal((0, dataset_core_1.scrubText)('AC not cooling at 50000 km since 2024'), 'AC not cooling at 50000 km since 2024');
    strict_1.default.equal((0, dataset_core_1.scrubText)('Brake pads worn, Hilux 2018'), 'Brake pads worn, Hilux 2018');
    strict_1.default.equal((0, dataset_core_1.scrubText)('E2E-001-AA brakes'), '[plate] brakes');
});
(0, node_test_1.test)('dataset rows carry only the declared columns — never names, contacts, plates or record ids', () => {
    const forbidden = ['customer', 'name', 'phone', 'email', 'plate', 'vin', 'chassis', 'engine_number', 'vehicle_id', 'customer_id', 'user', 'staff', 'job_number', 'service_number', 'address'];
    for (const c of dataset_core_1.DATASET_COLUMNS)
        for (const f of forbidden)
            strict_1.default.ok(!String(c).includes(f), `column ${String(c)} looks personal (${f})`);
    const row = {
        row_id: (0, dataset_core_1.opaqueId)('cjob123', 'salt'), kind: 'JOB_CARD', opened_on: '2026-05-01', branch_code: 'KWL-WS', complaint_text: (0, dataset_core_1.scrubText)('Ada Customer says AC not cooling, call 08031234567', ['Ada Customer']),
        make: 'Toyota', model: 'Corolla', year: 2018, mileage_band_km: (0, dataset_core_1.mileageBand)(82_345), vehicle_type: 'PASSENGER',
        lines: (0, dataset_core_1.datasetLines)([L('LABOUR', 'Labour for Ada', { amount: 5000, unitPrice: 5000 }), L('STORE_PART', 'x', { partTypeName: 'AC Gas', unitPrice: 9000, amount: 9000 })], ['Ada Customer']),
        labour_total: 5000, predicted_keys: ['LABOUR'], precision: 1, recall: 0.5, model_version: 'knn-tfidf-1',
        complaint_tokens: ['aircon', 'notcooling'], feature_tokens: ['kind:job', 'make:toyota'], work_numbers: { lines_total: 2 }, turnaround_hours: 26.5,
        // A field that must never go out, even if a future change adds it to the object.
        customerName: 'Ada Customer', plateNumber: 'E2E-001-AA',
    };
    const jsonl = (0, dataset_core_1.toJsonl)([row]);
    const csv = (0, dataset_core_1.toCsv)([row]);
    for (const out of [jsonl, csv]) {
        strict_1.default.ok(!out.includes('Ada'), out);
        strict_1.default.ok(!out.includes('Customer'), out);
        strict_1.default.ok(!out.includes('08031234567'), out);
        strict_1.default.ok(!out.includes('E2E-001-AA'), out);
        strict_1.default.ok(!out.includes('cjob123'), out);
    }
    strict_1.default.deepEqual(Object.keys(JSON.parse(jsonl.trim())), [...dataset_core_1.DATASET_COLUMNS]);
    strict_1.default.deepEqual(Object.keys((0, dataset_core_1.pickColumns)(row)), [...dataset_core_1.DATASET_COLUMNS]);
    strict_1.default.equal((0, dataset_core_1.mileageBand)(82_345), 80_000);
    strict_1.default.equal((0, dataset_core_1.mileageBand)(null), null);
    // Store part prices are never exported from history.
    const parsed = JSON.parse(jsonl.trim());
    strict_1.default.equal(parsed.lines[1].unit_price, null);
    strict_1.default.equal(parsed.lines[1].key, 'STORE_PART:ac gas');
    // CSV: one header + one row; formulas neutralised.
    strict_1.default.equal(csv.trim().split('\n').length, 2);
    strict_1.default.match((0, dataset_core_1.toCsv)([{ ...row, complaint_text: '=HYPERLINK("x")' }]), /"'=HYPERLINK\(""x""\)"/);
    // Row ids differ between exports (salted) and never equal the record id.
    strict_1.default.notEqual((0, dataset_core_1.opaqueId)('cjob123', 'a'), (0, dataset_core_1.opaqueId)('cjob123', 'b'));
});
(0, node_test_1.test)('the export reader selects no personal columns from the database', () => {
    const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '..', '..', 'lib', 'enyo', 'predict', 'dataset.ts'), 'utf8');
    for (const col of ['plateNumber', 'chassisNumber', 'engineNumber', 'email:', 'phone:', 'address'])
        strict_1.default.ok(!src.includes(col), `dataset.ts reads ${col}`);
    // Names are read only to be scrubbed out of free text.
    strict_1.default.match(src, /scrubText\(/);
});
// ── Learning page figures ──────────────────────────────────────────────
(0, node_test_1.test)('learning summary: weekly precision/recall, kept vs missed, labour error, most-missed lines', async () => {
    const { summarise, promotionProgress, lagosWeekStart, PROMOTION_RULE } = await Promise.resolve().then(() => __importStar(require('../lib/enyo/predict/learning-core')));
    const now = new Date('2026-10-14T12:00:00Z'); // Wednesday
    // Monday 12 Oct 2026, 00:00 Lagos = 11 Oct 23:00 UTC.
    strict_1.default.equal(lagosWeekStart(now).toISOString(), '2026-10-11T23:00:00.000Z');
    // Sunday 23:30 Lagos still belongs to the week before.
    strict_1.default.equal(lagosWeekStart(new Date('2026-10-11T22:30:00Z')).toISOString(), '2026-10-04T23:00:00.000Z');
    const outcome = (kept, missed, extra, error) => ({
        kept: Array.from({ length: kept }, (_, i) => `k${i}`),
        missed: missed.map((m) => ({ key: `STORE_PART:${m.toLowerCase()}`, type: 'STORE_PART', label: m })),
        extra: Array.from({ length: extra }, (_, i) => ({ key: `x${i}` })),
        labour: { error },
    });
    const s = summarise([
        { resolvedAt: new Date('2026-10-13T09:00:00Z'), precision: 1, recall: 0.5, outcome: outcome(2, ['Brake Fluid', 'Brake Fluid'], 0, 2000) },
        { resolvedAt: new Date('2026-10-12T09:00:00Z'), precision: 0.5, recall: 1, outcome: outcome(1, [], 1, 4000) },
        { resolvedAt: new Date('2026-10-06T09:00:00Z'), precision: null, recall: null, outcome: outcome(0, ['Brake Fluid', 'Wiper'], 0, null) },
        { resolvedAt: new Date('2025-01-01T09:00:00Z'), precision: 0, recall: 0, outcome: outcome(0, [], 0, null) },
    ], now, 12);
    strict_1.default.equal(s.weeks.length, 12);
    const thisWeek = s.weeks[11];
    strict_1.default.equal(thisWeek.start, '2026-10-12');
    strict_1.default.equal(thisWeek.label, '12 Oct');
    strict_1.default.equal(thisWeek.resolved, 2);
    strict_1.default.equal(thisWeek.precision, 75);
    strict_1.default.equal(thisWeek.recall, 75);
    strict_1.default.equal(thisWeek.labourError, 3000);
    const lastWeek = s.weeks[10];
    strict_1.default.equal(lastWeek.resolved, 1);
    strict_1.default.equal(lastWeek.precision, null, 'a job Enyo had nothing to suggest for is not counted for accuracy');
    strict_1.default.equal(s.weeks[0].resolved, 0);
    strict_1.default.equal(s.kept, 3);
    strict_1.default.equal(s.extra, 1);
    strict_1.default.equal(s.missed, 4);
    strict_1.default.deepEqual(s.mostMissed[0], { label: 'Brake Fluid', type: 'STORE_PART', count: 3 });
    strict_1.default.deepEqual(s.labour, { meanError: 3000, samples: 2 });
    strict_1.default.deepEqual(PROMOTION_RULE, { minResolved: 200, minPrecision: 0.7 });
    const early = promotionProgress(50, 0.82);
    strict_1.default.equal(early.progress, 0.25);
    strict_1.default.equal(early.ready, false);
    strict_1.default.equal(early.accurate, true);
    strict_1.default.equal(promotionProgress(240, 0.65).ready, false);
    strict_1.default.equal(promotionProgress(240, 0.71).ready, true);
    strict_1.default.equal(promotionProgress(0, null).accurate, false);
});
(0, node_test_1.test)('data quality: test and keyboard-mash complaints are recognised; real ones, short or long, are kept', () => {
    for (const junk of ['test', 'Testing 123', 'asdf', 'asdfghjkl', 'qwerty qwerty', 'hello', 'xxxx', 'sdfgh jklmn', '...', '[name] [phone]', 'aaaaaa', 'demo demo']) {
        strict_1.default.notEqual((0, dataset_core_1.complaintQuality)(junk), 'ok', junk);
    }
    strict_1.default.equal((0, dataset_core_1.complaintQuality)(''), 'empty');
    for (const real of ['Noise', 'AC', 'A/C', 'Check AC', 'TPMS', '4WD', 'ABS light', 'Brake noise when stopping', 'AC not cooling', 'Check engine light on, car jerks', 'General service at 50,000 km', 'Vibration at high speed', 'Ẹ̀rọ náà ń pariwo', 'Le moteur chauffe']) {
        strict_1.default.equal((0, dataset_core_1.complaintQuality)(real), 'ok', real);
    }
    strict_1.default.ok((0, dataset_core_1.isMash)('qwertyuiop') && (0, dataset_core_1.isMash)('zzzz') && !(0, dataset_core_1.isMash)('strength') && !(0, dataset_core_1.isMash)('brakes'));
    strict_1.default.equal((0, dataset_core_1.plausibleYear)(2019, new Date('2026-01-01')), 2019);
    strict_1.default.equal((0, dataset_core_1.plausibleYear)(1900), null);
    strict_1.default.equal((0, dataset_core_1.plausibleYear)(2099, new Date('2026-01-01')), null);
});
(0, node_test_1.test)('data quality: the filter drops junk, impossible lines and duplicates, blanks impossible job times, and reports why', () => {
    const line = { type: 'LABOUR', key: 'labour:brake service', label: 'Brake service', quantity: 1, unit_price: 15000, amount: 15000 };
    const base = { row_id: 'a', kind: 'JOB_CARD', opened_on: '2026-03-02', branch_code: 'LAG', complaint_text: 'Brake noise', make: 'Toyota', model: 'Corolla', year: 2018, mileage_band_km: 50000, vehicle_type: 'CAR', lines: [line], labour_total: 15000, predicted_keys: null, precision: null, recall: null, model_version: null, complaint_tokens: ['brake', 'noise'], feature_tokens: [], work_numbers: {}, turnaround_hours: 26 };
    const rows = [
        { ...base, vehicle_key: 'v1' },
        { ...base, row_id: 'dup', vehicle_key: 'v1' },
        { ...base, row_id: 'fleet', vehicle_key: 'v2' },
        { ...base, row_id: 'service', kind: 'SERVICE', complaint_text: '', vehicle_key: 'v3' },
        { ...base, row_id: 'junk', complaint_text: 'test test' },
        { ...base, row_id: 'empty', complaint_text: '' },
        { ...base, row_id: 'neg', complaint_text: 'Oil leak', lines: [{ ...line, quantity: -2 }] },
        { ...base, row_id: 'nolines', complaint_text: 'Oil leak', lines: [] },
        { ...base, row_id: 'quick', complaint_text: 'Wiper blade', turnaround_hours: 0.1 },
    ];
    const { rows: kept, report } = (0, dataset_core_1.qualityFilter)(rows);
    // Fleet vans serviced alike stay; a routine service without a complaint stays; the in-memory key never leaves.
    strict_1.default.deepEqual(kept.map((r) => r.row_id), ['a', 'fleet', 'service', 'quick']);
    strict_1.default.equal(kept[3].turnaround_hours, null);
    strict_1.default.ok(kept.every((r) => !('vehicle_key' in r)));
    strict_1.default.deepEqual(report, { examined: 9, kept: 4, dropped: { no_complaint: 1, test_or_junk_text: 1, impossible_line: 2, duplicate: 1 }, blanked: { turnaround_too_short: 1 } });
});
(0, node_test_1.test)('learn-from day: every learning path respects it (similar jobs, training rows, trainer datasets)', () => {
    const read = (f) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '..', '..', f), 'utf8');
    strict_1.default.match(read('lib/enyo/predict/similar.ts'), /learningSince\(scope\.organisationId/);
    strict_1.default.match(read('lib/enyo/predict/dataset.ts'), /learningSince\(scope\.organisationId/);
    strict_1.default.match(read('lib/enyo/predict/dataset.ts'), /qualityFilter\(out\)/);
    strict_1.default.match(read('lib/enyo/ml/service.ts'), /learningSince\(organisationId/);
});
