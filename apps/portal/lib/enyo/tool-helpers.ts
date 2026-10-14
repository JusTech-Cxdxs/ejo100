/**
 * Small shared pieces for the staff tools (server-only, never a 'use server'
 * file). Results are compact JSON; figures are computed here, in code, so the
 * model only ever quotes them.
 */
import type { Source, ToolResult } from '@ejo/enyo';
import { NOT_PERMITTED } from './types';

export { NOT_PERMITTED };

export function ok(data: unknown, sources?: Source[]): ToolResult {
  return sources?.length ? { ok: true, data, sources } : { ok: true, data };
}

/** Nothing found (or not visible — the two are never told apart). */
export function nothing(message: string): ToolResult {
  return { ok: false, message };
}

/** The person lacks the right. `why` names who has it, for a kind refusal. */
export function refused(why?: string): ToolResult {
  return why ? { ok: false, refused: true, message: `Not allowed: ${why} Say so kindly in one sentence and offer what this person can see instead.` } : NOT_PERMITTED;
}

export const text = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const r2 = (n: number): number => Math.round(n * 100) / 100;

export const money = (v: unknown): number => (v === null || v === undefined ? 0 : r2(Number(v)));

/** "Wed 14 Oct 2026" in Lagos. */
export function day(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Wed 14 Oct, 3:05 pm" in Lagos. */
export function when(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  const date = x.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' });
  const time = x.toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])m/i, (_, a: string) => ` ${a.toLowerCase()}m`);
  return `${date}, ${time}`;
}

/** Midnight in Lagos (UTC+1, no daylight saving) for a date offset in days from today. */
export function lagosDayStart(offsetDays = 0, now: Date = new Date()): Date {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const d = new Date(`${ymd}T00:00:00+01:00`);
  return new Date(d.getTime() + offsetDays * 86_400_000);
}

/** Monday 00:00 of this week, Lagos. */
export function lagosWeekStart(now: Date = new Date()): Date {
  const today = lagosDayStart(0, now);
  const dow = (new Date(today.getTime() + 12 * 3_600_000).getUTCDay() + 6) % 7;
  return new Date(today.getTime() - dow * 86_400_000);
}

export const STATUS_WORDS = (s: string): string => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** "1 job" / "2 jobs". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
