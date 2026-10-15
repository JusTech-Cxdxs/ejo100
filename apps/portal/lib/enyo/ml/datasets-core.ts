/**
 * Shaping the parts training set: consumption events → one weekly series per
 * part (Lagos weeks, Monday first, oldest first). Pure: tested in
 * tests/enyo-ml.test.ts.
 */
import { lagosWeekStart } from '../predict/learning-core';

const WEEK = 7 * 86_400_000;
const LAGOS = 3_600_000;

export type ConsumptionEvent = { partId: string; at: Date; quantity: number };
export type PartsRow = { part_id: string; weekly: number[]; as_of: string };

/** The Monday (Lagos date) of the last COMPLETE week before `now`. */
export function lastCompleteWeek(now: Date): Date {
  return new Date(lagosWeekStart(now).getTime() - WEEK);
}

/**
 * `weeks` complete weeks ending with the last complete one. Every part in
 * `partIds` gets a series (zeros when never used); events outside the window
 * or for other parts are ignored.
 */
export function weeklySeries(partIds: string[], events: ConsumptionEvent[], weeks: number, now: Date): PartsRow[] {
  const last = lastCompleteWeek(now).getTime();
  const first = last - (weeks - 1) * WEEK;
  const series = new Map(partIds.map((id) => [id, new Array<number>(weeks).fill(0)]));
  for (const e of events) {
    const s = series.get(e.partId);
    if (!s || !(e.quantity > 0)) continue;
    const w = lagosWeekStart(e.at).getTime();
    if (w < first || w > last) continue;
    const i = Math.round((w - first) / WEEK);
    s[i] = Math.round((s[i]! + e.quantity) * 10_000) / 10_000;
  }
  const asOf = new Date(last + LAGOS).toISOString().slice(0, 10);
  return [...series.entries()].map(([id, weekly]) => ({ part_id: id, weekly, as_of: asOf }));
}
