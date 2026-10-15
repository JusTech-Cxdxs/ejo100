import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ArtifactError, validateArtifact, type AnomalyArtifact, type DemandArtifact, type DurationArtifact, type LinesArtifact, type MlTask, type ThemesArtifact } from '../lib/enyo/ml/artifact-core';
import { averagePathLength, checkPrice, leafOf, lineProbabilities, predictDuration, reorderSuggestions, themeOf } from '../lib/enyo/ml/runtime-core';
import { ageBand, featureTokens, lineTokens, mileageToken, workNumbers } from '../lib/enyo/ml/features-core';
import { readLevels, CAPABILITIES } from '../lib/enyo/ml/capabilities';
import { parseUpload, UploadError } from '../lib/enyo/ml/upload-core';
import { completeWeeksSince, lastCompleteWeek, weeklySeries } from '../lib/enyo/ml/datasets-core';
import { turnaroundHours } from '../lib/enyo/predict/dataset-core';

/** The parity fixtures written by the Python trainer (ml/ejo_ml/fixtures.py). */
const FIX = join(__dirname, '..', '..', '..', '..', 'ml', 'fixtures');
const fixture = <T>(name: string) => JSON.parse(readFileSync(join(FIX, name), 'utf8')) as { artifact: unknown; cases: T[] };

