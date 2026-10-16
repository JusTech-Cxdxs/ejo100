/**
 * The portable models the Python trainer (ml/) produces, and the checks every
 * upload must pass before it is stored. A model reaches the portal only
 * through POST /api/ml/models, so this file is the gate: anything malformed,
 * oversized or non-finite is refused, never half-stored.
 *
 * Format "ejo-ml/1". Pure (no database): tested in tests/enyo-ml.test.ts.
 */

export const ARTIFACT_FORMAT = 'ejo-ml/1';
export const ML_TASKS = ['JOB_DURATION', 'ESTIMATE_LINES', 'PARTS_DEMAND', 'PRICE_ANOMALY', 'COMPLAINT_THEMES', 'DECISION_RISK'] as const;
export type MlTask = (typeof ML_TASKS)[number];

/** Upper bounds: generous for a company's models, small enough for a database row and under the hosting limit on request bodies (4.5 MB on Vercel). */
export const LIMITS = { bytes: 4_000_000, vocab: 20_000, trees: 2_000, nodesPerTree: 1_024, labels: 400, parts: 20_000, themes: 40 } as const;

/** TF-IDF over tokens: position i is the word, idf[i] its weight (sublinear TF, smoothed IDF, L2 norm). */
export type TfidfSpec = { vocab: string[]; idf: number[] };

/**
 * One regression/decision tree. `nodes[i]` splits on feature `f` at threshold
 * `t`: value <= t goes left. Children are node indexes, or a leaf written as
 * -(leafIndex + 1). Missing handling follows LightGBM: `m` 0 = none, 1 = zero
 * as missing, 2 = NaN as missing, with `d` = default left.
 */
export type TreeNode = { f: number; t: number; l: number; r: number; d?: boolean; m?: 0 | 1 | 2 };
export type Tree = { nodes: TreeNode[]; leaves: number[] };

export type DurationArtifact = {
  format: typeof ARTIFACT_FORMAT;
  task: 'JOB_DURATION';
  tfidf: TfidfSpec;
  /** Numbers from workNumbers(), in feature order after the vocabulary. */
  numeric: string[];
  /** The model predicts log(1 + hours). */
  target: 'log1p_hours';
  quantiles: { p10: Tree[]; p50: Tree[]; p90: Tree[] };
};

export type SparseWeights = { i: number[]; w: number[] };

export type LinesArtifact = {
  format: typeof ARTIFACT_FORMAT;
  task: 'ESTIMATE_LINES';
  tfidf: TfidfSpec;
  labels: { key: string; type: string; label: string; medianQty: number }[];
  intercepts: number[];
  weights: SparseWeights[];
  threshold: number;
  maxLines: number;
};

export type AnomalyArtifact = {
  format: typeof ARTIFACT_FORMAT;
  task: 'PRICE_ANOMALY';
  /** Typical unit price and quantity of each line key, from approved estimates. */
  refs: Record<string, { price: number; qty: number; n: number }>;
  features: ['price_ratio_log', 'qty_ratio_log', 'amount_ratio_log'];
  forest: { trees: (Tree & { samples: number[] })[]; maxSamples: number; offset: number };
};

export type DemandPart = {
  partId: string;
  method: 'croston_sba' | 'ses' | 'moving_average' | 'none';
  weeklyRate: number;
  weeklySd: number;
  forecast4w: number;
  safetyStock: number;
  reorderPoint: number;
  backtestMae: number | null;
  baselineMae: number | null;
  nonzeroWeeks: number;
};
export type DemandArtifact = {
  format: typeof ARTIFACT_FORMAT;
  task: 'PARTS_DEMAND';
  asOf: string;
  weeks: number;
  leadTimeWeeks: number;
  serviceZ: number;
  parts: DemandPart[];
};

