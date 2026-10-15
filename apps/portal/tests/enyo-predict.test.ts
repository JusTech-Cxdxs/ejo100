/**
 * Enyo's workshop intelligence (lib/enyo/predict): text normalisation,
 * TF-IDF similarity, combining similar jobs' lines into a prediction,
 * scoring a prediction against the approved estimate, and the training
 * export's no-personal-data rule. Pure: no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applySynonyms, buildIdf, cosine, modelFamily, normaliseText, stem, tfidfVector, tokenise } from '../lib/enyo/predict/text';
import { aggregateLines, compareLines, lineKey, median, percentile, MIN_NEIGHBOURS, SERVICE_LINE_TYPES, type HistLine, type Neighbour } from '../lib/enyo/predict/lines-core';
import { scoreCandidates, vehicleBonus, type Candidate } from '../lib/enyo/predict/similar-core';
import { complaintQuality, DATASET_COLUMNS, datasetLines, isMash, mileageBand, opaqueId, pickColumns, plausibleYear, qualityFilter, scrubText, toCsv, toJsonl, type DatasetRow } from '../lib/enyo/predict/dataset-core';

// ── Normalisation and tokens ───────────────────────────────────────────
test('normalises case, punctuation and contractions', () => {
  assert.equal(normaliseText("  The A/C won't   COOL!!  "), 'the ac wont cool');
  assert.equal(normaliseText('Brake-pads (front)'), 'brake pads front');
  assert.equal(normaliseText('Café'), 'cafe');
});

test('maps workshop and Nigerian-English phrases to one word each', () => {
  for (const s of ['AC not cooling', 'a/c not cooling', 'Aircon not cooling', 'air conditioning not cooling', 'air condition is blowing hot air']) {
    const t = tokenise(s);
    assert.ok(t.includes('aircon'), `${s} → ${t.join(' ')}`);
    assert.ok(t.includes('notcooling'), `${s} → ${t.join(' ')}`);
  }
  for (const s of ["car won't start", 'vehicle not starting', 'refusing to start', 'Car cannot start', "doesn't start"]) {
    assert.deepEqual(tokenise(s), ['nostart'], s);
  }
  assert.deepEqual(tokenise('Car is shaking'), ['vibration']);
  assert.deepEqual(tokenise('vibration at high speed'), ['vibration', 'high', 'speed']);
  assert.ok(tokenise('Change brake pad').includes('brakepad'));
  assert.ok(tokenise('front pads worn').includes('brakepad'));
  assert.ok(tokenise('Engine knocking sound').includes('knocking'));
  assert.ok(tokenise('check engine light on').includes('checkengine'));
  assert.equal(applySynonyms('the ac is not cooling'), 'the aircon is notcooling');
});

test('drops filler words and numbers, and stems lightly', () => {
  assert.deepEqual(tokenise('Please the customer complains the car is overheating at 50000 km'), ['overheating', 'km']);
  assert.equal(stem('leaking'), 'leak');
  assert.equal(stem('wheels'), 'wheel');
  assert.equal(stem('batteries'), 'battery');
  assert.equal(stem('glass'), 'glass');
  assert.equal(stem('aircon'), 'aircon');
  assert.equal(stem('stopped'), 'stop');
  assert.deepEqual(tokenise(''), []);
  assert.deepEqual(tokenise('!!!'), []);
});

test('model family is the first word of the model', () => {
  assert.equal(modelFamily('Hilux Revo 2.8'), 'hilux');
  assert.equal(modelFamily(null), '');
});

// ── TF-IDF ─────────────────────────────────────────────────────────────
test('TF-IDF cosine: identical text is 1, unrelated text is 0, rare words weigh more', () => {
  const docs = [tokenise('aircon not cooling'), tokenise('brake pads worn squealing'), tokenise('engine overheating'), tokenise('aircon noise')];
  const idf = buildIdf(docs);
  const v = (s: string) => tfidfVector(tokenise(s), idf);
  assert.ok(Math.abs(cosine(v('AC not cooling'), v('aircon not cooling')) - 1) < 1e-9);
  assert.equal(cosine(v('AC not cooling'), v('engine overheating')), 0);
  // "aircon" appears in two documents, "notcooling" in one: sharing the rarer word scores higher.
  assert.ok(cosine(v('aircon not cooling'), v('not cooling')) > cosine(v('aircon not cooling'), v('aircon')));
  // Vectors are unit length.
  const vec = v('brake pads worn squealing');
  const norm = Math.sqrt([...vec.values()].reduce((s, w) => s + w * w, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9);
  assert.equal(cosine(new Map(), vec), 0);
});

// ── Scoring candidates ─────────────────────────────────────────────────
const cand = (o: Partial<Candidate> & Pick<Candidate, 'id' | 'text'>): Candidate => ({
  kind: 'JOB_CARD', number: o.id, branchId: 'b1', createdAt: new Date('2026-05-01T10:00:00Z'), make: 'Toyota', model: 'Corolla', year: 2018, mileage: 80000, ...o,
});

test('vehicle bonus: make, model family, year band and mileage', () => {
  const q = { make: 'Toyota', model: 'Corolla LE', year: 2018, mileage: 80000 };
  assert.equal(vehicleBonus(q, { make: 'Honda', model: 'Corolla', year: 2018, mileage: 80000 }), 0);
  assert.equal(vehicleBonus(q, { make: 'toyota', model: 'Camry', year: 2018, mileage: 10000 }), 0.04);
  assert.equal(vehicleBonus(q, { make: 'TOYOTA', model: 'corolla', year: 2016, mileage: 70000 }), 0.2);
  assert.equal(vehicleBonus(q, { make: 'Toyota', model: 'Corolla', year: 2010, mileage: null }), 0.12);
});

test('similar jobs: ranked by text first, vehicle second; unrelated jobs are left out', () => {
  const ranked = scoreCandidates(
    { text: 'AC not cooling', make: 'Toyota', model: 'Corolla', year: 2018, mileage: 82000 },
    [
      cand({ id: 'brakes', text: 'Brake pads worn, squealing' }),
      cand({ id: 'ac-honda', text: 'Air conditioning not cooling', make: 'Honda', model: 'Accord' }),
      cand({ id: 'ac-toyota', text: 'aircon is not cooling well' }),
      cand({ id: 'ac-noise', text: 'AC making noise', createdAt: new Date('2026-06-01T10:00:00Z') }),
    ],
    { k: 9 },
  );
  assert.deepEqual(ranked.map((r) => r.id), ['ac-toyota', 'ac-honda', 'ac-noise']);
  assert.ok(ranked[0]!.similarity > ranked[1]!.similarity);
  assert.ok(ranked[0]!.shared.includes('notcooling'));
  assert.equal(scoreCandidates({ text: 'the car', make: null, model: null, year: null, mileage: null }, [cand({ id: 'x', text: 'car' })]).length, 0);
  assert.equal(scoreCandidates({ text: 'AC not cooling', make: null, model: null, year: null, mileage: null }, [cand({ id: 'x', text: 'AC not cooling' })], { k: 0 }).length, 0);
});

// ── Line identity ──────────────────────────────────────────────────────
const L = (type: HistLine['type'], description: string, o: Partial<HistLine> = {}): HistLine => ({ type, description, quantity: 1, unitPrice: null, amount: null, ...o });

test('line keys: Store parts by part type, Sundry as one, others by their meaningful words', () => {
  assert.equal(lineKey(L('STORE_PART', 'Brake Pads', { partTypeName: 'Brake Pads' })), 'STORE_PART:brake pads');
  assert.equal(lineKey(L('STORE_PART', 'whatever', { partTypeName: 'BRAKE  pads' })), 'STORE_PART:brake pads');
  assert.equal(lineKey(L('LABOUR', 'Labour for Brake')), lineKey(L('LABOUR', 'brake labour')));
  assert.equal(lineKey(L('LABOUR', 'Labour for Brake')), 'LABOUR:brake');
  assert.equal(lineKey(L('SUNDRY', 'Rags and cleaner')), 'SUNDRY');
  assert.equal(lineKey(L('SUNDRY', 'Consumables')), 'SUNDRY');
  assert.equal(lineKey(L('INTERNAL_JOB', 'A/C gas refill')), lineKey(L('INTERNAL_JOB', 'AC gas refill')));
  assert.notEqual(lineKey(L('INTERNAL_JOB', 'Wheel alignment')), lineKey(L('LABOUR', 'Wheel alignment')));
  assert.equal(lineKey(L('LABOUR', 'Labour')), 'LABOUR');
});

// ── Statistics ─────────────────────────────────────────────────────────
test('median and percentiles (linear interpolation, as numpy)', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(percentile([10, 20, 30, 40, 50], 0.25), 20);
  assert.equal(percentile([10, 20, 30, 40], 0.75), 32.5);
  assert.equal(percentile([7], 0.25), 7);
  assert.ok(Number.isNaN(median([])));
});

// ── Aggregation ────────────────────────────────────────────────────────
const nb = (id: string, similarity: number, lines: HistLine[]): Neighbour => ({ id, kind: 'JOB_CARD', number: id, branchId: 'b1', similarity, lines });

test('needs at least 3 similar jobs, and says why when it has fewer', () => {
  assert.equal(MIN_NEIGHBOURS, 3);
  const none = aggregateLines([]);
  assert.equal(none.ok, false);
  if (!none.ok) assert.match(none.reason, /No similar finished jobs/);
  const two = aggregateLines([nb('a', 0.9, [L('LABOUR', 'Labour', { amount: 1 })]), nb('b', 0.9, [L('LABOUR', 'Labour', { amount: 1 })])]);
  assert.equal(two.ok, false);
  if (!two.ok) assert.match(two.reason, /Only 2 similar finished jobs were found; at least 3/);
  const one = aggregateLines([nb('a', 0.9, [])]);
  if (!one.ok) assert.match(one.reason, /Only 1 similar finished job was found/);
});

test('support, confidence, median quantity and the labour range', () => {
  const pads = (q: number) => L('STORE_PART', 'Brake Pads', { partTypeName: 'Brake Pads', categoryName: 'Brakes', quantity: q, unitPrice: 15000, amount: 15000 * q });
  const labour = (amount: number) => L('LABOUR', 'Labour for brake', { quantity: 1, unitPrice: amount, amount });
  const r = aggregateLines([
    nb('j1', 0.9, [pads(2), labour(10000), L('SUNDRY', 'Rags', { amount: 500, unitPrice: 500 })]),
    nb('j2', 0.8, [pads(1), pads(1), labour(12000)]),
    nb('j3', 0.7, [pads(4), labour(20000), L('EXTERNAL_PART', 'Disc skimming', { amount: 8000, unitPrice: 8000 })]),
    nb('j4', 0.6, [labour(14000)]),
    nb('j5', 0.5, [L('SUNDRY', 'Brake cleaner', { amount: 700, unitPrice: 700 })]),
  ]);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const byKey = new Map(r.lines.map((l) => [l.key, l]));
  const p = byKey.get('STORE_PART:brake pads')!;
  assert.equal(p.support, 3);
  assert.equal(p.of, 5);
  // Two pad lines on one job count once, with their quantities added: 2, 2, 4.
  assert.equal(p.quantity, 2);
  assert.equal(p.unitPrice, null, 'Store parts are never priced from history');
  assert.equal(p.amount, null);
  assert.equal(p.categoryName, 'Brakes');
  assert.equal(p.confidence, Math.round(((0.9 + 0.8 + 0.7) / 3.5) * 1000) / 1000);
  const lab = byKey.get('LABOUR:brake')!;
  assert.equal(lab.support, 4);
  assert.deepEqual(lab.amount, { median: 13000, p25: 11500, p75: 15500 });
  assert.deepEqual(lab.unitPrice, { median: 13000, p25: 11500, p75: 15500 });
  assert.equal(lab.label, 'Labour for brake');
  // Sundry: 2 of 5 = 40% share, support 2 → just in.
  assert.equal(byKey.get('SUNDRY')!.support, 2);
  // The outside part appeared once: left out.
  assert.equal([...byKey.keys()].some((k) => k.startsWith('EXTERNAL_PART')), false);
  // Most confident first.
  assert.equal(r.lines[0]!.key, 'LABOUR:brake');
  assert.deepEqual(lab.evidence, ['j1', 'j2', 'j3', 'j4']);
});

test('a Vehicle Service prediction only uses the line types a service can hold', () => {
  const ext = L('EXTERNAL_JOB', 'Lathe work', { amount: 5000, unitPrice: 5000 });
  const r = aggregateLines([nb('a', 0.9, [ext]), nb('b', 0.9, [ext]), nb('c', 0.9, [ext])], { allowedTypes: SERVICE_LINE_TYPES });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /no line in common/);
});

// ── Precision and recall ───────────────────────────────────────────────
test('precision, recall and labour error against the approved estimate', () => {
  const predicted = [
    { key: 'STORE_PART:brake pads', type: 'STORE_PART' as const, label: 'Brake Pads', amount: null },
    { key: 'LABOUR:brake', type: 'LABOUR' as const, label: 'Labour for brake', amount: { median: 13000, p25: 11000, p75: 15000 } },
    { key: 'SUNDRY', type: 'SUNDRY' as const, label: 'Rags', amount: { median: 500, p25: 500, p75: 500 } },
  ];
  const approved = [
    L('STORE_PART', 'Brake Pads', { partTypeName: 'Brake Pads', quantity: 2 }),
    L('LABOUR', 'Brake labour', { unitPrice: 15000, amount: 15000 }),
    L('STORE_PART', 'Brake Fluid', { partTypeName: 'Brake Fluid' }),
    L('INTERNAL_JOB', 'Brake bleeding', { amount: 3000 }),
  ];
  const c = compareLines(predicted, approved);
  assert.deepEqual(c.kept.sort(), ['LABOUR:brake', 'STORE_PART:brake pads']);
  assert.equal(c.precision, 0.6667);
  assert.equal(c.recall, 0.5);
  assert.deepEqual(c.missed.map((m) => m.label).sort(), ['Brake Fluid', 'Brake bleeding']);
  assert.deepEqual(c.extra.map((m) => m.key), ['SUNDRY']);
  assert.deepEqual(c.labour, { predicted: 13000, approved: 15000, error: 2000 });

  const empty = compareLines([], approved);
  assert.equal(empty.precision, null);
  assert.equal(empty.recall, 0);
  assert.deepEqual(empty.labour, { predicted: null, approved: 15000, error: 15000 });
  const nothingApproved = compareLines(predicted, []);
  assert.equal(nothingApproved.recall, null);
  assert.equal(nothingApproved.precision, 0);
  assert.deepEqual(compareLines([], []).labour, { predicted: null, approved: null, error: null });
});

// ── Training export: no personal data ──────────────────────────────────
test('scrubbing removes emails, phones, plates, VINs, links and known names', () => {
  const s = scrubText(
    'Mr Adebayo Okafor (adebayo.okafor@gmail.com, 0803 123 4567, +234-803-123-4567) says LSR-123-XY and KJA 456 AB shake at 80 km/h. VIN JTDBR32E720123456, see https://x.y/z. Okafor wants it today.',
    ['Adebayo Okafor'],
  );
  for (const bad of ['Adebayo', 'Okafor', 'gmail', '0803', '4567', 'LSR-123-XY', 'KJA 456 AB', 'JTDBR32E720123456', 'https://']) assert.ok(!s.includes(bad), `${bad} left in: ${s}`);
  for (const kept of ['shake at 80 km/h', '[email]', '[phone]', '[plate]', '[vin]', '[name]', '[link]']) assert.ok(s.includes(kept), `${kept} missing: ${s}`);
  // Ordinary workshop text is left alone.
  assert.equal(scrubText('AC not cooling at 50000 km since 2024'), 'AC not cooling at 50000 km since 2024');
  assert.equal(scrubText('Brake pads worn, Hilux 2018'), 'Brake pads worn, Hilux 2018');
  assert.equal(scrubText('E2E-001-AA brakes'), '[plate] brakes');
});

test('dataset rows carry only the declared columns — never names, contacts, plates or record ids', () => {
  const forbidden = ['customer', 'name', 'phone', 'email', 'plate', 'vin', 'chassis', 'engine_number', 'vehicle_id', 'customer_id', 'user', 'staff', 'job_number', 'service_number', 'address'];
  for (const c of DATASET_COLUMNS) for (const f of forbidden) assert.ok(!String(c).includes(f), `column ${String(c)} looks personal (${f})`);
  const row = {
    row_id: opaqueId('cjob123', 'salt'), kind: 'JOB_CARD', opened_on: '2026-05-01', branch_code: 'KWL-WS', complaint_text: scrubText('Ada Customer says AC not cooling, call 08031234567', ['Ada Customer']),
    make: 'Toyota', model: 'Corolla', year: 2018, mileage_band_km: mileageBand(82_345), vehicle_type: 'PASSENGER',
    lines: datasetLines([L('LABOUR', 'Labour for Ada', { amount: 5000, unitPrice: 5000 }), L('STORE_PART', 'x', { partTypeName: 'AC Gas', unitPrice: 9000, amount: 9000 })], ['Ada Customer']),
    labour_total: 5000, predicted_keys: ['LABOUR'], precision: 1, recall: 0.5, model_version: 'knn-tfidf-1',
    complaint_tokens: ['aircon', 'notcooling'], feature_tokens: ['kind:job', 'make:toyota'], work_numbers: { lines_total: 2 }, turnaround_hours: 26.5,
    // A field that must never go out, even if a future change adds it to the object.
    customerName: 'Ada Customer', plateNumber: 'E2E-001-AA',
  } as unknown as DatasetRow;
  const jsonl = toJsonl([row]);
  const csv = toCsv([row]);
  for (const out of [jsonl, csv]) {
    assert.ok(!out.includes('Ada'), out);
    assert.ok(!out.includes('Customer'), out);
    assert.ok(!out.includes('08031234567'), out);
    assert.ok(!out.includes('E2E-001-AA'), out);
    assert.ok(!out.includes('cjob123'), out);
  }
  assert.deepEqual(Object.keys(JSON.parse(jsonl.trim())), [...DATASET_COLUMNS]);
  assert.deepEqual(Object.keys(pickColumns(row)), [...DATASET_COLUMNS]);
  assert.equal(mileageBand(82_345), 80_000);
  assert.equal(mileageBand(null), null);
  // Store part prices are never exported from history.
  const parsed = JSON.parse(jsonl.trim()) as DatasetRow;
  assert.equal(parsed.lines[1]!.unit_price, null);
  assert.equal(parsed.lines[1]!.key, 'STORE_PART:ac gas');
  // CSV: one header + one row; formulas neutralised.
  assert.equal(csv.trim().split('\n').length, 2);
  assert.match(toCsv([{ ...row, complaint_text: '=HYPERLINK("x")' }]), /"'=HYPERLINK\(""x""\)"/);
  // Row ids differ between exports (salted) and never equal the record id.
  assert.notEqual(opaqueId('cjob123', 'a'), opaqueId('cjob123', 'b'));
});

test('the export reader selects no personal columns from the database', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'lib', 'enyo', 'predict', 'dataset.ts'), 'utf8');
  for (const col of ['plateNumber', 'chassisNumber', 'engineNumber', 'email:', 'phone:', 'address']) assert.ok(!src.includes(col), `dataset.ts reads ${col}`);
  // Names are read only to be scrubbed out of free text.
  assert.match(src, /scrubText\(/);
});

// ── Learning page figures ──────────────────────────────────────────────
test('learning summary: weekly precision/recall, kept vs missed, labour error, most-missed lines', async () => {
  const { summarise, promotionProgress, lagosWeekStart, PROMOTION_RULE } = await import('../lib/enyo/predict/learning-core');
  const now = new Date('2026-10-14T12:00:00Z'); // Wednesday
  // Monday 12 Oct 2026, 00:00 Lagos = 11 Oct 23:00 UTC.
  assert.equal(lagosWeekStart(now).toISOString(), '2026-10-11T23:00:00.000Z');
  // Sunday 23:30 Lagos still belongs to the week before.
  assert.equal(lagosWeekStart(new Date('2026-10-11T22:30:00Z')).toISOString(), '2026-10-04T23:00:00.000Z');
  const outcome = (kept: number, missed: string[], extra: number, error: number | null) => ({
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
  assert.equal(s.weeks.length, 12);
  const thisWeek = s.weeks[11]!;
  assert.equal(thisWeek.start, '2026-10-12');
  assert.equal(thisWeek.label, '12 Oct');
  assert.equal(thisWeek.resolved, 2);
  assert.equal(thisWeek.precision, 75);
  assert.equal(thisWeek.recall, 75);
  assert.equal(thisWeek.labourError, 3000);
  const lastWeek = s.weeks[10]!;
  assert.equal(lastWeek.resolved, 1);
  assert.equal(lastWeek.precision, null, 'a job Enyo had nothing to suggest for is not counted for accuracy');
  assert.equal(s.weeks[0]!.resolved, 0);
  assert.equal(s.kept, 3);
  assert.equal(s.extra, 1);
  assert.equal(s.missed, 4);
  assert.deepEqual(s.mostMissed[0], { label: 'Brake Fluid', type: 'STORE_PART', count: 3 });
  assert.deepEqual(s.labour, { meanError: 3000, samples: 2 });

  assert.deepEqual(PROMOTION_RULE, { minResolved: 200, minPrecision: 0.7 });
  const early = promotionProgress(50, 0.82);
  assert.equal(early.progress, 0.25);
  assert.equal(early.ready, false);
  assert.equal(early.accurate, true);
  assert.equal(promotionProgress(240, 0.65).ready, false);
  assert.equal(promotionProgress(240, 0.71).ready, true);
  assert.equal(promotionProgress(0, null).accurate, false);
});

test('data quality: test and keyboard-mash complaints are recognised; real ones, short or long, are kept', () => {
  for (const junk of ['test', 'Testing 123', 'asdf', 'asdfghjkl', 'qwerty qwerty', 'hello', 'xxxx', 'sdfgh jklmn', '...', '[name] [phone]', 'aaaaaa', 'demo demo']) {
    assert.notEqual(complaintQuality(junk), 'ok', junk);
  }
  assert.equal(complaintQuality(''), 'empty');
  for (const real of ['Noise', 'Brake noise when stopping', 'AC not cooling', 'Check engine light on, car jerks', 'General service at 50,000 km', 'Vibration at high speed', 'Ẹ̀rọ náà ń pariwo', 'Le moteur chauffe']) {
    assert.equal(complaintQuality(real), 'ok', real);
  }
  assert.ok(isMash('qwertyuiop') && isMash('zzzz') && !isMash('strength') && !isMash('brakes'));
  assert.equal(plausibleYear(2019, new Date('2026-01-01')), 2019);
  assert.equal(plausibleYear(1900), null);
  assert.equal(plausibleYear(2099, new Date('2026-01-01')), null);
});

test('data quality: the filter drops junk, impossible lines and duplicates, blanks impossible job times, and reports why', () => {
  const line = { type: 'LABOUR', key: 'labour:brake service', label: 'Brake service', quantity: 1, unit_price: 15000, amount: 15000 };
  const base = { row_id: 'a', kind: 'JOB_CARD', opened_on: '2026-03-02', branch_code: 'LAG', complaint_text: 'Brake noise', make: 'Toyota', model: 'Corolla', year: 2018, mileage_band_km: 50000, vehicle_type: 'CAR', lines: [line], labour_total: 15000, predicted_keys: null, precision: null, recall: null, model_version: null, complaint_tokens: ['brake', 'noise'], feature_tokens: [], work_numbers: {}, turnaround_hours: 26 } as unknown as DatasetRow;
  const rows: DatasetRow[] = [
    base,
    { ...base, row_id: 'dup' },
    { ...base, row_id: 'junk', complaint_text: 'test test' },
    { ...base, row_id: 'empty', complaint_text: '' },
    { ...base, row_id: 'neg', complaint_text: 'Oil leak', lines: [{ ...line, quantity: -2 }] },
    { ...base, row_id: 'nolines', complaint_text: 'Oil leak', lines: [] },
    { ...base, row_id: 'quick', complaint_text: 'Wiper blade', turnaround_hours: 0.1 },
  ];
  const { rows: kept, report } = qualityFilter(rows);
  assert.deepEqual(kept.map((r) => r.row_id), ['a', 'quick']);
  assert.equal(kept[1]!.turnaround_hours, null);
  assert.deepEqual(report, { examined: 7, kept: 2, dropped: { no_complaint: 1, test_or_junk_text: 1, impossible_line: 2, duplicate: 1 }, blanked: { turnaround_too_short: 1 } });
});

test('learn-from day: every learning path respects it (similar jobs, training rows, trainer datasets)', () => {
  const read = (f: string) => readFileSync(join(__dirname, '..', '..', f), 'utf8');
  assert.match(read('lib/enyo/predict/similar.ts'), /learningSince\(scope\.organisationId/);
  assert.match(read('lib/enyo/predict/dataset.ts'), /learningSince\(scope\.organisationId/);
  assert.match(read('lib/enyo/predict/dataset.ts'), /qualityFilter\(out\)/);
  assert.match(read('lib/enyo/ml/service.ts'), /learningSince\(organisationId/);
});
