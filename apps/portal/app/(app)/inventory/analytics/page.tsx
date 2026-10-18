import { guardPage } from '@/lib/authz/server';
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
import { PageHeader, HeaderAction, StatTile, PriorityActions, BarRow, EmptyState, Icon, CHART, type IconName, type Tone } from '@/components/ui';

const naira = (n: number | null) => (n === null ? '—' : `₦${Math.round(n).toLocaleString('en-NG')}`);
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);
const qty = (n: number, unit: string) => `${n.toLocaleString('en-NG', { maximumFractionDigits: 3 })} ${pluralizeWord(n, unit)}`;

const STATUS: Record<StockStatus, { label: string; colour: string; chip: string }> = {
  OUT_OF_STOCK: { label: 'Out of stock', colour: '#DC2626', chip: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' },
  BELOW_SAFETY: { label: 'Below safety stock', colour: '#F97316', chip: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' },
  BELOW_REORDER: { label: 'At / below reorder point', colour: '#F59E0B', chip: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]' },
  HEALTHY: { label: 'Healthy', colour: '#E10600', chip: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' },
  OVERSTOCK: { label: 'Overstocked', colour: '#FCA5A5', chip: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' },
  DEAD: { label: 'Dead stock', colour: '#6B7280', chip: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' },
  NO_DEMAND: { label: 'No recent demand', colour: '#CBD5E1', chip: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]' },
};
const ATTENTION: StockStatus[] = ['OUT_OF_STOCK', 'BELOW_SAFETY', 'BELOW_REORDER'];

function Section({ title, subtitle, children, id, icon = 'chart' }: { title: string; subtitle: string; children: ReactNode; id?: string; icon?: IconName }) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)] ring-1 ring-[var(--ejo-primary)]/15"><Icon name={icon} size={18} /></span>
        <div>
          <h2 className="text-lg font-semibold leading-tight text-[var(--ejo-text)]">{title}</h2>
          <p className="text-xs text-[var(--ejo-text-muted)]">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
const card = 'min-w-0 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
const TONE_OF: Record<string, Tone> = { 'text-[var(--ejo-warning)]': 'warning', 'text-[var(--ejo-success)]': 'success', 'text-[var(--ejo-error)]': 'error' };
function Kpi({ label, value, hint, tone = 'text-[var(--ejo-text)]', icon = 'chart' }: { label: string; value: string; hint?: string; tone?: string; icon?: IconName }) {
  const t = TONE_OF[tone];
  return <StatTile icon={icon} label={label} value={value} hint={hint} tone={t ?? 'brand'} emphasis={Boolean(t)} />;
}
/** A card title with its icon. */
function CardTitle({ icon, children }: { icon: IconName; children: ReactNode }) {
  return <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={icon} size={15} /></span>{children}</p>;
}
/** A donut chart drawn with a CSS conic gradient — no chart library. */
function Donut({ slices, centre }: { slices: { label: string; value: number; colour: string; note?: string }[]; centre: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  const stops = total > 0 ? slices.filter((x) => x.value > 0).map((x) => { const from = (acc / total) * 360; acc += x.value; return `${x.colour} ${from}deg ${(acc / total) * 360}deg`; }).join(', ') : '#E2E8F0 0deg 360deg';
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="ejo-spin-in relative h-36 w-36 shrink-0 rounded-full shadow-inner" style={{ background: `conic-gradient(${stops})` }}>
        <div className="absolute inset-5 flex items-center justify-center rounded-full bg-[var(--ejo-surface)] text-center text-xs font-semibold text-[var(--ejo-text)] shadow-sm">{centre}</div>
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
  return <div className="space-y-2">{rows.map((r) => <BarRow key={r.label} label={r.label} value={r.value} max={max} note={r.note} />)}</div>;
}

export default async function InventoryAnalyticsPage({ searchParams }: { searchParams: Promise<{ lead?: string; service?: string; show?: string; focus?: string; status?: string; error?: string }> }) {
  await guardPage('analytics.inventory.view', '/inventory/analytics');
  const params = await searchParams;
  const branchId = await getStoreBranchId();
  if (!branchId) return <div className="w-full p-4 sm:p-8"><PageHeader icon="chart" title="Inventory analytics" description="No Store branch is set up yet." back={{ href: '/inventory', label: 'Back to Inventory' }} /></div>;
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
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        back={{ href: '/inventory', label: 'Back to Inventory' }}
        icon="chart"
        eyebrow="Analytics · Store"
        title="Inventory analytics"
        description={<>Stock health, reorder levels, demand and profitability, worked out from stock movements: costs from each goods
            receipt and the prices charged on Job Cards and Vehicle Services. Each figure says how it is calculated.</>}
        actions={<>
          <HeaderAction href="/inventory/pricing" icon="tag" variant="secondary">Pricing Command Center</HeaderAction>
          <HeaderAction href="/inventory/parts" icon="package" variant="secondary">Parts catalogue</HeaderAction>
        </>}
      />
      {params.status === 'levels_set' ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message="Stock levels updated. The parts list indicators now use them." /></div> : null}
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
          What-if: suggestions use demand over the last {pluralize(a.settings.demandWindowDays, 'day')}. Safety stock = z ({a.z.toFixed(2)}) × daily-demand spread × √{pluralize(lead, 'day')}; reorder point = daily demand × {pluralize(lead, 'day')} + safety stock; suggested order covers the reorder point plus {pluralize(a.settings.reviewDays, 'day')}. Calculated {formatDateTime(a.generatedAt)}.
        </p>
      </form>

      <Section icon="bolt" title="What to do now" subtitle="Actions in priority order, each linked to the part or page where it is done.">
        {a.prescriptive.actions.length === 0 ? <div className={card}><EmptyState compact icon="check-circle" title="Nothing needs attention right now." /></div> : (
          <>
            <PriorityActions actions={a.prescriptive.actions.slice(0, 25)} title="Prioritised" note={null} />
            {a.prescriptive.actions.length > 25 ? <p className="-mt-6 text-xs text-[var(--ejo-text-muted)]">+ {pluralize(a.prescriptive.actions.length - 25, 'more action')} — see the planner below.</p> : null}
          </>
        )}
      </Section>

      <Section icon="activity" title="Descriptive" subtitle="What you hold and what it earned — last 365 days.">
        <div className="ejo-stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi icon="boxes" label="Stock value (FIFO, at receipt cost)" value={naira(d.stockValue)} hint={`${pluralize(d.parts, 'part')} · ${d.unitsOnHand.toLocaleString('en-NG')} on hand${d.uncostedUnits > 0 ? ` · ${d.uncostedUnits.toLocaleString('en-NG')} units on ${pluralize(d.partsWithUncostedStock, 'part')} have no recorded cost (valued at average)` : ''}`} />
          <Kpi icon="money" label="Revenue from parts" value={naira(d.revenue365)} hint={st.estimatedRevenueShare > 0 ? `${Math.round(st.estimatedRevenueShare * 100)}% at current price (no estimate price)` : 'Prices charged on jobs'} />
          <Kpi icon="receipt" label="Cost of parts issued" value={naira(d.cogs365)} hint="Cost from each goods receipt" />
          <Kpi icon="trend-up" label="Gross profit" value={naira(d.grossProfit)} tone={d.grossProfit >= 0 ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'} />
          <Kpi icon="percent" label="Margin / markup" value={`${pct(d.marginPercent)} / ${pct(d.markupPercent)}`} hint="Profit ÷ revenue / profit ÷ cost" />
          <Kpi icon="alert" label="Needing attention" value={String(d.statusCounts.OUT_OF_STOCK + d.statusCounts.BELOW_SAFETY + d.statusCounts.BELOW_REORDER)} hint="Out of stock, below safety or reorder" tone="text-[var(--ejo-warning)]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <CardTitle icon="pie">Stock health</CardTitle>
            <Donut centre={pluralize(d.parts, 'part')} slices={(Object.keys(STATUS) as StockStatus[]).map((k) => ({ label: STATUS[k].label, value: d.statusCounts[k], colour: STATUS[k].colour }))} />
          </div>
          <div className={card}>
            <CardTitle icon="layers">Stock value by category</CardTitle>
            {d.categories.length === 0 ? <p className="text-xs text-[var(--ejo-text-muted)]">No parts yet.</p> : <Bars rows={d.categories.slice(0, 10).map((c) => ({ label: c.category, value: c.stockValue, note: `${naira(c.stockValue)} · margin ${pct(c.marginPercent)}` }))} />}
          </div>
          <div className={`${card} lg:col-span-2`}>
            <CardTitle icon="bars">Last 12 months — received vs issued (at cost) vs revenue</CardTitle>
            <div className="flex h-40 items-end gap-1">
              {d.trend.map((t) => (
                <div key={t.label} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" title={`${t.label}: received ${naira(t.received)} · issued ${naira(t.issuedCost)} · revenue ${naira(t.revenue)}`}>
                  <div className="flex h-32 w-full items-end gap-px">
                    <div className="ejo-grow-up flex-1 rounded-t-sm" style={{ height: `${(t.received / trendMax) * 100}%`, background: CHART.neutralSoft }} />
                    <div className="ejo-grow-up flex-1 rounded-t-sm" style={{ height: `${(t.issuedCost / trendMax) * 100}%`, background: CHART.primarySoft }} />
                    <div className="ejo-grow-up flex-1 rounded-t-sm" style={{ height: `${(t.revenue / trendMax) * 100}%`, background: CHART.primary }} />
                  </div>
                  <span className="text-[9px] text-[var(--ejo-text-muted)]">{t.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--ejo-text-muted)]">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CHART.neutralSoft }} />Received</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CHART.primarySoft }} />Issued at cost</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CHART.primary }} />Revenue</span>
            </p>
          </div>
        </div>
      </Section>

      <Section icon="pie" title="Statistics" subtitle="Efficiency and the shape of demand.">
        <div className="ejo-stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi icon="refund" label="Stock turnover" value={st.turnover === null ? '—' : `${st.turnover.toFixed(2)}×`} hint="Cost issued in a year ÷ stock value" />
          <Kpi icon="calendar" label="Days of inventory" value={st.daysOfInventory === null ? '—' : coverText(st.daysOfInventory)} hint="How long current stock lasts at the yearly pace" />
          <Kpi icon="trend-up" label="GMROI" value={st.gmroi === null ? '—' : `₦${st.gmroi.toFixed(2)}`} hint="Gross profit per ₦1 held in stock" />
          <Kpi icon="activity" label="Demand variability (X / Y / Z)" value={`${st.xyzCount.X} / ${st.xyzCount.Y} / ${st.xyzCount.Z}`} hint="Steady / variable / erratic weekly demand" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={card}>
            <CardTitle icon="star">ABC analysis (share of yearly consumption value)</CardTitle>
            <Donut centre="ABC" slices={[
              { label: `A — top 80% of value (${pluralize(st.abcCount.A, 'part')})`, value: st.abcValue.A, colour: '#B40000', note: naira(st.abcValue.A) },
              { label: `B — next 15% (${pluralize(st.abcCount.B, 'part')})`, value: st.abcValue.B, colour: '#F87171', note: naira(st.abcValue.B) },
              { label: `C — the rest (${pluralize(st.abcCount.C, 'part')})`, value: st.abcValue.C, colour: '#FECACA', note: naira(st.abcValue.C) },
            ]} />
            <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Watch A parts closely (tight levels, frequent review); C parts can be ordered in larger, rarer batches.</p>
          </div>
          <div className={card}>
            <CardTitle icon="lock">Tied-up capital</CardTitle>
            <Bars rows={[
              { label: 'Dead stock', value: g.deadStockValue, note: `${naira(g.deadStockValue)} · ${pluralize(g.deadStock.length, 'part')}` },
              { label: 'Overstocked', value: g.overstockValue, note: `${naira(g.overstockValue)} · ${pluralize(g.overstock.length, 'part')}` },
              { label: 'All stock', value: d.stockValue, note: naira(d.stockValue) },
            ]} />
          </div>
        </div>
      </Section>

      <Section icon="search" title="Diagnostic" subtitle="What earns, what doesn't, and where costs are rising.">
        <div className="grid gap-4 lg:grid-cols-2">
          {([['Top revenue parts', g.topRevenue, (r: (typeof g.topRevenue)[number]) => `${naira(r.revenue365)} · ${pct(r.marginPercent)}`], ['Top profit parts', g.topProfit, (r: (typeof g.topProfit)[number]) => `${naira(r.grossProfit)} · ${pct(r.marginPercent)}`], ['Lowest margins', g.lowestMargin, (r: (typeof g.lowestMargin)[number]) => `${pct(r.marginPercent)} on ${naira(r.revenue365)}`], ['Cost rising (last receipt vs average)', g.costInflation, (r: (typeof g.costInflation)[number]) => `+${r.costInflation}% · now ${naira(r.lastCost)}`]] as const).map(([title, list, note]) => (
            <div key={title} className={card}>
              <CardTitle icon={title.startsWith('Top revenue') ? 'money' : title.startsWith('Top profit') ? 'trend-up' : title.startsWith('Lowest') ? 'trend-down' : 'alert'}>{title}</CardTitle>
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
            <CardTitle icon="tag">Priced below target margin ({g.belowTarget.length})</CardTitle>
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

      <Section icon="trend-up" title="Predictive" subtitle="What's coming at the current pace of demand.">
        <div className="ejo-stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi icon="clock" label="Will run out in 14 / 30 days" value={`${p.stockoutIn14} / ${p.stockoutIn30}`} hint="Parts in stock today" tone="text-[var(--ejo-warning)]" />
          <Kpi icon="trend-up" label="Next 30 days' demand (at cost)" value={naira(p.demand30Cost)} hint={`≈ ${naira(p.demand30Revenue)} at current prices`} />
          <Kpi icon="cart" label="Spend to reorder now" value={naira(p.reorderSpend)} hint="Suggested quantities at latest cost, for parts needing it" />
        </div>
        <div className={card}>
          <CardTitle icon="clock">Projected stock-outs (next 30 days)</CardTitle>
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

      <Section id="planner" icon="cart" title="Reorder planner" subtitle={showAll ? 'Every part, with its suggested levels.' : 'Parts needing attention, and parts with demand but no stock levels set.'}>
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
                    {r.idleAtLevel ? <p className="text-[var(--ejo-warning-text)]">Unused for {pluralize(a.settings.demandWindowDays, 'day')} while at its reorder level — consider lowering the level.</p> : null}
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
