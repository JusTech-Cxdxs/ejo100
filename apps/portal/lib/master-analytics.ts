import { dayKind, lagosYmd } from '@/lib/nigeria-calendar';

/**
 * Master analytics — pure functions over plain rows (tested against
 * hand-worked answers). Method (standard dealership accounting):
 *
 *  • A job's SALES are counted when it is completed (finishedAt).
 *    Lines split into Labour (LABOUR, INTERNAL_JOB), Parts (STORE_PART,
 *    EXTERNAL_PART), Sublet (EXTERNAL_JOB) and Sundry (SUNDRY).
 *  • Who pays: CUSTOMER lines = customer sales; WARRANTY lines = sales
 *    recoverable from the warranty provider; GOODWILL / INTERNAL lines are
 *    given away (no revenue; their cost still counts).
 *  • COST OF SALES = issued parts at their actual goods-receipt cost +
 *    sublet cash actually disbursed (external procurement).
 *  • GROSS PROFIT = sales − cost of sales.
 *  • CASH: collections = payments − refunds in the period; receivables =
 *    what customers still owe on finished jobs.
 */

export type Line = { type: string; amount: number; billTo: string };
export type Job = {
  kind: 'JC' | 'SV';
  id: string;
  number: string;
  customer: string;
  status: string;
  openedAt: Date;
  finishedAt: Date | null;
  cancelled: boolean;
  lines: Line[];
  partsCost: number;
  partsIssuedWithoutCost: number;
  subletCost: number;
  payments: { at: Date; amount: number }[];
  refunds: { at: Date; amount: number }[];
};
export type Purchase = { at: Date; cost: number };
export type Settlement = { at: Date; amount: number };

const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export const LINE_GROUP: Record<string, 'labour' | 'parts' | 'sublet' | 'sundry'> = {
  LABOUR: 'labour', INTERNAL_JOB: 'labour', STORE_PART: 'parts', EXTERNAL_PART: 'parts', EXTERNAL_JOB: 'sublet', SUNDRY: 'sundry',
};

/** Money on one job, by group and payer. */
export function jobMoney(j: Job) {
  const g = { labour: 0, parts: 0, sublet: 0, sundry: 0 };
  let customer = 0, warranty = 0, givenAway = 0;
  for (const l of j.lines) {
    const amt = l.amount || 0;
    if (l.billTo === 'GOODWILL' || l.billTo === 'INTERNAL') { givenAway += amt; continue; }
    if (l.billTo === 'WARRANTY') warranty += amt; else customer += amt;
    g[LINE_GROUP[l.type] ?? 'sundry'] += amt;
  }
  const sales = customer + warranty;
  const cost = j.partsCost + j.subletCost;
  const paid = sum(j.payments.map((p) => p.amount)) - sum(j.refunds.map((p) => p.amount));
  return { ...g, customer: r2(customer), warranty: r2(warranty), givenAway: r2(givenAway), sales: r2(sales), cost: r2(cost), grossProfit: r2(sales - cost), paid: r2(paid), owed: r2(customer - paid) };
}

function inRange(d: Date | null, from: Date, to: Date) {
  return d !== null && +d >= +from && +d < +to;
}

