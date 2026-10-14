/**
 * Estimate lines: how two lines are recognised as "the same line", how the
 * lines of similar past jobs are combined into a prediction, and how a
 * prediction is scored against what was finally approved.
 *
 * Pure (no database), unit-tested, and written so the Python training code
 * can reproduce it exactly (docs/AI_READINESS.md, "Training data").
 */
import { normaliseText, tokenise } from './text';

export const LINE_TYPES = ['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'] as const;
export type LineType = (typeof LINE_TYPES)[number];
/** The line types a Vehicle Service estimate can hold. */
export const SERVICE_LINE_TYPES: readonly LineType[] = ['STORE_PART', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'];

/** One approved line of a past job (or of the job being resolved). */
export type HistLine = {
  type: LineType;
  description: string;
  /** STORE_PART: the part type asked for ("Brake Pads"). */
  partTypeName?: string | null;
  categoryName?: string | null;
  quantity: number;
  unitPrice: number | null;
  amount: number | null;
};

export type Neighbour = {
  id: string;
  kind: 'JOB_CARD' | 'SERVICE';
  number: string;
  branchId: string;
  similarity: number;
  lines: HistLine[];
};

export type Range = { median: number; p25: number; p75: number };

export type PredictedLine = {
  key: string;
  type: LineType;
  label: string;
  partTypeName: string | null;
  categoryName: string | null;
  /** How many of the similar jobs had this line. */
  support: number;
  /** Out of how many similar jobs. */
  of: number;
  /** Similarity-weighted share of the similar jobs that had it (0..1). */
  confidence: number;
  quantity: number;
  /** Labour, internal and outside jobs, sundry: what similar jobs charged per unit. Never for Store parts (priced from today's Store price). */
  unitPrice: Range | null;
  /** Same, for the whole line. */
  amount: Range | null;
  /** The similar jobs (ids) that had this line. */
  evidence: string[];
};

/** Words that say nothing about WHICH labour / job a line is. */
const LINE_FILLER = new Set(['labour', 'labor', 'workmanship', 'charge', 'charg', 'fee', 'cost', 'job', 'work', 'repair', 'repairs', 'misc', 'miscellaneous', 'sundry', 'sundrie', 'consumable', 'item', 'items', 'servic', 'general']);

/**
 * A line's identity: Store parts by their part type (the same across
 * branches, which each have their own catalogue), Sundry as one line, the
 * rest by type plus the meaningful words of the description, sorted — so
 * "Labour for Brake" and "Brake labour" are the same line.
 */
export function lineKey(line: Pick<HistLine, 'type' | 'description' | 'partTypeName'>): string {
  if (line.type === 'SUNDRY') return 'SUNDRY';
  if (line.type === 'STORE_PART') return `STORE_PART:${normaliseText(line.partTypeName || line.description)}`;
  const words = [...new Set(tokenise(line.description).filter((w) => !LINE_FILLER.has(w)))].sort();
  return words.length ? `${line.type}:${words.join(' ')}` : line.type;
}

/** Linear-interpolated percentile (the same as numpy's default), xs need not be sorted. */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.min(s.length - 1, lo + 1);
  return s[lo]! + (h - lo) * (s[hi]! - s[lo]!);
}

