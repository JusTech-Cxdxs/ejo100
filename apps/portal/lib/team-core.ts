/**
 * Team performance (pure, tested): how each person handles the steps that
 * wait on them — how many, how fast (median hours from the moment it reached
 * them), the share done within the standard, and the money involved.
 */
import { median } from './hq-core';

/** The service standard for each kind of step, in working-clock hours. */
export const STANDARDS = {
  job: { label: 'Job, work started to finished', hours: 72 },
  estimateCheck: { label: 'Estimate checked by the supervisor', hours: 24 },
  estimateFinal: { label: 'Estimate final approval', hours: 24 },
  partsHod: { label: 'Parts request, manager approval', hours: 8 },
  partsStore: { label: 'Parts request, Store approval', hours: 8 },
  partsRelease: { label: 'Parts released after approval', hours: 8 },
  eprReview: { label: 'Outside purchase, Finance review', hours: 24 },
  eprApprove: { label: 'Outside purchase, manager approval', hours: 24 },
  eprPay: { label: 'Outside purchase, paid out after approval', hours: 24 },
} as const;
export type StepKind = keyof typeof STANDARDS;

/** One step one person handled: when it reached them, when they did it, and any money. */
export type Handled = { userId: string | null; kind: StepKind; from: Date | null; to: Date; value?: number; rework?: boolean };

export type PersonStep = { kind: StepKind; label: string; count: number; medianHours: number | null; withinPct: number | null; standardHours: number };
export type PersonRow = {
  userId: string; name: string; roles: string; branch: string | null;
  handled: number; value: number; rework: number; openNow: number;
  medianHours: number | null; withinPct: number | null;
  steps: PersonStep[];
  rating: 'strong' | 'steady' | 'attention' | 'quiet';
};

const hours = (a: Date | null, b: Date) => (a ? Math.max(0, (b.getTime() - a.getTime()) / 3_600_000) : null);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/**
 * Per person: totals across every kind of step, and each kind on its own.
 * Rating: "attention" when under 60% within the standard (with at least three
 * steps) or rework on more than a fifth of finished jobs; "strong" when 90%
 * or more within the standard on at least five; "quiet" when nothing handled.
 */
export function summariseTeam(items: Handled[], people: { id: string; name: string; roles: string; branch: string | null }[], openNow: Map<string, number> = new Map()): PersonRow[] {
  const byUser = new Map<string, Handled[]>();
  for (const h of items) if (h.userId) byUser.set(h.userId, [...(byUser.get(h.userId) ?? []), h]);
  return people.map((p) => {
    const mine = byUser.get(p.id) ?? [];
    const kinds = [...new Set(mine.map((h) => h.kind))];
    const steps: PersonStep[] = kinds.map((k) => {
      const xs = mine.filter((h) => h.kind === k);
      const hs = xs.map((h) => hours(h.from, h.to)).filter((v): v is number => v !== null);
      const within = hs.filter((v) => v <= STANDARDS[k].hours).length;
      return { kind: k, label: STANDARDS[k].label, count: xs.length, medianHours: round1(median(hs)), withinPct: hs.length ? Math.round((within / hs.length) * 100) : null, standardHours: STANDARDS[k].hours };
    }).sort((a, b) => b.count - a.count);
    const all: { h: number; std: number }[] = [];
    for (const h of mine) { const v = hours(h.from, h.to); if (v !== null) all.push({ h: v, std: STANDARDS[h.kind].hours }); }
    const withinPct = all.length ? Math.round((all.filter((x) => x.h <= x.std).length / all.length) * 100) : null;
    const jobs = mine.filter((h) => h.kind === 'job');
    const rework = jobs.filter((h) => h.rework).length;
    const rating: PersonRow['rating'] = !mine.length ? 'quiet'
      : (withinPct !== null && all.length >= 3 && withinPct < 60) || (jobs.length >= 3 && rework / jobs.length > 0.2) ? 'attention'
      : withinPct !== null && all.length >= 5 && withinPct >= 90 ? 'strong' : 'steady';
    return {
      userId: p.id, name: p.name, roles: p.roles, branch: p.branch,
      handled: mine.length, value: Math.round(mine.reduce((n, h) => n + (h.value ?? 0), 0)), rework, openNow: openNow.get(p.id) ?? 0,
      medianHours: round1(median(all.map((x) => x.h))), withinPct, steps, rating,
    };
  }).sort((a, b) => b.handled - a.handled || a.name.localeCompare(b.name));
}

export const RATING_LABEL: Record<PersonRow['rating'], string> = { strong: 'Strong', steady: 'Steady', attention: 'Needs attention', quiet: 'Nothing this period' };
