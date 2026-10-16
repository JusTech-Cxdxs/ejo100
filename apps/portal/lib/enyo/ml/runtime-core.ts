/**
 * Running the trained models inside the portal — no Python, no extra server.
 * Each function reproduces what the trainer computed (scikit-learn's TF-IDF
 * and logistic regression, LightGBM's trees, scikit-learn's Isolation
 * Forest); tests/enyo-ml.test.ts checks the results against the trainer's
 * own outputs (ml/fixtures) to many decimal places.
 *
 * Pure: no database, no framework imports.
 */
import type { DecisionArtifact, AnomalyArtifact, DemandArtifact, DurationArtifact, LinesArtifact, SparseWeights, TfidfSpec, ThemesArtifact, Tree } from './artifact-core';

/** Word → position, built once per artifact and remembered. */
const vocabIndex = new WeakMap<TfidfSpec, Map<string, number>>();
function indexOf(spec: TfidfSpec): Map<string, number> {
  let m = vocabIndex.get(spec);
  if (!m) {
    m = new Map(spec.vocab.map((w, i) => [w, i]));
    vocabIndex.set(spec, m);
  }
  return m;
}

/** Tokens → sparse TF-IDF (sublinear TF, the artifact's IDF, L2-normalised). Unknown words are ignored, as in scikit-learn. */
export function tfidf(spec: TfidfSpec, tokens: string[]): Map<number, number> {
  const idx = indexOf(spec);
  const tf = new Map<number, number>();
  for (const t of tokens) {
    const i = idx.get(t);
    if (i !== undefined) tf.set(i, (tf.get(i) ?? 0) + 1);
  }
  const v = new Map<number, number>();
  let norm = 0;
  for (const [i, n] of tf) {
    const w = (1 + Math.log(n)) * spec.idf[i]!;
    v.set(i, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [i, w] of v) v.set(i, w / norm);
  return v;
}

const dot = (v: Map<number, number>, s: SparseWeights) => {
  let d = 0;
  for (let k = 0; k < s.i.length; k += 1) {
    const x = v.get(s.i[k]!);
    if (x !== undefined) d += x * s.w[k]!;
  }
  return d;
};

const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

// ------------------------------------------------------------------ trees

const ZERO = 1e-35;

/** The leaf a value vector reaches in one tree (LightGBM's numerical split rules). */
export function leafOf(tree: Tree, x: (f: number) => number): number {
  if (tree.nodes.length === 0) return 0;
  let at = 0;
  for (let guard = 0; guard <= tree.nodes.length; guard += 1) {
    const n = tree.nodes[at]!;
    let v = x(n.f);
    const m = n.m ?? 0;
    if (Number.isNaN(v) && m !== 2) v = 0;
    let left: boolean;
    if ((m === 1 && Math.abs(v) <= ZERO) || (m === 2 && Number.isNaN(v))) left = n.d === true;
    else left = v <= n.t;
    const next = left ? n.l : n.r;
    if (next < 0) return -next - 1;
    at = next;
  }
  throw new Error('Tree does not end in a leaf');
}

/** Sum of the leaves reached in every tree (a boosted ensemble's raw score). */
export function boosted(trees: Tree[], x: (f: number) => number): number {
  let s = 0;
  for (const t of trees) s += t.leaves[leafOf(t, x)]!;
  return s;
}

// ------------------------------------------------------------------ job duration

export type DurationInput = { tokens: string[]; numbers: Record<string, number> };
export type DurationOutput = { p10: number; p50: number; p90: number };

/** Likely hours from opening to ready: a low, a middle and a high estimate (10th, 50th, 90th percentile). */
export function predictDuration(a: DurationArtifact, input: DurationInput): DurationOutput {
  const v = tfidf(a.tfidf, input.tokens);
  const nV = a.tfidf.vocab.length;
  const x = (f: number) => (f < nV ? v.get(f) ?? 0 : (() => {
    const val = input.numbers[a.numeric[f - nV]!];
    return typeof val === 'number' && Number.isFinite(val) ? val : Number.NaN;
  })());
  const back = (z: number) => Math.max(0, Math.expm1(z));
  const raw = { p10: back(boosted(a.quantiles.p10, x)), p50: back(boosted(a.quantiles.p50, x)), p90: back(boosted(a.quantiles.p90, x)) };
  // Quantile models are trained separately and can cross: keep them in order.
  const [p10, p50, p90] = [raw.p10, raw.p50, raw.p90].sort((m, n) => m - n) as [number, number, number];
  return { p10, p50, p90 };
}

// ------------------------------------------------------------------ estimate lines

export type LineScore = { key: string; type: string; label: string; quantity: number; probability: number };

/** Every label's probability (one-vs-rest logistic regression). */
export function lineProbabilities(a: LinesArtifact, tokens: string[]): number[] {
  const v = tfidf(a.tfidf, tokens);
  return a.labels.map((_, k) => sigmoid(dot(v, a.weights[k]!) + a.intercepts[k]!));
}

/** The likely lines: above the artifact's threshold, most likely first, at most maxLines. */
export function predictLines(a: LinesArtifact, tokens: string[]): LineScore[] {
  const p = lineProbabilities(a, tokens);
  return a.labels
    .map((l, k) => ({ key: l.key, type: l.type, label: l.label, quantity: l.medianQty, probability: p[k]! }))
    .filter((l) => l.probability >= a.threshold)
    .sort((x, y) => y.probability - x.probability || x.key.localeCompare(y.key))
    .slice(0, a.maxLines);
}

// ------------------------------------------------------------------ price anomaly

/** Average path length of an unsuccessful search in a binary search tree of n items (Liu et al. 2008), as scikit-learn. */
export function averagePathLength(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + 0.5772156649015329) - (2 * (n - 1)) / n;
}

