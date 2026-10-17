/**
 * IT trends and the website report, computed in code (pure, tested): counts
 * per Lagos day over a window, and the visitor summary — visitors per day,
 * page views, those who chatted with Enyo against those who only browsed,
 * time on page, top pages, devices and where visitors came from.
 */
import { lagosYmd } from './nigeria-calendar';

const DAY = 86_400_000;

/** The last `n` Lagos days, oldest first, as "YYYY-MM-DD". */
export function lastDays(n: number, now = new Date()): string[] {
  const today = lagosYmd(now);
  const base = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * DAY).toISOString().slice(0, 10));
}

/** "Sat 17" for a "YYYY-MM-DD". */
export function dayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`;
}

/** How many of `dates` fall on each of `days` (Lagos). */
export function perDay(dates: Date[], days: string[]): number[] {
  const at = new Map(days.map((d, i) => [d, i]));
  const out = days.map(() => 0);
  for (const d of dates) {
    const i = at.get(lagosYmd(d));
    if (i !== undefined) out[i]! += 1;
  }
  return out;
}

/** Direction of a series: the second half against the first. */
export function trendOf(values: number[]): { change: number | null; direction: 'up' | 'down' | 'flat' } {
  const half = Math.floor(values.length / 2);
  const a = values.slice(0, half).reduce((s, v) => s + v, 0);
  const b = values.slice(values.length - half).reduce((s, v) => s + v, 0);
  if (!a && !b) return { change: null, direction: 'flat' };
  if (!a) return { change: null, direction: 'up' };
  const change = Math.round(((b - a) / a) * 100);
  return { change, direction: change > 5 ? 'up' : change < -5 ? 'down' : 'flat' };
}

export type VisitRow = { day: Date; visitorHash: string; sessionId: string; path: string; durationSec: number; chatted: boolean; device: string; referrerHost: string | null };

export type WebsiteReport = {
  days: { day: string; label: string; visitors: number; views: number; chatted: number }[];
  totals: { visitors: number; views: number; chatted: number; browsedOnly: number; chattedPct: number; avgSeconds: number; viewsPerVisitor: number; singlePagePct: number };
  topPages: { path: string; views: number; visitors: number; avgSeconds: number }[];
  devices: { device: string; visitors: number }[];
  referrers: { host: string; views: number }[];
};

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : 0);

/**
 * The website report. Time on page averages only views that reported a time
 * (a page closed before the browser could report counts as unknown, not 0).
 */
export function summariseVisits(rows: VisitRow[], days: string[]): WebsiteReport {
  const byDay = new Map(days.map((d) => [d, { visitors: new Set<string>(), views: 0, chatted: new Set<string>() }]));
  const visitors = new Set<string>();
  const chatted = new Set<string>();
  const pages = new Map<string, { views: number; visitors: Set<string>; secs: number[] }>();
  const devices = new Map<string, Set<string>>();
  const refs = new Map<string, number>();
  const sessions = new Map<string, number>();
  const timed: number[] = [];
  for (const r of rows) {
    const ymd = r.day.toISOString().slice(0, 10);
    const d = byDay.get(ymd);
    if (!d) continue;
    d.visitors.add(r.visitorHash);
    d.views += 1;
    if (r.chatted) { d.chatted.add(r.visitorHash); chatted.add(r.visitorHash); }
    visitors.add(r.visitorHash);
    const p = pages.get(r.path) ?? { views: 0, visitors: new Set<string>(), secs: [] };
    p.views += 1;
    p.visitors.add(r.visitorHash);
    if (r.durationSec > 0) { p.secs.push(r.durationSec); timed.push(r.durationSec); }
    pages.set(r.path, p);
    const dv = devices.get(r.device) ?? new Set<string>();
    dv.add(r.visitorHash);
    devices.set(r.device, dv);
    if (r.referrerHost) refs.set(r.referrerHost, (refs.get(r.referrerHost) ?? 0) + 1);
    const sk = `${r.visitorHash}|${r.sessionId}`;
    sessions.set(sk, (sessions.get(sk) ?? 0) + 1);
  }
  const views = [...byDay.values()].reduce((s, d) => s + d.views, 0);
  const single = [...sessions.values()].filter((n) => n === 1).length;
  return {
    days: days.map((day) => { const d = byDay.get(day)!; return { day, label: dayLabel(day), visitors: d.visitors.size, views: d.views, chatted: d.chatted.size }; }),
    totals: {
      visitors: visitors.size, views, chatted: chatted.size, browsedOnly: visitors.size - chatted.size,
      chattedPct: visitors.size ? Math.round((chatted.size / visitors.size) * 100) : 0,
      avgSeconds: avg(timed), viewsPerVisitor: visitors.size ? Math.round((views / visitors.size) * 10) / 10 : 0,
      singlePagePct: sessions.size ? Math.round((single / sessions.size) * 100) : 0,
    },
    topPages: [...pages.entries()].map(([path, p]) => ({ path, views: p.views, visitors: p.visitors.size, avgSeconds: avg(p.secs) })).sort((a, b) => b.views - a.views).slice(0, 10),
    devices: [...devices.entries()].map(([device, s]) => ({ device, visitors: s.size })).sort((a, b) => b.visitors - a.visitors),
    referrers: [...refs.entries()].map(([host, n]) => ({ host, views: n })).sort((a, b) => b.views - a.views).slice(0, 8),
  };
}

/** "1m 05s" / "42s". */
export function secondsText(s: number): string {
  if (!s) return '—';
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}