export function median(xs: number[]): number {
  return percentile(xs, 0.5);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

function range(xs: number[]): Range | null {
  const v = xs.filter((x) => Number.isFinite(x) && x >= 0);
  if (v.length === 0) return null;
  return { median: round2(median(v)), p25: round2(percentile(v, 0.25)), p75: round2(percentile(v, 0.75)) };
}

/** Lines are only predicted from at least this many similar jobs. */
export const MIN_NEIGHBOURS = 3;

export type AggregateOptions = {
  /** A line must appear in at least this share of the similar jobs (default 0.4). */
  minShare?: number;
  /** …and in at least this many of them (default 2). */
  minSupport?: number;
  /** Only these line types (a Vehicle Service has no outside lines). */
  allowedTypes?: readonly LineType[];
  /** At most this many lines (default 12). */
  maxLines?: number;
};

export type Aggregate =
  | { ok: true; lines: PredictedLine[]; neighbours: number }
  | { ok: false; reason: string; neighbours: number };

/** The most common original wording, for the label people see. */
function mostCommon(xs: string[]): string {
  const n = new Map<string, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
}

/**
 * Combines the approved lines of the similar jobs: a line is predicted when
 * enough of them had it; its quantity is the median across those jobs; for
 * priced-by-people lines (labour, jobs, sundry) the price is the median with
 * the middle half (p25–p75). Store parts carry no price here — they are
 * priced from today's Store selling price when shown.
 */
export function aggregateLines(neighbours: Neighbour[], opts: AggregateOptions = {}): Aggregate {
  const n = neighbours.length;
  if (n < MIN_NEIGHBOURS) {
    return {
      ok: false,
      neighbours: n,
      reason: n === 0
        ? 'No similar finished jobs were found yet, so there is nothing to learn from.'
        : `Only ${n} similar finished ${n === 1 ? 'job was' : 'jobs were'} found; at least ${MIN_NEIGHBOURS} are needed before suggesting lines.`,
    };
  }
  const minShare = opts.minShare ?? 0.4;
  const minSupport = opts.minSupport ?? 2;
  const allowed = opts.allowedTypes ? new Set(opts.allowedTypes) : null;
  const totalWeight = neighbours.reduce((s, nb) => s + Math.max(nb.similarity, 1e-6), 0);

  type Acc = { type: LineType; labels: string[]; partTypeNames: string[]; categoryNames: string[]; qty: number[]; unit: number[]; amount: number[]; weight: number; evidence: string[] };
  const acc = new Map<string, Acc>();
  for (const nb of neighbours) {
    // Per job: one entry per line key (two "brake pads" lines on one job count once, quantities added).
    const perJob = new Map<string, { type: LineType; labels: string[]; partTypeName: string | null; categoryName: string | null; qty: number; amount: number; priced: boolean; units: number[] }>();
    for (const l of nb.lines) {
      if (allowed && !allowed.has(l.type)) continue;
      const key = lineKey(l);
      const qty = Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1;
      const amount = l.amount !== null && Number.isFinite(l.amount) ? l.amount : l.unitPrice !== null && Number.isFinite(l.unitPrice) ? l.unitPrice * qty : null;
      const unit = l.unitPrice !== null && Number.isFinite(l.unitPrice) ? l.unitPrice : amount !== null ? amount / qty : null;
      const cur = perJob.get(key) ?? { type: l.type, labels: [], partTypeName: l.partTypeName ?? null, categoryName: l.categoryName ?? null, qty: 0, amount: 0, priced: false, units: [] };
      cur.labels.push(l.type === 'STORE_PART' ? (l.partTypeName || l.description) : l.description.trim());
      cur.qty += qty;
      if (amount !== null) { cur.amount += amount; cur.priced = true; }
      if (unit !== null) cur.units.push(unit);
      perJob.set(key, cur);
    }
    for (const [key, j] of perJob) {
      const a = acc.get(key) ?? { type: j.type, labels: [], partTypeNames: [], categoryNames: [], qty: [], unit: [], amount: [], weight: 0, evidence: [] };
      a.labels.push(...j.labels);
      if (j.partTypeName) a.partTypeNames.push(j.partTypeName);
      if (j.categoryName) a.categoryNames.push(j.categoryName);
      a.qty.push(j.qty);
      if (j.priced) a.amount.push(j.amount);
      a.unit.push(...j.units);
      a.weight += Math.max(nb.similarity, 1e-6);
      a.evidence.push(nb.id);
      acc.set(key, a);
    }
  }

  const ORDER: Record<LineType, number> = { STORE_PART: 0, EXTERNAL_PART: 1, INTERNAL_JOB: 2, EXTERNAL_JOB: 3, LABOUR: 4, SUNDRY: 5 };
  const lines: PredictedLine[] = [];
  for (const [key, a] of acc) {
    const support = a.evidence.length;
    if (support < minSupport || support / n < minShare) continue;
    const priced = a.type !== 'STORE_PART' && a.type !== 'EXTERNAL_PART';
    lines.push({
      key,
      type: a.type,
      label: mostCommon(a.labels),
      partTypeName: a.type === 'STORE_PART' ? mostCommon(a.partTypeNames) || mostCommon(a.labels) : null,
      categoryName: a.type === 'STORE_PART' ? mostCommon(a.categoryNames) || null : null,
      support,
      of: n,
      confidence: Math.round((a.weight / totalWeight) * 1000) / 1000,
      quantity: round2(median(a.qty)),
      unitPrice: priced ? range(a.unit) : null,
      amount: priced ? range(a.amount) : null,
      evidence: a.evidence,
    });
  }
  lines.sort((x, y) => y.confidence - x.confidence || ORDER[x.type] - ORDER[y.type] || x.label.localeCompare(y.label));
  const max = opts.maxLines ?? 12;
  if (lines.length === 0) {
    return { ok: false, neighbours: n, reason: `The ${n} similar jobs had no line in common often enough to suggest it.` };
  }
  return { ok: true, lines: lines.slice(0, max), neighbours: n };
}

export type Comparison = {
  kept: string[];
  missed: { key: string; type: LineType; label: string }[];
  extra: { key: string; type: LineType; label: string }[];
  precision: number | null;
  recall: number | null;
  labour: { predicted: number | null; approved: number | null; error: number | null };
};

/**
 * How good a prediction was: of the lines predicted, how many were approved
 * (precision); of the lines approved, how many were predicted (recall); and
 * how far the predicted labour (sum of median amounts) was from the approved
 * labour, in naira. Lines are matched by lineKey().
 */
export function compareLines(predicted: Pick<PredictedLine, 'key' | 'type' | 'label' | 'amount'>[], approved: HistLine[]): Comparison {
  const approvedByKey = new Map<string, { type: LineType; label: string }>();
  for (const l of approved) {
    const k = lineKey(l);
    if (!approvedByKey.has(k)) approvedByKey.set(k, { type: l.type, label: l.type === 'STORE_PART' ? (l.partTypeName || l.description) : l.description });
  }
  const predictedKeys = new Map<string, { type: LineType; label: string }>();
  for (const p of predicted) if (!predictedKeys.has(p.key)) predictedKeys.set(p.key, { type: p.type, label: p.label });

  const kept = [...predictedKeys.keys()].filter((k) => approvedByKey.has(k));
  const missed = [...approvedByKey.entries()].filter(([k]) => !predictedKeys.has(k)).map(([key, v]) => ({ key, ...v }));
  const extra = [...predictedKeys.entries()].filter(([k]) => !approvedByKey.has(k)).map(([key, v]) => ({ key, ...v }));

  const predictedLabourLines = predicted.filter((p) => p.type === 'LABOUR');
  const predictedLabour = predictedLabourLines.length ? round2(predictedLabourLines.reduce((s, p) => s + (p.amount?.median ?? 0), 0)) : null;
  const approvedLabourLines = approved.filter((l) => l.type === 'LABOUR');
  const approvedLabour = approvedLabourLines.length
    ? round2(approvedLabourLines.reduce((s, l) => s + (l.amount ?? (l.unitPrice !== null ? l.unitPrice * l.quantity : 0)), 0))
    : null;
  const labourError = predictedLabour === null && approvedLabour === null ? null : round2(Math.abs((predictedLabour ?? 0) - (approvedLabour ?? 0)));

  return {
    kept,
    missed,
    extra,
    precision: predictedKeys.size ? round4(kept.length / predictedKeys.size) : null,
    recall: approvedByKey.size ? round4(kept.length / approvedByKey.size) : null,
    labour: { predicted: predictedLabour, approved: approvedLabour, error: labourError },
  };
}