function periodTotals(jobs: Job[], purchases: Purchase[], settlements: Settlement[], from: Date, to: Date) {
  const done = jobs.filter((j) => !j.cancelled && inRange(j.finishedAt, from, to));
  const m = done.map(jobMoney);
  const t = (k: keyof ReturnType<typeof jobMoney>) => r2(sum(m.map((x) => x[k] as number)));
  const sales = t('sales');
  const cost = t('cost');
  const partsCost = r2(sum(done.map((j) => j.partsCost)));
  const subletCost = r2(sum(done.map((j) => j.subletCost)));
  const collections = r2(sum(jobs.flatMap((j) => j.payments.filter((p) => inRange(p.at, from, to)).map((p) => p.amount))) - sum(jobs.flatMap((j) => j.refunds.filter((p) => inRange(p.at, from, to)).map((p) => p.amount))));
  return {
    jobsCompleted: done.length,
    jobCardsCompleted: done.filter((j) => j.kind === 'JC').length,
    servicesCompleted: done.filter((j) => j.kind === 'SV').length,
    jobsOpened: jobs.filter((j) => inRange(j.openedAt, from, to)).length,
    cancelled: jobs.filter((j) => j.cancelled && inRange(j.openedAt, from, to)).length,
    labour: t('labour'), parts: t('parts'), sublet: t('sublet'), sundry: t('sundry'),
    customerSales: t('customer'), warrantySales: t('warranty'), givenAway: t('givenAway'),
    sales, partsCost, subletCost, cost,
    grossProfit: r2(sales - cost),
    grossMargin: pct(sales - cost, sales),
    partsMargin: pct(t('parts') - partsCost, t('parts')),
    labourShare: pct(t('labour'), sales),
    averageJob: done.length ? r2(sales / done.length) : null,
    collections,
    purchases: r2(sum(purchases.filter((p) => inRange(p.at, from, to)).map((p) => p.cost))),
    warrantySettled: r2(sum(settlements.filter((s) => inRange(s.at, from, to)).map((s) => s.amount))),
  };
}
export type PeriodTotals = ReturnType<typeof periodTotals>;

/** Least-squares line through points (x = 0..n-1). */
export function linearFit(ys: number[]) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, residualSd: 0 };
  const xm = (n - 1) / 2;
  const ym = sum(ys) / n;
  let num = 0, den = 0;
  ys.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
  const slope = den ? num / den : 0;
  const intercept = ym - slope * xm;
  const resid = ys.map((y, x) => y - (intercept + slope * x));
  const residualSd = Math.sqrt(sum(resid.map((e) => e * e)) / Math.max(1, n - 2));
  return { slope, intercept, residualSd };
}