/** The three anomaly features for one estimate line, or null when the key has no reference yet. */
export function anomalyFeatures(a: AnomalyArtifact, line: { key: string; unitPrice: number; quantity: number }): [number, number, number] | null {
  const ref = Object.hasOwn(a.refs, line.key) ? a.refs[line.key] : undefined;
  if (!ref || !(line.unitPrice > 0) || !(line.quantity > 0)) return null;
  return [Math.log(line.unitPrice / ref.price), Math.log(line.quantity / ref.qty), Math.log((line.unitPrice * line.quantity) / (ref.price * ref.qty))];
}

/** scikit-learn's decision_function: below zero = unusual. */
export function anomalyScore(a: AnomalyArtifact, features: [number, number, number]): number {
  let depthSum = 0;
  for (const t of a.forest.trees) {
    // Depth of the leaf reached, plus the expected depth below it.
    let depth = 0;
    let leaf = 0;
    if (t.nodes.length) {
      let at = 0;
      for (;;) {
        const n = t.nodes[at]!;
        depth += 1;
        // scikit-learn compares in 32-bit floats.
        const next = Math.fround(features[n.f]!) <= n.t ? n.l : n.r;
        if (next < 0) { leaf = -next - 1; break; }
        at = next;
      }
    }
    depthSum += depth + averagePathLength(t.samples[leaf]!);
  }
  const score = -(2 ** (-depthSum / (a.forest.trees.length * averagePathLength(a.forest.maxSamples))));
  return score - a.forest.offset;
}

export type PriceCheck = { unusual: boolean; score: number; priceRatio: number; typicalPrice: number };

/** Is this line's price unusual for its kind of work? Null when there is nothing to compare with. */
export function checkPrice(a: AnomalyArtifact, line: { key: string; unitPrice: number; quantity: number }): PriceCheck | null {
  const f = anomalyFeatures(a, line);
  if (!f) return null;
  const ref = a.refs[line.key]!;
  const score = anomalyScore(a, f);
  return { unusual: score < 0, score, priceRatio: line.unitPrice / ref.price, typicalPrice: ref.price };
}

// ------------------------------------------------------------------ parts demand

export type ReorderSuggestion = { partId: string; onHand: number; reorderPoint: number; forecast4w: number; suggestedQuantity: number; method: string };

/**
 * Parts at or below their reorder point: order enough to cover the reorder
 * point plus four weeks' demand. Whole units, never negative.
 */
export function reorderSuggestions(a: DemandArtifact, onHand: Map<string, number>): ReorderSuggestion[] {
  const out: ReorderSuggestion[] = [];
  for (const p of a.parts) {
    if (p.method === 'none' || p.reorderPoint <= 0) continue;
    const have = onHand.get(p.partId);
    if (have === undefined) continue;
    if (have > p.reorderPoint) continue;
    const want = Math.ceil(p.reorderPoint + p.forecast4w - have);
    if (want <= 0) continue;
    out.push({ partId: p.partId, onHand: have, reorderPoint: p.reorderPoint, forecast4w: p.forecast4w, suggestedQuantity: want, method: p.method });
  }
  return out.sort((x, y) => x.onHand - x.reorderPoint - (y.onHand - y.reorderPoint) || x.partId.localeCompare(y.partId));
}

// ------------------------------------------------------------------ complaint themes

/** The theme a complaint belongs to (cosine to each centroid), or null when none is close enough. */
export function themeOf(a: ThemesArtifact, tokens: string[]): { index: number; label: string; similarity: number } | null {
  const v = tfidf(a.tfidf, tokens);
  if (!v.size) return null;
  let best = -1;
  let sim = 0;
  a.themes.forEach((t, k) => {
    const s = dot(v, t.centroid);
    if (s > sim) { sim = s; best = k; }
  });
  return best >= 0 && sim >= a.minSimilarity ? { index: best, label: a.themes[best]!.label, similarity: sim } : null;
}

// ------------------------------------------------------------------ decisions (v37)

/** Linear interpolation on a non-decreasing table, clipped at both ends (as numpy.interp / scikit-learn's isotonic predict). */
export function interpolate(x: number[], y: number[], v: number): number {
  if (!x.length) return 0;
  if (v <= x[0]!) return y[0]!;
  if (v >= x[x.length - 1]!) return y[y.length - 1]!;
  let lo = 0;
  let hi = x.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid]! <= v) lo = mid; else hi = mid;
  }
  const span = x[hi]! - x[lo]!;
  return span > 0 ? y[lo]! + ((v - x[lo]!) / span) * (y[hi]! - y[lo]!) : y[hi]!;
}

/** How likely a request is to be sent back at its step (0–1), from the features decisions-core builds. */
export function decisionRisk(a: DecisionArtifact, features: number[]): number {
  const raw = boosted(a.trees, (f) => features[f] ?? 0);
  return Math.max(0, Math.min(1, interpolate(a.calibration.x, a.calibration.y, raw)));
}