export type Theme = { label: string; terms: string[]; centroid: SparseWeights; size: number; share: number; monthly: { month: string; count: number }[] };
export type ThemesArtifact = {
  format: typeof ARTIFACT_FORMAT;
  task: 'COMPLAINT_THEMES';
  tfidf: TfidfSpec;
  themes: Theme[];
  minSimilarity: number;
};

/**
 * v37: how likely a request is to be sent back at an approval step, from what
 * is known when it arrives (the step, the requester's role, the amount, the
 * lines, when). LightGBM trees give a score; the isotonic calibration table
 * turns it into a probability (linear between points, clipped at the ends).
 * Learns how the organisation decides — it never decides.
 */
export type DecisionArtifact = {
  format: typeof ARTIFACT_FORMAT;
  task: 'DECISION_RISK';
  steps: string[];
  roles: string[];
  features: string[];
  trees: Tree[];
  calibration: { x: number[]; y: number[] };
};

export type Artifact = DurationArtifact | LinesArtifact | AnomalyArtifact | DemandArtifact | ThemesArtifact | DecisionArtifact;

// ------------------------------------------------------------------ checks

class Invalid extends Error {}
const fail = (msg: string): never => { throw new Invalid(msg); };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, what: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(`${what} must be a finite number`));
const int = (v: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  const n = num(v, what);
  return Number.isInteger(n) && n >= min && n <= max ? n : fail(`${what} must be a whole number from ${min} to ${max}`);
};
const str = (v: unknown, what: string, max = 200): string => (typeof v === 'string' && v.length <= max ? v : fail(`${what} must be text of at most ${max} characters`));
const arr = (v: unknown, what: string, max: number): unknown[] => (Array.isArray(v) && v.length <= max ? v : fail(`${what} must be a list of at most ${max} items`));

function checkTfidf(v: unknown): TfidfSpec {
  if (!isObj(v)) fail('tfidf is missing');
  const t = v as Record<string, unknown>;
  const vocab = arr(t.vocab, 'tfidf.vocab', LIMITS.vocab).map((w, i) => str(w, `tfidf.vocab[${i}]`, 140));
  const idf = arr(t.idf, 'tfidf.idf', LIMITS.vocab).map((x, i) => num(x, `tfidf.idf[${i}]`));
  if (vocab.length !== idf.length) fail('tfidf.vocab and tfidf.idf differ in length');
  if (new Set(vocab).size !== vocab.length) fail('tfidf.vocab has repeated words');
  if (idf.some((x) => x <= 0)) fail('tfidf.idf weights must be positive');
  return { vocab, idf };
}

function checkTree(v: unknown, features: number, what: string, withSamples = false): Tree & { samples?: number[] } {
  if (!isObj(v)) fail(`${what} is not a tree`);
  const t = v as Record<string, unknown>;
  const leaves = arr(t.leaves, `${what}.leaves`, LIMITS.nodesPerTree + 1).map((x, i) => num(x, `${what}.leaves[${i}]`));
  if (!leaves.length) fail(`${what} has no leaves`);
  const nodes = arr(t.nodes, `${what}.nodes`, LIMITS.nodesPerTree).map((n, i) => {
    if (!isObj(n)) fail(`${what}.nodes[${i}] is not a node`);
    const o = n as Record<string, unknown>;
    const child = (c: unknown, side: string) => {
      const k = int(c, `${what}.nodes[${i}].${side}`, -leaves.length, LIMITS.nodesPerTree - 1);
      return k;
    };
    const node: TreeNode = { f: int(o.f, `${what}.nodes[${i}].f`, 0, features - 1), t: num(o.t, `${what}.nodes[${i}].t`), l: child(o.l, 'l'), r: child(o.r, 'r') };
    if (o.d !== undefined) node.d = o.d === true;
    if (o.m !== undefined) node.m = int(o.m, `${what}.nodes[${i}].m`, 0, 2) as 0 | 1 | 2;
    return node;
  });
  // Children point forward only (no cycles), and every node index exists.
  nodes.forEach((n, i) => {
    for (const c of [n.l, n.r]) if (c >= 0 && (c <= i || c >= nodes.length)) fail(`${what}.nodes[${i}] points at a node that does not follow it`);
  });
  if (nodes.length === 0 && leaves.length !== 1) fail(`${what}: a tree without splits has exactly one leaf`);
  const out: Tree & { samples?: number[] } = { nodes, leaves };
  if (withSamples) {
    const samples = arr(t.samples, `${what}.samples`, LIMITS.nodesPerTree + 1).map((x, i) => num(x, `${what}.samples[${i}]`));
    if (samples.length !== leaves.length) fail(`${what}.samples must give one count per leaf`);
    out.samples = samples;
  }
  return out;
}

