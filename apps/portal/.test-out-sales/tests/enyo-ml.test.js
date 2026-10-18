"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const artifact_core_1 = require("../lib/enyo/ml/artifact-core");
const runtime_core_1 = require("../lib/enyo/ml/runtime-core");
const features_core_1 = require("../lib/enyo/ml/features-core");
const capabilities_1 = require("../lib/enyo/ml/capabilities");
const upload_core_1 = require("../lib/enyo/ml/upload-core");
const datasets_core_1 = require("../lib/enyo/ml/datasets-core");
const dataset_core_1 = require("../lib/enyo/predict/dataset-core");
const decisions_core_1 = require("../lib/insights/decisions-core");
/** The parity fixtures written by the Python trainer (ml/ejo_ml/fixtures.py). */
const FIX = (0, node_path_1.join)(__dirname, '..', '..', '..', '..', 'ml', 'fixtures');
const fixture = (name) => JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(FIX, name), 'utf8'));
const near = (got, want, what) => {
    const tol = 1e-9 + 1e-9 * Math.abs(want);
    strict_1.default.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, Python ${want}`);
};
(0, node_test_1.test)('parity: job duration (LightGBM quantile trees) matches the trainer', () => {
    const f = fixture('job_duration.json');
    const a = (0, artifact_core_1.validateArtifact)('JOB_DURATION', f.artifact);
    strict_1.default.ok(f.cases.length >= 20);
    for (const [i, c] of f.cases.entries()) {
        const got = (0, runtime_core_1.predictDuration)(a, c.input);
        near(got.p10, c.expected.p10, `case ${i} p10`);
        near(got.p50, c.expected.p50, `case ${i} p50`);
        near(got.p90, c.expected.p90, `case ${i} p90`);
        strict_1.default.ok(got.p10 <= got.p50 && got.p50 <= got.p90);
    }
});
(0, node_test_1.test)('parity: estimate lines (logistic regression) match the trainer', () => {
    const f = fixture('estimate_lines.json');
    const a = (0, artifact_core_1.validateArtifact)('ESTIMATE_LINES', f.artifact);
    for (const [i, c] of f.cases.entries()) {
        const got = (0, runtime_core_1.lineProbabilities)(a, c.input.tokens);
        strict_1.default.equal(got.length, c.expected.probabilities.length);
        got.forEach((p, k) => near(p, c.expected.probabilities[k], `case ${i} label ${k}`));
    }
});
(0, node_test_1.test)('parity: price anomalies (isolation forest) match the trainer; a tenfold price is flagged', () => {
    const f = fixture('price_anomaly.json');
    const a = (0, artifact_core_1.validateArtifact)('PRICE_ANOMALY', f.artifact);
    for (const [i, c] of f.cases.entries())
        near((0, runtime_core_1.checkPrice)(a, c.input).score, c.expected.score, `case ${i}`);
    const tenfold = f.cases.at(-2);
    strict_1.default.equal((0, runtime_core_1.checkPrice)(a, tenfold.input).unusual, true);
    strict_1.default.equal((0, runtime_core_1.checkPrice)(a, { key: 'never-seen', unitPrice: 1000, quantity: 1 }), null);
});
(0, node_test_1.test)('parity: complaint themes and parts reorder suggestions match the trainer', () => {
    const t = fixture('complaint_themes.json');
    const ta = (0, artifact_core_1.validateArtifact)('COMPLAINT_THEMES', t.artifact);
    for (const [i, c] of t.cases.entries()) {
        const got = (0, runtime_core_1.themeOf)(ta, c.input.tokens);
        if (c.expected.index === null)
            strict_1.default.equal(got, null, `case ${i}`);
        else {
            strict_1.default.equal(got?.index, c.expected.index, `case ${i}`);
            near(got.similarity, c.expected.similarity, `case ${i} similarity`);
        }
    }
    const d = fixture('parts_demand.json');
    const da = (0, artifact_core_1.validateArtifact)('PARTS_DEMAND', d.artifact);
    const c = d.cases[0];
    const got = (0, runtime_core_1.reorderSuggestions)(da, new Map(Object.entries(c.input.onHand))).map((s) => `${s.partId}:${s.suggestedQuantity}`).sort();
    strict_1.default.deepEqual(got, c.expected.suggestions.map((s) => `${s.partId}:${s.suggestedQuantity}`).sort());
    strict_1.default.ok(got.length > 0);
});
(0, node_test_1.test)('uploads: malformed models are refused with a reason, never stored half-checked', () => {
    const good = fixture('estimate_lines.json').artifact;
    const bad = (task, a, msg) => strict_1.default.throws(() => (0, artifact_core_1.validateArtifact)(task, a), (e) => e instanceof artifact_core_1.ArtifactError && msg.test(e.message));
    bad('ESTIMATE_LINES', { ...good, format: 'other' }, /format/);
    bad('JOB_DURATION', good, /different task/);
    bad('ESTIMATE_LINES', { ...good, threshold: Number.NaN }, /finite/);
    bad('ESTIMATE_LINES', { ...good, intercepts: [] }, /differ in length/);
    const tf = good.tfidf;
    bad('ESTIMATE_LINES', { ...good, tfidf: { vocab: tf.vocab, idf: tf.idf.slice(1) } }, /differ in length/);
    // A tree whose child points backwards (a loop) is refused.
    const dur = fixture('job_duration.json').artifact;
    const loop = JSON.parse(JSON.stringify(dur));
    const tree = loop.quantiles.p50.find((t) => t.nodes.length > 1);
    tree.nodes[1].l = 0;
    bad('JOB_DURATION', loop, /does not follow/);
    bad('PRICE_ANOMALY', null, /not an object/);
});
(0, node_test_1.test)('trees: LightGBM missing-value rules', () => {
    const tree = { nodes: [{ f: 0, t: 1.5, l: -1, r: -2, d: true, m: 2 }], leaves: [10, 20] };
    strict_1.default.equal((0, runtime_core_1.leafOf)(tree, () => 1), 0);
    strict_1.default.equal((0, runtime_core_1.leafOf)(tree, () => 2), 1);
    strict_1.default.equal((0, runtime_core_1.leafOf)(tree, () => Number.NaN), 0); // NaN → default left
    const zero = { nodes: [{ f: 0, t: -1, l: -1, r: -2, d: true, m: 1 }], leaves: [1, 2] };
    strict_1.default.equal((0, runtime_core_1.leafOf)(zero, () => 0), 0); // zero as missing → default left, although 0 > -1
    strict_1.default.equal((0, runtime_core_1.leafOf)({ nodes: [], leaves: [7] }, () => 0), 0);
    strict_1.default.equal((0, runtime_core_1.averagePathLength)(1), 0);
    strict_1.default.equal((0, runtime_core_1.averagePathLength)(2), 1);
});
(0, node_test_1.test)('features: the context tokens and numbers every model sees', () => {
    const at = new Date('2026-10-15T09:00:00Z');
    strict_1.default.deepEqual((0, features_core_1.featureTokens)({ kind: 'JOB_CARD', complaint: '', make: 'Toyota', model: 'Hilux Revo 2.8', year: 2019, mileageKm: 128_400, vehicleType: 'PICKUP', branchCode: 'ISL', department: 'Mechanical', openedAt: at }), ['kind:job', 'make:toyota', 'family:toyota_hilux', 'age:6_10', 'km:125000', 'vtype:pickup', 'branch:isl', 'dept:mechanical']);
    strict_1.default.deepEqual((0, features_core_1.featureTokens)({ kind: 'SERVICE', complaint: '', make: null, model: null, year: null, mileageKm: null, vehicleType: null, branchCode: null, department: null, openedAt: at }), ['kind:service']);
    strict_1.default.equal((0, features_core_1.ageBand)(2030, at), null);
    strict_1.default.equal((0, features_core_1.mileageToken)(900_000), '300000');
    strict_1.default.deepEqual((0, features_core_1.lineTokens)([{ type: 'LABOUR', key: 'LABOUR:brake', quantity: 1 }, { type: 'LABOUR', key: 'LABOUR:brake', quantity: 1 }]), ['line:LABOUR:brake']);
    const n = (0, features_core_1.workNumbers)('Brake pads squealing', [{ type: 'STORE_PART', key: 'STORE_PART:brake pad', quantity: 2 }, { type: 'LABOUR', key: 'LABOUR:brake', quantity: 1 }]);
    strict_1.default.equal(n.lines_total, 2);
    strict_1.default.equal(n.lines_store_part, 1);
    strict_1.default.equal(n.parts_quantity, 2);
});
(0, node_test_1.test)('ladder: stored levels are checked against what each capability allows; none goes past Assist yet', () => {
    const l = (0, capabilities_1.readLevels)({ JOB_DURATION: 'ASSIST', PRICE_ANOMALY: 'FULL', PARTS_DEMAND: 'SHADOW', COMPLAINT_THEMES: 'OFF', NOT_A_THING: 'ASSIST' });
    strict_1.default.equal(l.JOB_DURATION, 'ASSIST');
    strict_1.default.equal(l.PRICE_ANOMALY, 'SHADOW'); // FULL not allowed → its initial level
    strict_1.default.equal(l.PARTS_DEMAND, 'ASSIST'); // SHADOW not offered for an insight → initial
    strict_1.default.equal(l.COMPLAINT_THEMES, 'OFF');
    strict_1.default.deepEqual((0, capabilities_1.readLevels)('junk'), (0, capabilities_1.readLevels)(null));
    for (const c of capabilities_1.CAPABILITIES)
        strict_1.default.ok(!c.levels.includes('PARTIAL') && !c.levels.includes('FULL'), `${c.key} never acts by itself`);
});
(0, node_test_1.test)('uploads: the trainer\'s payload is checked field by field', () => {
    const artifact = fixture('complaint_themes.json').artifact;
    const good = { organisation: 'kewalram-nigeria', task: 'COMPLAINT_THEMES', version: 'complaint-themes-tfidf-kmeans-20261015-abc123', algorithm: 'tfidf-kmeans', metrics: { rows: 600 }, baseline: null, gate: { passed: true, reasons: ['ok'] }, artifact, rows: 600, dataFrom: '2024-01-08', dataTo: '2025-10-01', trainer: 'ejo-ml 0.1.0', trainedAt: '2026-10-15T01:00:00Z' };
    const now = new Date('2026-10-15T02:00:00Z');
    const up = (0, upload_core_1.parseUpload)(good, JSON.stringify(good).length, now);
    strict_1.default.equal(up.task, 'COMPLAINT_THEMES');
    strict_1.default.ok(up.artifactBytes > 0);
    const bad = (patch, msg) => strict_1.default.throws(() => (0, upload_core_1.parseUpload)({ ...good, ...patch }, 1000, now), (e) => e instanceof upload_core_1.UploadError && msg.test(e.message));
    bad({ organisation: 'Kewalram Nigeria' }, /slug/);
    bad({ task: 'EVERYTHING' }, /task must be/);
    bad({ version: 'x' }, /version/);
    bad({ trainedAt: '2027-01-01T00:00:00Z' }, /future/);
    bad({ dataFrom: '2026-01-01', dataTo: '2025-01-01' }, /after/);
    bad({ gate: { passed: 'yes', reasons: [] } }, /gate/);
    bad({ artifact: { format: 'ejo-ml/1', task: 'COMPLAINT_THEMES' } }, /not valid/);
    strict_1.default.throws(() => (0, upload_core_1.parseUpload)(good, 9_000_000, now), /too large/);
});
(0, node_test_1.test)('parts dataset: consumption becomes complete Lagos weeks, oldest first, zeros for unused parts', () => {
    const now = new Date('2026-10-15T09:00:00Z'); // a Thursday
    const last = (0, datasets_core_1.lastCompleteWeek)(now);
    strict_1.default.equal(new Date(last.getTime() + 3_600_000).toISOString().slice(0, 10), '2026-10-05');
    const rows = (0, datasets_core_1.weeklySeries)(['a', 'b'], [
        { partId: 'a', at: new Date('2026-10-06T10:00:00Z'), quantity: 2 },
        { partId: 'a', at: new Date('2026-10-11T22:30:00Z'), quantity: 1.5 }, // Sunday 11:30 pm Lagos: same week
        { partId: 'a', at: new Date('2026-10-12T00:30:00Z'), quantity: 9 }, // Monday 1:30 am Lagos: this week, not complete — ignored
        { partId: 'a', at: new Date('2026-09-29T08:00:00Z'), quantity: 4 },
        { partId: 'zzz', at: new Date('2026-10-06T10:00:00Z'), quantity: 5 },
    ], 4, now);
    strict_1.default.deepEqual(rows.map((r) => r.part_id), ['a', 'b']);
    strict_1.default.deepEqual(rows[0].weekly, [0, 0, 4, 3.5]);
    strict_1.default.deepEqual(rows[1].weekly, [0, 0, 0, 0]);
    strict_1.default.equal(rows[0].as_of, '2026-10-05');
});
(0, node_test_1.test)('turnaround: hours from opening to ready, only when it makes sense', () => {
    const open = new Date('2026-10-01T08:00:00Z');
    strict_1.default.equal((0, dataset_core_1.turnaroundHours)(open, new Date('2026-10-02T10:30:00Z')), 26.5);
    strict_1.default.equal((0, dataset_core_1.turnaroundHours)(open, null), null);
    strict_1.default.equal((0, dataset_core_1.turnaroundHours)(open, new Date('2026-09-30T08:00:00Z')), null);
    strict_1.default.equal((0, dataset_core_1.turnaroundHours)(open, new Date('2027-10-01T08:00:00Z')), null);
});
(0, node_test_1.test)('parts weeks after a learn-from day: only whole Lagos weeks wholly on or after it', () => {
    const monday = new Date('2026-10-12T00:00:00+01:00');
    // Friday of the same week: no complete week since the Monday yet.
    strict_1.default.equal((0, datasets_core_1.completeWeeksSince)(monday, new Date('2026-10-16T12:00:00+01:00')), 0);
    // The following Tuesday: the week of 12–18 October is complete.
    strict_1.default.equal((0, datasets_core_1.completeWeeksSince)(monday, new Date('2026-10-20T12:00:00+01:00')), 1);
    // Starting mid-week: that partial week never counts.
    const wednesday = new Date('2026-10-14T00:00:00+01:00');
    strict_1.default.equal((0, datasets_core_1.completeWeeksSince)(wednesday, new Date('2026-10-28T12:00:00+01:00')), 1);
    strict_1.default.equal((0, datasets_core_1.completeWeeksSince)(wednesday, new Date('2026-11-03T12:00:00+01:00')), 2);
});
(0, node_test_1.test)('parity: the decision model (LightGBM + isotonic calibration) matches the trainer', () => {
    const f = fixture('decision_risk.json');
    const a = (0, artifact_core_1.validateArtifact)('DECISION_RISK', f.artifact);
    strict_1.default.deepEqual(a.features, (0, decisions_core_1.featureNames)(a.steps, a.roles));
    strict_1.default.ok(f.cases.length >= 40);
    for (const [i, c] of f.cases.entries()) {
        const p = (0, runtime_core_1.decisionRisk)(a, (0, decisions_core_1.decisionFeatures)(c.input, a.steps, a.roles));
        near(p, c.expected.probability, `case ${i}`);
        strict_1.default.ok(p >= 0 && p <= 1);
    }
    // The table is linear between points and clipped at the ends.
    strict_1.default.equal((0, runtime_core_1.interpolate)([0, 1], [0.1, 0.5], -3), 0.1);
    strict_1.default.equal((0, runtime_core_1.interpolate)([0, 1], [0.1, 0.5], 9), 0.5);
    near((0, runtime_core_1.interpolate)([0, 1, 3], [0.1, 0.5, 0.9], 2), 0.7, 'midpoint');
    // Features that do not follow the steps and roles, or a falling calibration, are refused.
    const art = f.artifact;
    strict_1.default.throws(() => (0, artifact_core_1.validateArtifact)('DECISION_RISK', { ...art, features: ['x'] }), artifact_core_1.ArtifactError);
    strict_1.default.throws(() => (0, artifact_core_1.validateArtifact)('DECISION_RISK', { ...art, calibration: { x: [0, 1], y: [0.6, 0.2] } }), /must not decrease/);
    strict_1.default.throws(() => (0, artifact_core_1.validateArtifact)('DECISION_RISK', { ...art, roles: ['Bad Role!'] }), /not a step or role key/);
});
