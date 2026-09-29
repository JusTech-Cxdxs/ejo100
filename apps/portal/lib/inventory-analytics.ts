import { pluralizeWord } from '@/lib/utils/pluralize';

/**
 * Inventory analytics & reorder intelligence — pure functions over plain
 * rows, so every figure is reproducible and tested. Costs are TRUE costs
 * (each issue traced to its goods-receipt line); revenue is the price
 * actually charged on the Job Card / Vehicle Service estimate (falling back
 * to the part's current selling price, flagged as estimated).
 *
 * Reorder maths (standard, assumptions shown on screen):
 *   average daily demand  d  = issues in the demand window ÷ days
 *   daily demand spread   σd = σ(weekly demand) ÷ √7
 *   safety stock          SS = z × σd × √(lead time)
 *   reorder point         ROP = d × lead time + SS
 *   suggested order       Q  = ROP + d × review period − available (≥ 0)
 */

export type IPart = {
  id: string;
  name: string;
  partNumber: string | null;
  category: string | null;
  unit: string;
  isActive: boolean;
  onHand: number;
  reserved: number;
  reorderPoint: number | null;
  safetyStock: number | null;
  sellingPrice: number | null;
  targetMarginPercent: number | null;
  createdAt: Date;
};
export type IReceipt = { partId: string; qty: number; unitCost: number | null; date: Date; supplier: string };
export type IIssue = { partId: string; qty: number; date: Date; unitCost: number | null; unitPrice: number | null; priceIsEstimated: boolean };

export type Settings = { leadTimeDays: number; serviceLevel: number; reviewDays: number; demandWindowDays: number; overstockDays: number; deadDays: number };
export const DEFAULT_SETTINGS: Settings = { leadTimeDays: 14, serviceLevel: 0.95, reviewDays: 30, demandWindowDays: 182, overstockDays: 180, deadDays: 180 };

/** z-scores for the service levels offered on the page. */
export const Z_SCORES: Record<string, number> = { '0.9': 1.2816, '0.95': 1.6449, '0.975': 1.96, '0.99': 2.3263 };
export function zFor(serviceLevel: number): number {
  return Z_SCORES[String(serviceLevel)] ?? 1.6449;
}

export type StockStatus = 'OUT_OF_STOCK' | 'BELOW_SAFETY' | 'BELOW_REORDER' | 'HEALTHY' | 'OVERSTOCK' | 'DEAD' | 'NO_DEMAND';

const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** "1 day", "14 days", "8,109 days (about 22 years)". */
export function coverText(days: number): string {
  const d = Math.round(days);
  const base = `${d.toLocaleString('en-NG')} ${d === 1 ? 'day' : 'days'}`;
  if (d < 730) return base;
  const years = Math.round(d / 365);
  return `${base} (about ${years.toLocaleString('en-NG')} years)`;
}