function checkTrees(v: unknown, features: number, what: string): Tree[] {
  return arr(v, what, LIMITS.trees).map((t, i) => checkTree(t, features, `${what}[${i}]`));
}

function checkSparse(v: unknown, size: number, what: string): SparseWeights {
  if (!isObj(v)) fail(`${what} is missing`);
  const o = v as Record<string, unknown>;
  const i = arr(o.i, `${what}.i`, size).map((x, k) => int(x, `${what}.i[${k}]`, 0, size - 1));
  const w = arr(o.w, `${what}.w`, size).map((x, k) => num(x, `${what}.w[${k}]`));
  if (i.length !== w.length) fail(`${what}: indexes and weights differ in length`);
  return { i, w };
}

/** The artifact for `task`, checked; throws with a plain reason when anything is wrong. */
export function validateArtifact(task: MlTask, raw: unknown): Artifact {
  try {
    if (!isObj(raw)) fail('The artifact is not an object');
    const a = raw as Record<string, unknown>;
    if (a.format !== ARTIFACT_FORMAT) fail(`Unknown artifact format (expected ${ARTIFACT_FORMAT})`);
    if (a.task !== task) fail('The artifact is for a different task');
    switch (task) {
      case 'JOB_DURATION': {
        const tfidf = checkTfidf(a.tfidf);
        const numeric = arr(a.numeric, 'numeric', 64).map((s, i) => str(s, `numeric[${i}]`, 60));
        if (a.target !== 'log1p_hours') fail('target must be log1p_hours');
        if (!isObj(a.quantiles)) fail('quantiles are missing');
        const q = a.quantiles as Record<string, unknown>;
        const features = tfidf.vocab.length + numeric.length;
        const quantiles = { p10: checkTrees(q.p10, features, 'p10'), p50: checkTrees(q.p50, features, 'p50'), p90: checkTrees(q.p90, features, 'p90') };
        if (!quantiles.p10.length || !quantiles.p50.length || !quantiles.p90.length) fail('each quantile needs at least one tree');
        return { format: ARTIFACT_FORMAT, task, tfidf, numeric, target: 'log1p_hours', quantiles };
      }
      case 'ESTIMATE_LINES': {
        const tfidf = checkTfidf(a.tfidf);
        const labels = arr(a.labels, 'labels', LIMITS.labels).map((l, i) => {
          if (!isObj(l)) fail(`labels[${i}] is not a label`);
          const o = l as Record<string, unknown>;
          return { key: str(o.key, `labels[${i}].key`, 200), type: str(o.type, `labels[${i}].type`, 30), label: str(o.label, `labels[${i}].label`, 200), medianQty: num(o.medianQty, `labels[${i}].medianQty`) };
        });
        const intercepts = arr(a.intercepts, 'intercepts', LIMITS.labels).map((x, i) => num(x, `intercepts[${i}]`));
        const weights = arr(a.weights, 'weights', LIMITS.labels).map((w, i) => checkSparse(w, tfidf.vocab.length, `weights[${i}]`));
        if (intercepts.length !== labels.length || weights.length !== labels.length) fail('labels, intercepts and weights differ in length');
        const threshold = num(a.threshold, 'threshold');
        if (threshold <= 0 || threshold >= 1) fail('threshold must be between 0 and 1');
        return { format: ARTIFACT_FORMAT, task, tfidf, labels, intercepts, weights, threshold, maxLines: int(a.maxLines, 'maxLines', 1, 30) };
      }
      case 'PRICE_ANOMALY': {
        if (!isObj(a.refs)) fail('refs are missing');
        const entries = Object.entries(a.refs as Record<string, unknown>);
        if (entries.length > LIMITS.labels * 10) fail('too many reference keys');
        // No prototype: a key like "__proto__" stays an ordinary key (and such keys are refused anyway).
        const refs: AnomalyArtifact['refs'] = Object.create(null) as AnomalyArtifact['refs'];
        for (const [k, v] of entries) {
          str(k, 'refs key', 200);
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') fail(`refs key "${k}" is not allowed`);
          if (!isObj(v)) fail(`refs.${k} is not a reference`);
          const o = v as Record<string, unknown>;
          const price = num(o.price, `refs.${k}.price`);
          const qty = num(o.qty, `refs.${k}.qty`);
          if (price <= 0 || qty <= 0) fail(`refs.${k}: price and quantity must be positive`);
          refs[k] = { price, qty, n: int(o.n, `refs.${k}.n`, 1) };
        }
        const features = arr(a.features, 'features', 3);
        if (features.join(',') !== 'price_ratio_log,qty_ratio_log,amount_ratio_log') fail('features must be price_ratio_log, qty_ratio_log, amount_ratio_log');
        if (!isObj(a.forest)) fail('forest is missing');
        const f = a.forest as Record<string, unknown>;
        const trees = arr(f.trees, 'forest.trees', LIMITS.trees).map((t, i) => checkTree(t, 3, `forest.trees[${i}]`, true) as Tree & { samples: number[] });
        if (!trees.length) fail('forest has no trees');
        return { format: ARTIFACT_FORMAT, task, refs, features: ['price_ratio_log', 'qty_ratio_log', 'amount_ratio_log'], forest: { trees, maxSamples: int(f.maxSamples, 'forest.maxSamples', 2), offset: num(f.offset, 'forest.offset') } };
      }
      case 'PARTS_DEMAND': {
        const methods = new Set(['croston_sba', 'ses', 'moving_average', 'none']);
        const parts = arr(a.parts, 'parts', LIMITS.parts).map((p, i) => {
          if (!isObj(p)) fail(`parts[${i}] is not a part`);
          const o = p as Record<string, unknown>;
          const method = str(o.method, `parts[${i}].method`, 20);
          if (!methods.has(method)) fail(`parts[${i}].method is unknown`);
          const nn = (x: unknown, w: string) => { const n = num(x, w); return n >= 0 ? n : fail(`${w} must not be negative`); };
          const orNull = (x: unknown, w: string) => (x === null ? null : nn(x, w));
          return {
            partId: str(o.partId, `parts[${i}].partId`, 40), method: method as DemandPart['method'],
            weeklyRate: nn(o.weeklyRate, `parts[${i}].weeklyRate`), weeklySd: nn(o.weeklySd, `parts[${i}].weeklySd`), forecast4w: nn(o.forecast4w, `parts[${i}].forecast4w`),
            safetyStock: nn(o.safetyStock, `parts[${i}].safetyStock`), reorderPoint: nn(o.reorderPoint, `parts[${i}].reorderPoint`),
            backtestMae: orNull(o.backtestMae, `parts[${i}].backtestMae`), baselineMae: orNull(o.baselineMae, `parts[${i}].baselineMae`), nonzeroWeeks: int(o.nonzeroWeeks, `parts[${i}].nonzeroWeeks`),
          };
        });
        const asOf = str(a.asOf, 'asOf', 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) fail('asOf must be a date (YYYY-MM-DD)');
        return { format: ARTIFACT_FORMAT, task, asOf, weeks: int(a.weeks, 'weeks', 1, 520), leadTimeWeeks: num(a.leadTimeWeeks, 'leadTimeWeeks'), serviceZ: num(a.serviceZ, 'serviceZ'), parts };
      }
      case 'COMPLAINT_THEMES': {
        const tfidf = checkTfidf(a.tfidf);
        const themes = arr(a.themes, 'themes', LIMITS.themes).map((t, i) => {
          if (!isObj(t)) fail(`themes[${i}] is not a theme`);
          const o = t as Record<string, unknown>;
          return {
            label: str(o.label, `themes[${i}].label`, 120),
            terms: arr(o.terms, `themes[${i}].terms`, 20).map((x, k) => str(x, `themes[${i}].terms[${k}]`, 80)),
            centroid: checkSparse(o.centroid, tfidf.vocab.length, `themes[${i}].centroid`),
            size: int(o.size, `themes[${i}].size`),
            share: num(o.share, `themes[${i}].share`),
            monthly: arr(o.monthly, `themes[${i}].monthly`, 60).map((m, k) => {
              if (!isObj(m)) fail(`themes[${i}].monthly[${k}] is not a month`);
              const mm = m as Record<string, unknown>;
              const month = str(mm.month, `themes[${i}].monthly[${k}].month`, 7);
              if (!/^\d{4}-\d{2}$/.test(month)) fail(`themes[${i}].monthly[${k}].month must be YYYY-MM`);
              return { month, count: int(mm.count, `themes[${i}].monthly[${k}].count`) };
            }),
          };
        });
        const minSimilarity = num(a.minSimilarity, 'minSimilarity');
        return { format: ARTIFACT_FORMAT, task, tfidf, themes, minSimilarity };
      }
      case 'DECISION_RISK': {
        const steps = arr(a.steps, 'steps', 40).map((x, i) => str(x, `steps[${i}]`, 40));
        const roles = arr(a.roles, 'roles', 80).map((x, i) => str(x, `roles[${i}]`, 60));
        for (const x of [...steps, ...roles]) if (!/^[a-z0-9_-]{1,60}$/.test(x)) fail(`"${x}" is not a step or role key`);
        if (!steps.length) fail('steps must not be empty');
        const features = arr(a.features, 'features', 200).map((x, i) => str(x, `features[${i}]`, 80));
        const want = [...steps.map((x) => `step:${x}`), ...roles.map((x) => `requester:${x}`), 'requester:other', 'log_amount', 'lines', 'hour', 'weekday', 'has_amount'];
        if (features.join('|') !== want.join('|')) fail('features must follow the steps and roles (step:…, requester:…, requester:other, log_amount, lines, hour, weekday, has_amount)');
        const trees = checkTrees(a.trees, features.length, 'trees');
        if (!trees.length) fail('trees must not be empty');
        if (!isObj(a.calibration)) fail('calibration is missing');
        const c = a.calibration as Record<string, unknown>;
        const x = arr(c.x, 'calibration.x', 2000).map((v, i) => num(v, `calibration.x[${i}]`));
        const y = arr(c.y, 'calibration.y', 2000).map((v, i) => num(v, `calibration.y[${i}]`));
        if (x.length < 2 || x.length !== y.length) fail('calibration needs at least two points, x and y of the same length');
        for (let i = 1; i < x.length; i += 1) {
          if (x[i]! < x[i - 1]!) fail('calibration.x must not decrease');
          if (y[i]! < y[i - 1]! - 1e-12) fail('calibration.y must not decrease');
        }
        if (y.some((v) => v < 0 || v > 1)) fail('calibration.y must be probabilities (0 to 1)');
        return { format: ARTIFACT_FORMAT, task, steps, roles, features, trees, calibration: { x, y } };
      }
      default:
        return fail('Unknown task');
    }
  } catch (err) {
    if (err instanceof Invalid) throw new ArtifactError(err.message);
    throw err;
  }
}

export class ArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactError';
  }
}