const near = (got: number, want: number, what: string) => {
  const tol = 1e-9 + 1e-9 * Math.abs(want);
  assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, Python ${want}`);
};

test('parity: job duration (LightGBM quantile trees) matches the trainer', () => {
  const f = fixture<{ input: { tokens: string[]; numbers: Record<string, number> }; expected: { p10: number; p50: number; p90: number } }>('job_duration.json');
  const a = validateArtifact('JOB_DURATION', f.artifact) as DurationArtifact;
  assert.ok(f.cases.length >= 20);
  for (const [i, c] of f.cases.entries()) {
    const got = predictDuration(a, c.input);
    near(got.p10, c.expected.p10, `case ${i} p10`);
    near(got.p50, c.expected.p50, `case ${i} p50`);
    near(got.p90, c.expected.p90, `case ${i} p90`);
    assert.ok(got.p10 <= got.p50 && got.p50 <= got.p90);
  }
});

test('parity: estimate lines (logistic regression) match the trainer', () => {
  const f = fixture<{ input: { tokens: string[] }; expected: { probabilities: number[] } }>('estimate_lines.json');
  const a = validateArtifact('ESTIMATE_LINES', f.artifact) as LinesArtifact;
  for (const [i, c] of f.cases.entries()) {
    const got = lineProbabilities(a, c.input.tokens);
    assert.equal(got.length, c.expected.probabilities.length);
    got.forEach((p, k) => near(p, c.expected.probabilities[k]!, `case ${i} label ${k}`));
  }
});

test('parity: price anomalies (isolation forest) match the trainer; a tenfold price is flagged', () => {
  const f = fixture<{ input: { key: string; unitPrice: number; quantity: number }; expected: { score: number } }>('price_anomaly.json');
  const a = validateArtifact('PRICE_ANOMALY', f.artifact) as AnomalyArtifact;
  for (const [i, c] of f.cases.entries()) near(checkPrice(a, c.input)!.score, c.expected.score, `case ${i}`);
  const tenfold = f.cases.at(-2)!;
  assert.equal(checkPrice(a, tenfold.input)!.unusual, true);
  assert.equal(checkPrice(a, { key: 'never-seen', unitPrice: 1000, quantity: 1 }), null);
});

test('parity: complaint themes and parts reorder suggestions match the trainer', () => {
  const t = fixture<{ input: { tokens: string[] }; expected: { index: number | null; similarity: number | null } }>('complaint_themes.json');
  const ta = validateArtifact('COMPLAINT_THEMES', t.artifact) as ThemesArtifact;
  for (const [i, c] of t.cases.entries()) {
    const got = themeOf(ta, c.input.tokens);
    if (c.expected.index === null) assert.equal(got, null, `case ${i}`);
    else {
      assert.equal(got?.index, c.expected.index, `case ${i}`);
      near(got!.similarity, c.expected.similarity!, `case ${i} similarity`);
    }
  }
  const d = fixture<{ input: { onHand: Record<string, number> }; expected: { suggestions: { partId: string; suggestedQuantity: number }[] } }>('parts_demand.json');
  const da = validateArtifact('PARTS_DEMAND', d.artifact) as DemandArtifact;
  const c = d.cases[0]!;
  const got = reorderSuggestions(da, new Map(Object.entries(c.input.onHand))).map((s) => `${s.partId}:${s.suggestedQuantity}`).sort();
  assert.deepEqual(got, c.expected.suggestions.map((s) => `${s.partId}:${s.suggestedQuantity}`).sort());
  assert.ok(got.length > 0);
});

test('uploads: malformed models are refused with a reason, never stored half-checked', () => {
  const good = fixture<unknown>('estimate_lines.json').artifact as Record<string, unknown>;
  const bad = (task: MlTask, a: unknown, msg: RegExp) => assert.throws(() => validateArtifact(task, a), (e: unknown) => e instanceof ArtifactError && msg.test(e.message));
  bad('ESTIMATE_LINES', { ...good, format: 'other' }, /format/);
  bad('JOB_DURATION', good, /different task/);
  bad('ESTIMATE_LINES', { ...good, threshold: Number.NaN }, /finite/);
  bad('ESTIMATE_LINES', { ...good, intercepts: [] }, /differ in length/);
  const tf = good.tfidf as { vocab: string[]; idf: number[] };
  bad('ESTIMATE_LINES', { ...good, tfidf: { vocab: tf.vocab, idf: tf.idf.slice(1) } }, /differ in length/);
  // A tree whose child points backwards (a loop) is refused.
  const dur = fixture<unknown>('job_duration.json').artifact as DurationArtifact;
  const loop = JSON.parse(JSON.stringify(dur)) as DurationArtifact;
  const tree = loop.quantiles.p50.find((t) => t.nodes.length > 1)!;
  tree.nodes[1]!.l = 0;
  bad('JOB_DURATION', loop, /does not follow/);
  bad('PRICE_ANOMALY', null, /not an object/);
});

test('trees: LightGBM missing-value rules', () => {
  const tree = { nodes: [{ f: 0, t: 1.5, l: -1, r: -2, d: true, m: 2 as const }], leaves: [10, 20] };
  assert.equal(leafOf(tree, () => 1), 0);
  assert.equal(leafOf(tree, () => 2), 1);
  assert.equal(leafOf(tree, () => Number.NaN), 0); // NaN → default left
  const zero = { nodes: [{ f: 0, t: -1, l: -1, r: -2, d: true, m: 1 as const }], leaves: [1, 2] };
  assert.equal(leafOf(zero, () => 0), 0); // zero as missing → default left, although 0 > -1
  assert.equal(leafOf({ nodes: [], leaves: [7] }, () => 0), 0);
  assert.equal(averagePathLength(1), 0);
  assert.equal(averagePathLength(2), 1);
});

test('features: the context tokens and numbers every model sees', () => {
  const at = new Date('2026-10-15T09:00:00Z');
  assert.deepEqual(
    featureTokens({ kind: 'JOB_CARD', complaint: '', make: 'Toyota', model: 'Hilux Revo 2.8', year: 2019, mileageKm: 128_400, vehicleType: 'PICKUP', branchCode: 'ISL', department: 'Mechanical', openedAt: at }),
    ['kind:job', 'make:toyota', 'family:toyota_hilux', 'age:6_10', 'km:125000', 'vtype:pickup', 'branch:isl', 'dept:mechanical'],
  );
  assert.deepEqual(featureTokens({ kind: 'SERVICE', complaint: '', make: null, model: null, year: null, mileageKm: null, vehicleType: null, branchCode: null, department: null, openedAt: at }), ['kind:service']);
  assert.equal(ageBand(2030, at), null);
  assert.equal(mileageToken(900_000), '300000');
  assert.deepEqual(lineTokens([{ type: 'LABOUR', key: 'LABOUR:brake', quantity: 1 }, { type: 'LABOUR', key: 'LABOUR:brake', quantity: 1 }]), ['line:LABOUR:brake']);
  const n = workNumbers('Brake pads squealing', [{ type: 'STORE_PART', key: 'STORE_PART:brake pad', quantity: 2 }, { type: 'LABOUR', key: 'LABOUR:brake', quantity: 1 }]);
  assert.equal(n.lines_total, 2);
  assert.equal(n.lines_store_part, 1);
  assert.equal(n.parts_quantity, 2);
});


test('ladder: stored levels are checked against what each capability allows; none goes past Assist yet', () => {
  const l = readLevels({ JOB_DURATION: 'ASSIST', PRICE_ANOMALY: 'FULL', PARTS_DEMAND: 'SHADOW', COMPLAINT_THEMES: 'OFF', NOT_A_THING: 'ASSIST' });
  assert.equal(l.JOB_DURATION, 'ASSIST');
  assert.equal(l.PRICE_ANOMALY, 'SHADOW'); // FULL not allowed → its initial level
  assert.equal(l.PARTS_DEMAND, 'ASSIST'); // SHADOW not offered for an insight → initial
  assert.equal(l.COMPLAINT_THEMES, 'OFF');
  assert.deepEqual(readLevels('junk'), readLevels(null));
  for (const c of CAPABILITIES) assert.ok(!c.levels.includes('PARTIAL') && !c.levels.includes('FULL'), `${c.key} never acts by itself`);
});

test('uploads: the trainer\'s payload is checked field by field', () => {
  const artifact = fixture<unknown>('complaint_themes.json').artifact;
  const good = { organisation: 'kewalram-nigeria', task: 'COMPLAINT_THEMES', version: 'complaint-themes-tfidf-kmeans-20261015-abc123', algorithm: 'tfidf-kmeans', metrics: { rows: 600 }, baseline: null, gate: { passed: true, reasons: ['ok'] }, artifact, rows: 600, dataFrom: '2024-01-08', dataTo: '2025-10-01', trainer: 'ejo-ml 0.1.0', trainedAt: '2026-10-15T01:00:00Z' };
  const now = new Date('2026-10-15T02:00:00Z');
  const up = parseUpload(good, JSON.stringify(good).length, now);
  assert.equal(up.task, 'COMPLAINT_THEMES');
  assert.ok(up.artifactBytes > 0);
  const bad = (patch: Record<string, unknown>, msg: RegExp) => assert.throws(() => parseUpload({ ...good, ...patch }, 1000, now), (e: unknown) => e instanceof UploadError && msg.test(e.message));
  bad({ organisation: 'Kewalram Nigeria' }, /slug/);
  bad({ task: 'EVERYTHING' }, /task must be/);
  bad({ version: 'x' }, /version/);
  bad({ trainedAt: '2027-01-01T00:00:00Z' }, /future/);
  bad({ dataFrom: '2026-01-01', dataTo: '2025-01-01' }, /after/);
  bad({ gate: { passed: 'yes', reasons: [] } }, /gate/);
  bad({ artifact: { format: 'ejo-ml/1', task: 'COMPLAINT_THEMES' } }, /not valid/);
  assert.throws(() => parseUpload(good, 9_000_000, now), /too large/);
});

test('parts dataset: consumption becomes complete Lagos weeks, oldest first, zeros for unused parts', () => {
  const now = new Date('2026-10-15T09:00:00Z'); // a Thursday
  const last = lastCompleteWeek(now);
  assert.equal(new Date(last.getTime() + 3_600_000).toISOString().slice(0, 10), '2026-10-05');
  const rows = weeklySeries(['a', 'b'], [
    { partId: 'a', at: new Date('2026-10-06T10:00:00Z'), quantity: 2 },
    { partId: 'a', at: new Date('2026-10-11T22:30:00Z'), quantity: 1.5 }, // Sunday 11:30 pm Lagos: same week
    { partId: 'a', at: new Date('2026-10-12T00:30:00Z'), quantity: 9 }, // Monday 1:30 am Lagos: this week, not complete — ignored
    { partId: 'a', at: new Date('2026-09-29T08:00:00Z'), quantity: 4 },
    { partId: 'zzz', at: new Date('2026-10-06T10:00:00Z'), quantity: 5 },
  ], 4, now);
  assert.deepEqual(rows.map((r) => r.part_id), ['a', 'b']);
  assert.deepEqual(rows[0]!.weekly, [0, 0, 4, 3.5]);
  assert.deepEqual(rows[1]!.weekly, [0, 0, 0, 0]);
  assert.equal(rows[0]!.as_of, '2026-10-05');
});

test('turnaround: hours from opening to ready, only when it makes sense', () => {
  const open = new Date('2026-10-01T08:00:00Z');
  assert.equal(turnaroundHours(open, new Date('2026-10-02T10:30:00Z')), 26.5);
  assert.equal(turnaroundHours(open, null), null);
  assert.equal(turnaroundHours(open, new Date('2026-09-30T08:00:00Z')), null);
  assert.equal(turnaroundHours(open, new Date('2027-10-01T08:00:00Z')), null);
});

test('parts weeks after a learn-from day: only whole Lagos weeks wholly on or after it', () => {
  const monday = new Date('2026-10-12T00:00:00+01:00');
  // Friday of the same week: no complete week since the Monday yet.
  assert.equal(completeWeeksSince(monday, new Date('2026-10-16T12:00:00+01:00')), 0);
  // The following Tuesday: the week of 12–18 October is complete.
  assert.equal(completeWeeksSince(monday, new Date('2026-10-20T12:00:00+01:00')), 1);
  // Starting mid-week: that partial week never counts.
  const wednesday = new Date('2026-10-14T00:00:00+01:00');
  assert.equal(completeWeeksSince(wednesday, new Date('2026-10-28T12:00:00+01:00')), 1);
  assert.equal(completeWeeksSince(wednesday, new Date('2026-11-03T12:00:00+01:00')), 2);
});