function workingDaysBetween(fromYmd: string, toYmdInclusive: string) {
  let n = 0;
  const d = new Date(`${fromYmd}T12:00:00+01:00`);
  while (d.toISOString().slice(0, 10) <= toYmdInclusive) {
    if (dayKind(d.toISOString().slice(0, 10)).working) n += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export function computeMasterAnalytics(input: { jobs: Job[]; purchases: Purchase[]; settlements: Settlement[]; from: Date; to: Date; now?: Date }) {
  const now = input.now ?? new Date();
  const { jobs, purchases, settlements, from, to } = input;
  const span = +to - +from;
  const prevFrom = new Date(+from - span);
  const current = periodTotals(jobs, purchases, settlements, from, to);
  const previous = periodTotals(jobs, purchases, settlements, prevFrom, from);
  const change = (a: number | null, b: number | null) => (a === null || b === null ? null : b === 0 ? (a === 0 ? 0 : null) : Math.round(((a - b) / Math.abs(b)) * 1000) / 10);

  // ── Position now (not period-bound)
  const open = jobs.filter((j) => !j.cancelled && !j.finishedAt);
  const finishedOwing = jobs.filter((j) => !j.cancelled && j.finishedAt).map((j) => ({ j, m: jobMoney(j) })).filter((x) => x.m.owed > 0.009);
  const overpaid = jobs.filter((j) => !j.cancelled).map((j) => ({ j, m: jobMoney(j) })).filter((x) => x.m.owed < -0.009);
  const aging = { d0_7: 0, d8_30: 0, d31_60: 0, d60plus: 0 };
  for (const { j, m } of finishedOwing) {
    const age = (+now - +j.finishedAt!) / DAY;
    if (age <= 7) aging.d0_7 += m.owed; else if (age <= 30) aging.d8_30 += m.owed; else if (age <= 60) aging.d31_60 += m.owed; else aging.d60plus += m.owed;
  }
  const position = {
    wipJobs: open.length,
    wipJobCards: open.filter((j) => j.kind === 'JC').length,
    wipServices: open.filter((j) => j.kind === 'SV').length,
    wipValue: r2(sum(open.map((j) => jobMoney(j).sales))),
    receivables: r2(sum(finishedOwing.map((x) => x.m.owed))),
    receivableJobs: finishedOwing.length,
    aging: { d0_7: r2(aging.d0_7), d8_30: r2(aging.d8_30), d31_60: r2(aging.d31_60), d60plus: r2(aging.d60plus) },
    overpaidTotal: r2(-sum(overpaid.map((x) => x.m.owed))),
  };

  // ── Weekly trend (12 weeks ending this week, Monday starts)
  const thisMonday = (() => { const d = new Date(`${lagosYmd(now)}T00:00:00+01:00`); const dow = (new Date(+d + 12 * 3600000).getUTCDay() + 6) % 7; return new Date(+d - dow * DAY); })();
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const s = new Date(+thisMonday - (11 - i) * 7 * DAY);
    const e = new Date(+s + 7 * DAY);
    const t = periodTotals(jobs, purchases, settlements, s, e);
    return { label: s.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short' }), sales: t.sales, grossProfit: t.grossProfit, jobs: t.jobsCompleted, collections: t.collections };
  });

  // ── Diagnostic
  const volumeEffect = previous.averageJob !== null ? r2((current.jobsCompleted - previous.jobsCompleted) * previous.averageJob) : null;
  // The rest of the change is down to job size — taken as the remainder so
  // the two explanations always add up exactly to the change.
  const ticketEffect = volumeEffect !== null && current.averageJob !== null ? r2(current.sales - previous.sales - volumeEffect) : null;
  const doneNow = jobs.filter((j) => !j.cancelled && inRange(j.finishedAt, from, to));
  const byCustomer = new Map<string, number>();
  for (const j of doneNow) byCustomer.set(j.customer, (byCustomer.get(j.customer) ?? 0) + jobMoney(j).sales);
  const diagnostic = {
    salesChange: r2(current.sales - previous.sales),
    volumeEffect,
    ticketEffect,
    marginChange: current.grossMargin !== null && previous.grossMargin !== null ? Math.round((current.grossMargin - previous.grossMargin) * 10) / 10 : null,
    partsMarginChange: current.partsMargin !== null && previous.partsMargin !== null ? Math.round((current.partsMargin - previous.partsMargin) * 10) / 10 : null,
    labourShareChange: current.labourShare !== null && previous.labourShare !== null ? Math.round((current.labourShare - previous.labourShare) * 10) / 10 : null,
    mix: [
      { name: 'Labour', value: current.labour }, { name: 'Parts', value: current.parts }, { name: 'Sublet', value: current.sublet }, { name: 'Sundry', value: current.sundry },
    ],
    topCustomers: [...byCustomer.entries()].map(([name, value]) => ({ name, value: r2(value) })).sort((a, b) => b.value - a.value).slice(0, 8),
  };

  // ── Predictive
  const fit = linearFit(weeks.map((w) => w.sales));
  const forecast = Array.from({ length: 4 }, (_, i) => {
    const x = weeks.length + i;
    const mid = Math.max(0, fit.intercept + fit.slope * x);
    return { label: `Week +${i + 1}`, expected: r2(mid), low: r2(Math.max(0, mid - 1.28 * fit.residualSd)), high: r2(mid + 1.28 * fit.residualSd) };
  });
  const monthStart = `${lagosYmd(now).slice(0, 7)}-01`;
  const monthEndDate = new Date(Date.UTC(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const today = lagosYmd(now);
  const wdTotal = workingDaysBetween(monthStart, monthEndDate);
  const wdDone = workingDaysBetween(monthStart, today);
  const monthSoFar = periodTotals(jobs, purchases, settlements, new Date(`${monthStart}T00:00:00+01:00`), new Date(+now + 1));
  const predictive = {
    trendPerWeek: r2(fit.slope),
    forecast,
    monthToDate: monthSoFar.sales,
    monthProjection: wdDone > 0 ? r2((monthSoFar.sales / wdDone) * wdTotal) : null,
    workingDaysDone: wdDone,
    workingDaysInMonth: wdTotal,
  };

  // ── Prescriptive
  type Action = { priority: 1 | 2 | 3; title: string; detail: string; href: string };
  const actions: Action[] = [];
  const money = (n: number) => `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
  const plural = (n: number, w: string, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;
  const href = (j: Job) => (j.kind === 'JC' ? `/workshop/job-cards/${j.id}` : `/workshop/vehicle-service/${j.id}`);
  const chase = finishedOwing.sort((a, b) => b.m.owed - a.m.owed);
  if (chase.length) actions.push({ priority: 1, title: `${money(position.receivables)} owed on ${plural(chase.length, 'finished job')}`, detail: `Largest: ${chase.slice(0, 3).map((x) => `${x.j.number} (${money(x.m.owed)})`).join(', ')}.`, href: href(chase[0]!.j) });
  if (overpaid.length) actions.push({ priority: 1, title: `${money(position.overpaidTotal)} to refund on ${plural(overpaid.length, 'job')}`, detail: 'Customers paid more than they owe — Finance can refund from the job.', href: href(overpaid[0]!.j) });
  const loss = doneNow.map((j) => ({ j, m: jobMoney(j) })).filter((x) => x.m.sales > 0 && x.m.grossProfit < 0);
  if (loss.length) actions.push({ priority: 1, title: `${plural(loss.length, 'job')} sold below cost this period`, detail: loss.slice(0, 3).map((x) => `${x.j.number} (${money(x.m.grossProfit)})`).join(', ') + ' — check pricing.', href: href(loss[0]!.j) });
  const thin = doneNow.map((j) => ({ j, m: jobMoney(j) })).filter((x) => x.m.sales > 0 && x.m.grossProfit >= 0 && x.m.grossProfit / x.m.sales < 0.1);
  if (thin.length) actions.push({ priority: 2, title: `${plural(thin.length, 'job')} with a margin under 10%`, detail: thin.slice(0, 3).map((x) => x.j.number).join(', '), href: href(thin[0]!.j) });
  const stalled = open.filter((j) => (+now - +j.openedAt) / DAY > 14).sort((a, b) => +a.openedAt - +b.openedAt);
  if (stalled.length) actions.push({ priority: 2, title: `${plural(stalled.length, 'job')} open for more than 14 days`, detail: stalled.slice(0, 3).map((j) => `${j.number} (${Math.floor((+now - +j.openedAt) / DAY)} days)`).join(', '), href: href(stalled[0]!) });
  const uncosted = jobs.filter((j) => j.partsIssuedWithoutCost > 0);
  if (uncosted.length) actions.push({ priority: 2, title: `${plural(uncosted.length, 'job')} with parts issued without a recorded cost`, detail: 'Profit on these jobs is overstated until the goods receipt cost is recorded.', href: '/inventory/goods-receipts' });
  if (current.purchases > 0 && current.partsCost > 0 && current.purchases > current.partsCost * 1.5) actions.push({ priority: 3, title: 'Buying much more than is being used', detail: `Purchases ${money(current.purchases)} vs parts used ${money(current.partsCost)} this period — stock is building up.`, href: '/inventory/analytics' });
  if (predictive.monthProjection !== null && previous.sales > 0 && predictive.monthProjection < previous.sales * 0.85) actions.push({ priority: 3, title: 'This month is tracking below the last period', detail: `Projected ${money(predictive.monthProjection)} — follow up open estimates and due services.`, href: '/workshop' });
  actions.sort((a, b) => a.priority - b.priority);

  return {
    period: { from, to, prevFrom },
    current, previous,
    changes: { sales: change(current.sales, previous.sales), grossProfit: change(current.grossProfit, previous.grossProfit), jobsCompleted: change(current.jobsCompleted, previous.jobsCompleted), averageJob: change(current.averageJob, previous.averageJob), collections: change(current.collections, previous.collections) },
    position, weeks, diagnostic, predictive, actions,
  };
}
export type MasterAnalytics = ReturnType<typeof computeMasterAnalytics>;
