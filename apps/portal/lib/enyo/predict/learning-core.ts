/**
 * What the Learning page shows, worked out from resolved predictions:
 * accuracy per week, lines kept and missed, labour error in naira, the lines
 * Enyo misses most, and progress toward the promotion rule. Pure and tested.
 */

/** The rule shown to administrators: move from Shadow to Suggest once Enyo has proved itself. The administrator decides. */
export const PROMOTION_RULE = { minResolved: 200, minPrecision: 0.7 } as const;

export type ResolvedRow = { resolvedAt: Date; precision: number | null; recall: number | null; outcome: unknown };

export type WeekPoint = {
  /** Monday of the week (Lagos), YYYY-MM-DD. */
  start: string;
  /** "7 Sep". */
  label: string;
  resolved: number;
  /** Resolved predictions that had lines to compare (accuracy counts only these). */
  withLines: number;
  /** Percent, or null when no prediction with lines was resolved that week. */
  precision: number | null;
  recall: number | null;
  kept: number;
  missed: number;
  /** Mean labour error that week, naira. */
  labourError: number | null;
};

export type Summary = {
  weeks: WeekPoint[];
  kept: number;
  missed: number;
  extra: number;
  labour: { meanError: number | null; samples: number };
  mostMissed: { label: string; type: string; count: number }[];
};

const DAY = 86_400_000;
const LAGOS = 3_600_000; // UTC+1 all year

/** Monday 00:00 in Lagos for the week containing `d`. */
export function lagosWeekStart(d: Date): Date {
  const local = new Date(d.getTime() + LAGOS);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const dow = (new Date(midnight).getUTCDay() + 6) % 7;
  return new Date(midnight - dow * DAY - LAGOS);
}

const ymd = (d: Date) => new Date(d.getTime() + LAGOS).toISOString().slice(0, 10);
const short = (d: Date) => new Date(d.getTime() + LAGOS).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pct = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 10);

type Outcome = { kept?: unknown[]; missed?: { key?: string; type?: string; label?: string }[]; extra?: unknown[]; labour?: { error?: number | null } };
const asOutcome = (o: unknown): Outcome => (o && typeof o === 'object' ? (o as Outcome) : {});

export function summarise(rows: ResolvedRow[], now: Date, weeks = 12): Summary {
  const firstWeek = new Date(lagosWeekStart(now).getTime() - (weeks - 1) * 7 * DAY);
  const buckets: { start: Date; rows: ResolvedRow[] }[] = Array.from({ length: weeks }, (_, i) => ({ start: new Date(firstWeek.getTime() + i * 7 * DAY), rows: [] }));
  for (const r of rows) {
    const i = Math.floor((lagosWeekStart(r.resolvedAt).getTime() - firstWeek.getTime()) / (7 * DAY));
    if (i >= 0 && i < weeks) buckets[i]!.rows.push(r);
  }
  let kept = 0;
  let missed = 0;
  let extra = 0;
  const labourErrors: number[] = [];
  const missedBy = new Map<string, { labels: Map<string, number>; type: string; count: number }>();
  for (const r of rows) {
    const o = asOutcome(r.outcome);
    if (r.precision !== null) {
      kept += Array.isArray(o.kept) ? o.kept.length : 0;
      extra += Array.isArray(o.extra) ? o.extra.length : 0;
    }
    for (const m of Array.isArray(o.missed) ? o.missed : []) {
      missed++;
      const key = String(m.key ?? m.label ?? '');
      if (!key) continue;
      const e = missedBy.get(key) ?? { labels: new Map<string, number>(), type: String(m.type ?? ''), count: 0 };
      e.count++;
      const label = String(m.label ?? key);
      e.labels.set(label, (e.labels.get(label) ?? 0) + 1);
      missedBy.set(key, e);
    }
    if (typeof o.labour?.error === 'number' && Number.isFinite(o.labour.error)) labourErrors.push(o.labour.error);
  }
  const weekPoints: WeekPoint[] = buckets.map((b) => {
    const withLines = b.rows.filter((r) => r.precision !== null);
    const errs = b.rows.map((r) => asOutcome(r.outcome).labour?.error).filter((e): e is number => typeof e === 'number' && Number.isFinite(e));
    const me = mean(errs);
    return {
      start: ymd(b.start),
      label: short(b.start),
      resolved: b.rows.length,
      withLines: withLines.length,
      precision: pct(mean(withLines.map((r) => r.precision!))),
      recall: pct(mean(withLines.filter((r) => r.recall !== null).map((r) => r.recall!))),
      kept: withLines.reduce((s, r) => s + (asOutcome(r.outcome).kept?.length ?? 0), 0),
      missed: b.rows.reduce((s, r) => s + (asOutcome(r.outcome).missed?.length ?? 0), 0),
      labourError: me === null ? null : Math.round(me),
    };
  });
  const me = mean(labourErrors);
  return {
    weeks: weekPoints,
    kept,
    missed,
    extra,
    labour: { meanError: me === null ? null : Math.round(me), samples: labourErrors.length },
    mostMissed: [...missedBy.values()]
      .map((e) => ({ label: [...e.labels.entries()].sort((a, b) => b[1] - a[1])[0]![0], type: e.type, count: e.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 10),
  };
}

/** Progress toward the promotion rule. */
export function promotionProgress(resolvedWithLines: number, averagePrecision: number | null) {
  const { minResolved, minPrecision } = PROMOTION_RULE;
  const enough = resolvedWithLines >= minResolved;
  const accurate = averagePrecision !== null && averagePrecision >= minPrecision;
  return {
    minResolved,
    minPrecision,
    resolvedWithLines,
    averagePrecision,
    /** 0..1, how far along the count requirement. */
    progress: Math.min(1, resolvedWithLines / minResolved),
    enough,
    accurate,
    ready: enough && accurate,
  };
}