export function computeInventoryAnalytics(input: { parts: IPart[]; receipts: IReceipt[]; issues: IIssue[]; openPricingAlerts: number; now?: Date; settings?: Partial<Settings> }) {
  const now = input.now ?? new Date();
  const s: Settings = { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) };
  const z = zFor(s.serviceLevel);
  const yearAgo = now.getTime() - 365 * DAY;
  const windowStart = now.getTime() - s.demandWindowDays * DAY;
  const weeks = Math.max(1, Math.round(s.demandWindowDays / 7));

  const receiptsBy = new Map<string, IReceipt[]>();
  input.receipts.forEach((r) => receiptsBy.set(r.partId, [...(receiptsBy.get(r.partId) ?? []), r]));
  const issuesBy = new Map<string, IIssue[]>();
  input.issues.forEach((i) => issuesBy.set(i.partId, [...(issuesBy.get(i.partId) ?? []), i]));

  // ── Per part ───────────────────────────────────────────────────────
  const rows = input.parts.map((p) => {
    const recs = (receiptsBy.get(p.id) ?? []).slice().sort((a, b) => a.date.getTime() - b.date.getTime());
    const iss = issuesBy.get(p.id) ?? [];
    const costed = recs.filter((r) => r.unitCost !== null && r.qty > 0);
    const avgCost = costed.length ? sum(costed.map((r) => r.unitCost! * r.qty)) / sum(costed.map((r) => r.qty)) : null;
    const lastCost = costed.length ? costed[costed.length - 1]!.unitCost : null;
    const available = Math.max(0, p.onHand - p.reserved);

    // Demand
    const inWindow = iss.filter((i) => i.date.getTime() >= windowStart && i.date.getTime() <= now.getTime());
    const weekly = Array.from({ length: weeks }, () => 0);
    inWindow.forEach((i) => {
      const w = Math.min(weeks - 1, Math.floor((now.getTime() - i.date.getTime()) / (7 * DAY)));
      weekly[w] = (weekly[w] ?? 0) + i.qty;
    });
    const demandInWindow = sum(inWindow.map((i) => i.qty));
    const avgDaily = demandInWindow / s.demandWindowDays;
    const sigmaDaily = stdev(weekly) / Math.sqrt(7);
    const cv = mean(weekly) > 0 ? stdev(weekly) / mean(weekly) : null;
    const xyz: 'X' | 'Y' | 'Z' | null = cv === null ? null : cv < 0.5 ? 'X' : cv < 1 ? 'Y' : 'Z';

    // Suggestions
    // Whole units, rounded up — you can't order 0.066 of a bottle. Any
    // part with demand gets a reorder point of at least 1.
    const suggestedSafety = Math.ceil(z * sigmaDaily * Math.sqrt(s.leadTimeDays) - 1e-9);
    const suggestedReorder = avgDaily > 0 ? Math.max(1, Math.ceil(avgDaily * s.leadTimeDays + suggestedSafety - 1e-9)) : 0;
    let suggestedOrderQty = avgDaily > 0 ? Math.max(0, Math.ceil(suggestedReorder + avgDaily * s.reviewDays - available - 1e-9)) : 0;
    const daysOfCover = avgDaily > 0 ? available / avgDaily : null;
    const stockoutDate = daysOfCover !== null ? new Date(now.getTime() + daysOfCover * DAY) : null;

    // Status — uses the part's SET levels when present, else the suggestions.
    const rop = p.reorderPoint ?? (avgDaily > 0 ? suggestedReorder : null);
    const ss = p.safetyStock ?? (avgDaily > 0 ? suggestedSafety : null);
    const lastIssue = iss.length ? new Date(Math.max(...iss.map((i) => i.date.getTime()))) : null;
    const lastMovement = lastIssue ?? (recs.length ? recs[recs.length - 1]!.date : p.createdAt);
    let status: StockStatus;
    // Unused for the whole demand window but stock on hand: never a
    // reorder (it would be ordering stock nobody uses) — "no recent demand",
    // with a review note if it sits at or below its set level.
    const idleAtLevel = avgDaily <= 0 && p.onHand > 0 && p.reorderPoint !== null && p.reorderPoint > 0 && p.onHand <= p.reorderPoint;
    if (p.onHand <= 0 && (avgDaily > 0 || (p.reorderPoint ?? 0) > 0)) {
      status = 'OUT_OF_STOCK';
      // No demand history: restore the level you set, never "order 0".
      if (suggestedOrderQty === 0 && (p.reorderPoint ?? 0) > 0) suggestedOrderQty = Math.ceil(p.reorderPoint! - available);
    }
    else if (p.onHand > 0 && now.getTime() - lastMovement.getTime() > s.deadDays * DAY && (!lastIssue || now.getTime() - lastIssue.getTime() > s.deadDays * DAY)) status = 'DEAD';
    else if (avgDaily <= 0) status = 'NO_DEMAND';
    else if (ss !== null && ss > 0 && p.onHand <= ss) status = 'BELOW_SAFETY';
    else if (rop !== null && rop > 0 && p.onHand <= rop) status = 'BELOW_REORDER';
    else if (daysOfCover !== null && daysOfCover > s.overstockDays) status = 'OVERSTOCK';
    else status = 'HEALTHY';

    // Profitability — last 365 days
    const yearIssues = iss.filter((i) => i.date.getTime() >= yearAgo);
    const qty365 = sum(yearIssues.map((i) => i.qty));
    const cogs365 = sum(yearIssues.map((i) => i.qty * (i.unitCost ?? avgCost ?? 0)));
    const revenue365 = sum(yearIssues.map((i) => i.qty * (i.unitPrice ?? p.sellingPrice ?? 0)));
    const estimatedRevenueShare = qty365 > 0 ? sum(yearIssues.filter((i) => i.priceIsEstimated || i.unitPrice === null).map((i) => i.qty)) / qty365 : 0;
    const grossProfit = revenue365 - cogs365;
    const marginPercent = revenue365 > 0 ? (grossProfit / revenue365) * 100 : null;
    const markupPercent = cogs365 > 0 ? (grossProfit / cogs365) * 100 : null;
    const priceMarginNow = p.sellingPrice && lastCost !== null && p.sellingPrice > 0 ? ((p.sellingPrice - lastCost) / p.sellingPrice) * 100 : null;
    // Same tolerance as the Pricing Command Center: kobo rounding is not a deficit.
    const belowTarget = p.targetMarginPercent !== null && priceMarginNow !== null && priceMarginNow < p.targetMarginPercent - 0.05;
    const costInflation = avgCost && lastCost !== null ? ((lastCost - avgCost) / avgCost) * 100 : null;
    const stockValue = p.onHand * (avgCost ?? 0);

    return {
      id: p.id, name: p.name, partNumber: p.partNumber, category: p.category ?? 'Uncategorised', unit: p.unit,
      onHand: p.onHand, reserved: p.reserved, available,
      reorderPoint: p.reorderPoint, safetyStock: p.safetyStock,
      avgDaily: r3(avgDaily), sigmaDaily: r3(sigmaDaily), cv: cv === null ? null : r2(cv), xyz,
      suggestedSafety, suggestedReorder, suggestedOrderQty,
      daysOfCover: daysOfCover === null ? null : Math.round(daysOfCover), stockoutDate,
      status, idleAtLevel, lastIssue, lastMovement,
      avgCost: avgCost === null ? null : r2(avgCost), lastCost, sellingPrice: p.sellingPrice, targetMarginPercent: p.targetMarginPercent,
      qty365: r3(qty365), cogs365: r2(cogs365), revenue365: r2(revenue365), grossProfit: r2(grossProfit),
      marginPercent: marginPercent === null ? null : r2(marginPercent), markupPercent: markupPercent === null ? null : r2(markupPercent),
      priceMarginNow: priceMarginNow === null ? null : r2(priceMarginNow), belowTarget, costInflation: costInflation === null ? null : r2(costInflation),
      estimatedRevenueShare: r2(estimatedRevenueShare),
      stockValue: r2(stockValue),
      reorderCost: r2(suggestedOrderQty * (lastCost ?? avgCost ?? 0)),
      abc: 'C' as 'A' | 'B' | 'C',
    };
  });

  // ABC by 365-day consumption value (at cost): A = first 80%, B = next 15%.
  const byValue = rows.filter((r) => r.cogs365 > 0).sort((a, b) => b.cogs365 - a.cogs365);
  const totalConsumption = sum(byValue.map((r) => r.cogs365));
  let running = 0;
  byValue.forEach((r) => {
    const before = running / (totalConsumption || 1);
    running += r.cogs365;
    r.abc = before < 0.8 ? 'A' : before < 0.95 ? 'B' : 'C';
  });

  // ── Descriptive ────────────────────────────────────────────────────
  const count = (st: StockStatus) => rows.filter((r) => r.status === st).length;
  const statusCounts: Record<StockStatus, number> = {
    OUT_OF_STOCK: count('OUT_OF_STOCK'), BELOW_SAFETY: count('BELOW_SAFETY'), BELOW_REORDER: count('BELOW_REORDER'),
    HEALTHY: count('HEALTHY'), OVERSTOCK: count('OVERSTOCK'), DEAD: count('DEAD'), NO_DEMAND: count('NO_DEMAND'),
  };
  const stockValue = sum(rows.map((r) => r.stockValue));
  const cogs365 = sum(rows.map((r) => r.cogs365));
  const revenue365 = sum(rows.map((r) => r.revenue365));
  const grossProfit = revenue365 - cogs365;

  const cats = new Map<string, { category: string; parts: number; stockValue: number; revenue: number; cogs: number }>();
  rows.forEach((r) => {
    const c = cats.get(r.category) ?? { category: r.category, parts: 0, stockValue: 0, revenue: 0, cogs: 0 };
    c.parts += 1; c.stockValue += r.stockValue; c.revenue += r.revenue365; c.cogs += r.cogs365;
    cats.set(r.category, c);
  });
  const categories = [...cats.values()]
    .map((c) => ({ ...c, stockValue: r2(c.stockValue), revenue: r2(c.revenue), cogs: r2(c.cogs), marginPercent: c.revenue > 0 ? r2(((c.revenue - c.cogs) / c.revenue) * 100) : null }))
    .sort((a, b) => b.stockValue - a.stockValue);

  const months: { key: string; label: string; issuedCost: number; revenue: number; received: number }[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: d.toLocaleDateString('en-NG', { month: 'short', year: '2-digit', timeZone: 'UTC' }), issuedCost: 0, revenue: 0, received: 0 });
  }
  const mk = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const avgCostOf = new Map(rows.map((r) => [r.id, r.avgCost ?? 0]));
  const priceOf = new Map(input.parts.map((p) => [p.id, p.sellingPrice ?? 0]));
  input.issues.forEach((i) => {
    const m = months.find((x) => x.key === mk(i.date));
    if (!m) return;
    m.issuedCost += i.qty * (i.unitCost ?? avgCostOf.get(i.partId) ?? 0);
    m.revenue += i.qty * (i.unitPrice ?? priceOf.get(i.partId) ?? 0);
  });
  input.receipts.forEach((rc) => {
    const m = months.find((x) => x.key === mk(rc.date));
    if (m) m.received += rc.qty * (rc.unitCost ?? 0);
  });

  const descriptive = {
    parts: rows.length,
    stockValue: r2(stockValue),
    unitsOnHand: r3(sum(rows.map((r) => r.onHand))),
    revenue365: r2(revenue365),
    cogs365: r2(cogs365),
    grossProfit: r2(grossProfit),
    marginPercent: revenue365 > 0 ? r2((grossProfit / revenue365) * 100) : null,
    markupPercent: cogs365 > 0 ? r2((grossProfit / cogs365) * 100) : null,
    statusCounts,
    categories,
    trend: months.map((m) => ({ label: m.label, issuedCost: r2(m.issuedCost), revenue: r2(m.revenue), received: r2(m.received) })),
  };

  // ── Statistics ─────────────────────────────────────────────────────
  const turnover = ratio(cogs365, stockValue);
  const abcCount = { A: rows.filter((r) => r.abc === 'A' && r.cogs365 > 0).length, B: rows.filter((r) => r.abc === 'B').length, C: rows.filter((r) => r.abc === 'C' || r.cogs365 === 0).length };
  const abcValue = { A: r2(sum(rows.filter((r) => r.abc === 'A' && r.cogs365 > 0).map((r) => r.cogs365))), B: r2(sum(rows.filter((r) => r.abc === 'B').map((r) => r.cogs365))), C: r2(sum(rows.filter((r) => r.abc === 'C').map((r) => r.cogs365))) };
  const statistics = {
    turnover: turnover === null ? null : r2(turnover),
    daysOfInventory: turnover && turnover > 0 ? Math.round(365 / turnover) : null,
    gmroi: stockValue > 0 ? r2(grossProfit / stockValue) : null,
    abcCount,
    abcValue,
    xyzCount: { X: rows.filter((r) => r.xyz === 'X').length, Y: rows.filter((r) => r.xyz === 'Y').length, Z: rows.filter((r) => r.xyz === 'Z').length },
    estimatedRevenueShare: revenue365 > 0 ? r2(sum(rows.map((r) => r.revenue365 * r.estimatedRevenueShare)) / revenue365) : 0,
  };

  // ── Diagnostic ─────────────────────────────────────────────────────
  const sold = rows.filter((r) => r.revenue365 > 0);
  const diagnostic = {
    topRevenue: [...sold].sort((a, b) => b.revenue365 - a.revenue365).slice(0, 10),
    topProfit: [...sold].sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 10),
    lowestMargin: sold.filter((r) => r.marginPercent !== null).sort((a, b) => a.marginPercent! - b.marginPercent!).slice(0, 10),
    belowTarget: rows.filter((r) => r.belowTarget),
    costInflation: rows.filter((r) => r.costInflation !== null && r.costInflation >= 10).sort((a, b) => b.costInflation! - a.costInflation!).slice(0, 10),
    deadStock: rows.filter((r) => r.status === 'DEAD').sort((a, b) => b.stockValue - a.stockValue),
    overstock: rows.filter((r) => r.status === 'OVERSTOCK').sort((a, b) => b.stockValue - a.stockValue),
    deadStockValue: r2(sum(rows.filter((r) => r.status === 'DEAD').map((r) => r.stockValue))),
    overstockValue: r2(sum(rows.filter((r) => r.status === 'OVERSTOCK').map((r) => r.stockValue))),
  };

  // ── Predictive ─────────────────────────────────────────────────────
  const willRunOut = (days: number) => rows.filter((r) => r.stockoutDate && r.stockoutDate.getTime() - now.getTime() <= days * DAY && r.onHand > 0);
  const predictive = {
    stockoutIn14: willRunOut(14).length,
    stockoutIn30: willRunOut(30).length,
    upcomingStockouts: willRunOut(30).sort((a, b) => a.stockoutDate!.getTime() - b.stockoutDate!.getTime()).slice(0, 10),
    demand30Cost: r2(sum(rows.map((r) => r.avgDaily * 30 * (r.avgCost ?? 0)))),
    demand30Revenue: r2(sum(rows.map((r) => r.avgDaily * 30 * (r.sellingPrice ?? 0)))),
    reorderSpend: r2(sum(rows.filter((r) => r.suggestedOrderQty > 0 && ['OUT_OF_STOCK', 'BELOW_SAFETY', 'BELOW_REORDER'].includes(r.status)).map((r) => r.reorderCost))),
  };

  // ── Prescriptive ───────────────────────────────────────────────────
  type Action = { priority: 1 | 2 | 3; title: string; detail: string; href: string };
  const actions: Action[] = [];
  const u = (n: number, unit: string) => `${n.toLocaleString('en-NG', { maximumFractionDigits: 3 })} ${pluralizeWord(n, unit)}`;
  const order = (q: number, unit: string, fallback: string) => (q > 0 ? `order about ${u(q, unit)}` : fallback);
  rows.filter((r) => r.status === 'OUT_OF_STOCK').forEach((r) =>
    actions.push({ priority: 1, title: `${r.name} is out of stock`, detail: r.suggestedOrderQty > 0 ? `Order about ${u(r.suggestedOrderQty, r.unit)} now.` : 'Reorder — jobs needing it will wait.', href: `/inventory/parts/${r.id}` }),
  );
  rows.filter((r) => r.status === 'BELOW_SAFETY').forEach((r) =>
    actions.push({ priority: 1, title: `${r.name} is below safety stock`, detail: `${u(r.onHand, r.unit)} left${r.daysOfCover !== null ? ` (${coverText(r.daysOfCover)} of cover)` : ''} — ${order(r.suggestedOrderQty, r.unit, 'reorder now')}.`, href: `/inventory/parts/${r.id}` }),
  );
  rows.filter((r) => r.status === 'BELOW_REORDER').forEach((r) =>
    actions.push({ priority: 2, title: `Reorder ${r.name}`, detail: `At or below its reorder point — ${order(r.suggestedOrderQty, r.unit, 'reorder soon')}.`, href: `/inventory/parts/${r.id}` }),
  );
  if (input.openPricingAlerts > 0) {
    actions.push({ priority: 2, title: `${input.openPricingAlerts} open pricing ${input.openPricingAlerts === 1 ? 'alert' : 'alerts'}`, detail: 'Cost changes have moved margins — review them in the Pricing Command Center.', href: '/inventory/pricing' });
  }
  diagnostic.belowTarget.forEach((r) =>
    actions.push({ priority: 2, title: `Reprice ${r.name}`, detail: `Current margin ${r.priceMarginNow}% is below its ${r.targetMarginPercent}% target.`, href: '/inventory/pricing' }),
  );
  rows.filter((r) => r.avgDaily > 0 && (r.reorderPoint === null || r.safetyStock === null)).forEach((r) =>
    actions.push({ priority: 3, title: `Set stock levels for ${r.name}`, detail: `Suggested: reorder at ${u(r.suggestedReorder, r.unit)}, safety stock ${u(r.suggestedSafety, r.unit)}.`, href: `/inventory/analytics?focus=${r.id}#planner` }),
  );
  rows
    .filter((r) => r.avgDaily > 0 && r.reorderPoint !== null && r.reorderPoint > 0 && Math.abs(r.reorderPoint - r.suggestedReorder) / r.reorderPoint > 0.3)
    .forEach((r) => actions.push({ priority: 3, title: `Review ${r.name}'s reorder point`, detail: `Set at ${u(r.reorderPoint!, r.unit)}; recent demand suggests ${u(r.suggestedReorder, r.unit)}.`, href: `/inventory/analytics?focus=${r.id}#planner` }));
  rows.filter((r) => r.idleAtLevel).forEach((r) =>
    actions.push({ priority: 3, title: `Review ${r.name}'s stock levels`, detail: `At its reorder level (${u(r.onHand, r.unit)}) but unused for ${s.demandWindowDays} days — no order suggested; consider lowering the level.`, href: `/inventory/analytics?focus=${r.id}#planner` }),
  );
  diagnostic.deadStock.slice(0, 10).forEach((r) =>
    actions.push({ priority: 3, title: `Dead stock: ${r.name}`, detail: `No movement for over ${s.deadDays} days — ₦${r.stockValue.toLocaleString('en-NG')} tied up. Consider a promotion, return to supplier or write-off.`, href: `/inventory/parts/${r.id}` }),
  );
  diagnostic.overstock.slice(0, 10).forEach((r) =>
    actions.push({ priority: 3, title: `Overstocked: ${r.name}`, detail: `About ${coverText(r.daysOfCover ?? 0)} of cover — pause purchasing.`, href: `/inventory/parts/${r.id}` }),
  );
  actions.sort((a, b) => a.priority - b.priority);

  return { settings: s, z, rows, descriptive, statistics, diagnostic, predictive, prescriptive: { actions }, generatedAt: now };
}

export type InventoryAnalytics = ReturnType<typeof computeInventoryAnalytics>;
