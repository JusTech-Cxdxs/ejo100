import type { ReactNode } from 'react';
import { getStoreBranchId } from '@/lib/actions/store';
import { getInventoryAnalytics } from '@/lib/actions/inventory-analytics';
import { setPartStockLevelsFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { coverText, type StockStatus } from '@/lib/inventory-analytics';

const naira = (n: number | null) => (n === null ? '—' : `₦${Math.round(n).toLocaleString('en-NG')}`);
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);
const qty = (n: number, unit: string) => `${n.toLocaleString('en-NG', { maximumFractionDigits: 3 })} ${pluralizeWord(n, unit)}`;

const STATUS: Record<StockStatus, { label: string; colour: string; chip: string }> = {
  OUT_OF_STOCK: { label: 'Out of stock', colour: '#DC2626', chip: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' },
  BELOW_SAFETY: { label: 'Below safety stock', colour: '#F97316', chip: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' },
  BELOW_REORDER: { label: 'At / below reorder point', colour: '#F59E0B', chip: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' },
  HEALTHY: { label: 'Healthy', colour: '#16A34A', chip: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' },
  OVERSTOCK: { label: 'Overstocked', colour: '#2563EB', chip: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]' },
  DEAD: { label: 'Dead stock', colour: '#6B7280', chip: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' },
  NO_DEMAND: { label: 'No recent demand', colour: '#CBD5E1', chip: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]' },
};
const ATTENTION: StockStatus[] = ['OUT_OF_STOCK', 'BELOW_SAFETY', 'BELOW_REORDER'];

function Section({ title, subtitle, children, id }: { title: string; subtitle: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="text-lg font-semibold text-[var(--ejo-text)]">{title}</h2>
      <p className="mb-4 text-xs text-[var(--ejo-text-muted)]">{subtitle}</p>
      {children}
    </section>
  );
}
const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
function Kpi({ label, value, hint, tone = 'text-[var(--ejo-text)]' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className={card}>
      <p className="text-xs text-[var(--ejo-text-muted)]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">{hint}</p> : null}
    </div>
  );
}
/** A donut chart drawn with a CSS conic gradient — no chart library. */
function Donut({ slices, centre }: { slices: { label: string; value: number; colour: string; note?: string }[]; centre: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const stops = total > 0 ? slices.filter((x) => x.value > 0).map((x) => { const from = (acc / total) * 360; acc += x.value; return `${x.colour} ${from}deg ${(acc / total) * 360}deg`; }).join(', ') : '#E2E8F0 0deg 360deg';
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }}>
        <div className="absolute inset-5 flex items-center justify-center rounded-full bg-[var(--ejo-surface)] text-center text-xs font-semibold text-[var(--ejo-text)]">{centre}</div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {slices.map((x) => (
          <li key={x.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[var(--ejo-text)]"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: x.colour }} />{x.label}</span>
            <span className="text-[var(--ejo-text-muted)]">{x.note ?? x.value}{total > 0 ? ` · ${Math.round((x.value / total) * 100)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
function Bars({ rows }: { rows: { label: string; value: number; note: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-[var(--ejo-text)]" title={r.label}>{r.label}</span>
          <div className="h-3 rounded bg-[var(--ejo-bg)]"><div className="h-3 rounded bg-[var(--ejo-primary)]" style={{ width: `${(r.value / max) * 100}%` }} /></div>
          <span className="text-right text-[var(--ejo-text-muted)]">{r.note}</span>
        </div>
      ))}
    </div>
  );
}

export default async function InventoryAnalyticsPage({ searchParams }: { searchParams: Promise<{ lead?: string; service?: string; show?: string; focus?: string; status?: string; error?: string }> }) {
  const params = await searchParams;
  const branchId = await getStoreBranchId();
  if (!branchId) return <div className="p-8 text-sm text-[var(--ejo-text-muted)]">No Store branch is set up yet.</div>;
  const lead = Math.min(180, Math.max(1, Number(params.lead) || 14));
  const service = ['0.9', '0.95', '0.975', '0.99'].includes(params.service ?? '') ? Number(params.service) : 0.95;
  const a = await getInventoryAnalytics(branchId, { leadTimeDays: lead, serviceLevel: service });
  const d = a.descriptive, st = a.statistics, g = a.diagnostic, p = a.predictive;
  const showAll = params.show === 'all';
  const plannerRows = a.rows
    .filter((r) => showAll || ATTENTION.includes(r.status) || r.idleAtLevel || r.id === params.focus || (r.avgDaily > 0 && (r.reorderPoint === null || r.safetyStock === null)))
    .sort((x, y) => ATTENTION.indexOf(x.status) - ATTENTION.indexOf(y.status) || (x.daysOfCover ?? 1e9) - (y.daysOfCover ?? 1e9));
  const trendMax = Math.max(1, ...d.trend.flatMap((t) => [t.received, t.issuedCost, t.revenue]));
  const keep = `lead=${lead}&service=${service}`;
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-sm text-[var(--ejo-text)]';

  return (
    <div className="p-8">
      <LoadingLink href="/inventory" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Inventory</LoadingLink>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Inventory analytics</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--ejo-text-muted)]">
            Stock health, reorder intelligence, demand and profitability — from real movements: true costs traced to each goods receipt, and the
            prices actually charged on Job Cards and Vehicle Services. Every figure says how it is worked out.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LoadingLink href="/inventory/pricing" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Pricing Command Center</LoadingLink>
          <LoadingLink href="/inventory/parts" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Parts catalogue</LoadingLink>
        </div>
      </div>
      {params.status === 'levels_set' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Stock levels updated — the parts list indicators follow them straight away." /></div> : null}
      {params.error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={params.error} /></div> : null}

      <form action="/inventory/analytics" className={`${card} mb-8 flex flex-wrap items-end gap-4 text-sm`}>
        <div>
          <label className="block text-xs text-[var(--ejo-text-muted)]">Supplier lead time (days)</label>
          <input name="lead" type="number" min={1} max={180} defaultValue={lead} className={`${input} w-24`} />
        </div>
        <div>
          <label className="block text-xs text-[var(--ejo-text-muted)]">Service level (chance of not running out)</label>
          <select name="service" defaultValue={String(service)} className={input}>
            <option value="0.9">90%</option><option value="0.95">95%</option><option value="0.975">97.5%</option><option value="0.99">99%</option>
          </select>
        </div>
        <button type="submit" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">Recalculate</button>
        <p className="basis-full text-[11px] text-[var(--ejo-text-muted)]">
          What-if: suggestions use demand over the last {a.settings.demandWindowDays} days. Safety stock = z ({a.z.toFixed(2)}) × daily-demand spread × √{lead} days; reorder point = daily demand × {lead} days + safety stock; suggested order covers the reorder point plus {a.settings.reviewDays} days. Calculated {formatDateTime(a.generatedAt)}.
        </p>
      </form>

      <Section title="What to do now" subtitle="Prescriptive — prioritised actions, each linked to the part or tool that fixes it.">
        {a.prescriptive.actions.length === 0 ? <p className={`${card} text-sm text-[var(--ejo-text-muted)]`}>Nothing needs attention right now.</p> : (
          <div className="space-y-2">
            {a.prescriptive.actions.slice(0, 25).map((act, i) => (
              <LoadingLink key={`${act.href}-${i}`} href={act.href} className={`flex items-start gap-3 ${card} hover:border-[var(--ejo-primary)]`}>
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${act.priority === 1 ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' : act.priority === 2 ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' : 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]'}`}>P{act.priority}</span>
                <span className="min-w-0"><span className="block text-sm font-medium text-[var(--ejo-text)]">{act.title}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{act.detail}</span></span>
              </LoadingLink>
            ))}
            {a.prescriptive.actions.length > 25 ? <p className="text-xs text-[var(--ejo-text-muted)]">+ {pluralize(a.prescriptive.actions.length - 25, 'more action')} — see the planner below.</p> : null}
          </div>
        )}
      </Section>

      <Section title="Descriptive" subtitle="What you hold and what it earned — last 365 days.">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Stock value (at average cost)" value={naira(d.stockValue)} hint={`${pluralize(d.parts, 'part')} · ${d.unitsOnHand.toLocaleString('en-NG')} on hand`} />
          <Kpi label="Revenue from parts" value={naira(d.revenue365)} hint={st.estimatedRevenueShare > 0 ? `${Math.round(st.estimatedRevenueShare * 100)}% at current price (no estimate price)` : 'Prices actually charged'} />
          <Kpi label="Cost of parts issued" value={naira(d.cogs365)} hint="True cost from each goods receipt" />
          <Kpi label="Gross profit" value={naira(d.grossProfit)} tone={d.grossProfit >= 0 ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'} />
          <Kpi label="Margin / markup" value={`${pct(d.marginPercent)} / ${pct(d.markupPercent)}`} hint="Profit ÷ revenue / profit ÷ cost" />
          <Kpi label="Needing attention" value={String(d.statusCounts.OUT_OF_STOCK + d.statusCounts.BELOW_SAFETY + d.statusCounts.BELOW_REORDER)} hint="Out of stock, below safety or reorder" tone="text-[var(--ejo-warning)]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <p className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Stock health</p>
            <Donut centre={pluralize(d.parts, 'part')} slices={(Object.keys(STATUS) as StockStatus[]).map((k) => ({ label: STATUS[k].label, value: d.statusCounts[k], colour: STATUS[k].colour }))} />
          </div>
          <div className={card}>
            <p className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Stock value by category</p>
            {d.categories.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No parts yet.</p> : <Bars rows={d.categories.slice(0, 10).map((c) => ({ label: c.category, value: c.stockValue, note: `${naira(c.stockValue)} · margin ${pct(c.marginPercent)}` }))} />}
          </div>
          <div className={`${card} lg:col-span-2`}>
            <p className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Last 12 months — received vs issued (at cost) vs revenue</p>
            <div className="flex h-40 items-end gap-1">
              {d.trend.map((t) => (
                <div key={t.label} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" title={`${t.label}: received ${naira(t.received)} · issued ${naira(t.issuedCost)} · revenue ${naira(t.revenue)}`}>
                  <div className="flex h-32 w-full items-end gap-px">
                    <div className="flex-1 rounded-t bg-[#94A3B8]" style={{ height: `${(t.received / trendMax) * 100}%` }} />
                    <div className="flex-1 rounded-t bg-[var(--ejo-primary)]/80" style={{ height: `${(t.issuedCost / trendMax) * 100}%` }} />
                    <div className="flex-1 rounded-t bg-[var(--ejo-success)]/80" style={{ height: `${(t.revenue / trendMax) * 100}%` }} />
                  </div>
                  <span className="text-[9px] text-[var(--ejo-text-muted)]">{t.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Grey: received · Blue: issued at cost · Green: revenue.</p>
          </div>
        </div>
      </Section>

      <Section title="Statistics" subtitle="Efficiency and the shape of demand.">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Stock turnover" value={st.turnover === null ? '—' : `${st.turnover.toFixed(2)}×`} hint="Cost issued in a year ÷ stock value" />
          <Kpi label="Days of inventory" value={st.daysOfInventory === null ? '—' : coverText(st.daysOfInventory)} hint="How long current stock lasts at the yearly pace" />
          <Kpi label="GMROI" value={st.gmroi === null ? '—' : `₦${st.gmroi.toFixed(2)}`} hint="Gross profit per ₦1 held in stock" />
          <Kpi label="Demand variability (X / Y / Z)" value={`${st.xyzCount.X} / ${st.xyzCount.Y} / ${st.xyzCount.Z}`} hint="Steady / variable / erratic weekly demand" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <p className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">ABC — where the money moves (share of yearly consumption value)</p>
            <Donut centre="ABC" slices={[
              { label: `A — top 80% of value (${pluralize(st.abcCount.A, 'part')})`, value: st.abcValue.A, colour: '#1D4ED8', note: naira(st.abcValue.A) },
              { label: `B — next 15% (${pluralize(st.abcCount.B, 'part')})`, value: st.abcValue.B, colour: '#60A5FA', note: naira(st.abcValue.B) },
              { label: `C — the rest (${pluralize(st.abcCount.C, 'part')})`, value: st.abcValue.C, colour: '#BFDBFE', note: naira(st.abcValue.C) },
            ]} />
            <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Watch A parts closely (tight levels, frequent review); C parts can be ordered in larger, rarer batches.</p>
          </div>
          <div className={card}>
            <p className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Tied-up capital</p>
            <Bars rows={[
              { label: 'Dead stock', value: g.deadStockValue, note: `${naira(g.deadStockValue)} · ${pluralize(g.deadStock.length, 'part')}` },
              { label: 'Overstocked', value: g.overstockValue, note: `${naira(g.overstockValue)} · ${pluralize(g.overstock.length, 'part')}` },
              { label: 'All stock', value: d.stockValue, note: naira(d.stockValue) },
            ]} />
          </div>
        </div>
      </Section>

      <Section title="Diagnostic" subtitle="Why — what earns, what doesn't, and where costs are moving.">
        <div className="grid gap-4 lg:grid-cols-2">
          {([['Top revenue parts', g.topRevenue, (r: (typeof g.topRevenue)[number]) => `${naira(r.revenue365)} · ${pct(r.marginPercent)}`], ['Top profit parts', g.topProfit, (r: (typeof g.topProfit)[number]) => `${naira(r.grossProfit)} · ${pct(r.marginPercent)}`], ['Lowest margins', g.lowestMargin, (r: (typeof g.lowestMargin)[number]) => `${pct(r.marginPercent)} on ${naira(r.revenue365)}`], ['Cost rising (last receipt vs average)', g.costInflation, (r: (typeof g.costInflation)[number]) => `+${r.costInflation}% · now ${naira(r.lastCost)}`]] as const).map(([title, list, note]) => (
            <div key={title} className={card}>
              <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">{title}</p>
              {list.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">Nothing to show yet.</p> : (
                <ul className="space-y-1 text-sm">
                  {list.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <LoadingLink href={`/inventory/parts/${r.id}`} className="min-w-0 truncate text-[var(--ejo-primary)] hover:underline">{r.name}</LoadingLink>
                      <span className="text-xs text-[var(--ejo-text-muted)]">{note(r as never)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div className={`${card} lg:col-span-2`}>
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Priced below target margin ({g.belowTarget.length})</p>
            {g.belowTarget.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">Every priced part meets its target margin at its latest cost.</p> : (
              <ul className="space-y-1 text-sm">
                {g.belowTarget.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <LoadingLink href={`/inventory/parts/${r.id}`} className="text-[var(--ejo-primary)] hover:underline">{r.name}</LoadingLink>
                    <span className="text-xs text-[var(--ejo-text-muted)]">{pct(r.priceMarginNow)} now vs {pct(r.targetMarginPercent)} target · sells at {naira(r.sellingPrice)}, last cost {naira(r.lastCost)}</span>
                  </li>
                ))}
              </ul>
            )}
            <LoadingLink href="/inventory/pricing" className="mt-2 inline-block text-xs text-[var(--ejo-primary)] hover:underline">Fix prices in the Pricing Command Center →</LoadingLink>
          </div>
        </div>
      </Section>

      <Section title="Predictive" subtitle="What's coming at the current pace of demand.">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Will run out in 14 / 30 days" value={`${p.stockoutIn14} / ${p.stockoutIn30}`} hint="Parts in stock today" tone="text-[var(--ejo-warning)]" />
          <Kpi label="Next 30 days' demand (at cost)" value={naira(p.demand30Cost)} hint={`≈ ${naira(p.demand30Revenue)} at current prices`} />
          <Kpi label="Spend to reorder now" value={naira(p.reorderSpend)} hint="Suggested quantities at latest cost, for parts needing it" />
        </div>
        <div className={card}>
          <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Projected stock-outs (next 30 days)</p>
          {p.upcomingStockouts.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">None expected at the current pace.</p> : (
            <ul className="space-y-1 text-sm">
              {p.upcomingStockouts.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <LoadingLink href={`/inventory/parts/${r.id}`} className="text-[var(--ejo-primary)] hover:underline">{r.name}</LoadingLink>
                  <span className="text-xs text-[var(--ejo-text-muted)]">{qty(r.available, r.unit)} available · runs out about {formatDateOnly(r.stockoutDate!)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section id="planner" title="Reorder planner" subtitle={showAll ? 'Every part, with its suggested levels.' : 'Parts needing attention, and parts with demand but no stock levels set.'}>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <LoadingLink href={`/inventory/analytics?${keep}#planner`} className={`rounded-full px-3 py-1 font-medium ${!showAll ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Needs attention</LoadingLink>
          <LoadingLink href={`/inventory/analytics?${keep}&show=all#planner`} className={`rounded-full px-3 py-1 font-medium ${showAll ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>All parts ({a.rows.length})</LoadingLink>
        </div>
        {plannerRows.length === 0 ? <p className={`${card} text-sm text-[var(--ejo-text-muted)]`}>Nothing needs attention — every part is above its levels.</p> : (
          <ul className="space-y-2">
            {plannerRows.map((r) => (
              <li key={r.id} className={`${card} ${r.id === params.focus ? 'ring-2 ring-[var(--ejo-primary)]' : ''}`}>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1.4fr)]">
                  <div className="min-w-0">
                    <LoadingLink href={`/inventory/parts/${r.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.name}</LoadingLink>
                    <p className="text-xs text-[var(--ejo-text-muted)]">{[r.partNumber, r.category, `class ${r.abc}${r.xyz ? r.xyz : ''}`].filter(Boolean).join(' · ')}</p>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[r.status].chip}`}>{STATUS[r.status].label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-[var(--ejo-text)]">
                    <span className="text-[var(--ejo-text-muted)]">On hand / available</span><span>{qty(r.onHand, r.unit)} / {r.available.toLocaleString('en-NG', { maximumFractionDigits: 3 })}</span>
                    <span className="text-[var(--ejo-text-muted)]">Demand</span><span>{r.avgDaily > 0 ? `${r.avgDaily} a day · ${qty(r.qty365, r.unit)} a year` : 'none recently'}</span>
                    <span className="text-[var(--ejo-text-muted)]">Days of cover</span><span>{r.daysOfCover === null ? '—' : coverText(r.daysOfCover)}</span>
                    <span className="text-[var(--ejo-text-muted)]">Set levels</span><span>reorder {r.reorderPoint ?? '—'} · safety {r.safetyStock ?? '—'}</span>
                    <span className="text-[var(--ejo-text-muted)]">Suggested</span><span className="font-medium">{r.avgDaily > 0 ? `reorder ${r.suggestedReorder} · safety ${r.suggestedSafety}` : 'needs demand history'}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    {r.idleAtLevel ? <p className="text-[var(--ejo-warning)]">Unused for {a.settings.demandWindowDays} days while at its reorder level — consider lowering the level.</p> : null}
                    {r.suggestedOrderQty > 0 ? <p className="text-[var(--ejo-text)]">Order about <span className="font-semibold">{qty(r.suggestedOrderQty, r.unit)}</span>{r.lastCost !== null || r.avgCost !== null ? ` (≈ ${naira(r.reorderCost)})` : ''}</p> : <p className="text-[var(--ejo-text-muted)]">No order needed now.</p>}
                    {r.avgDaily > 0 ? (
                      <form action={setPartStockLevelsFormAction} className="flex flex-wrap items-end gap-2">
                        <FormPendingOverlay />
                        <input type="hidden" name="partId" value={r.id} />
                        <input type="hidden" name="returnTo" value={`/inventory/analytics?${keep}${showAll ? '&show=all' : ''}&focus=${r.id}#planner`} />
                        <label className="text-[var(--ejo-text-muted)]">Reorder<input name="reorderPoint" type="number" step="1" min={0} defaultValue={r.suggestedReorder} className={`${input} ml-1 w-20`} /></label>
                        <label className="text-[var(--ejo-text-muted)]">Safety<input name="safetyStock" type="number" step="1" min={0} defaultValue={r.suggestedSafety} className={`${input} ml-1 w-20`} /></label>
                        <SubmitButton label="Apply" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1 text-xs font-medium text-white hover:opacity-90" />
                      </form>
                    ) : (
                      <p className="text-[var(--ejo-text-muted)]">Not enough demand history to suggest levels.</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
