import { guardPage } from '@/lib/authz/server';
import { canSeeMasterAnalytics, getMasterAnalytics } from '@/lib/actions/master-analytics';
import { LoadingLink } from '@/components/LoadingLink';
import { pluralize } from '@/lib/utils/pluralize';
import { PageHeader, StatTile, PriorityActions, BarRow, PeriodPills, Icon, CHART, type IconName } from '@/components/ui';

const card = 'min-w-0 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
/** A card's title with its icon. */
const T = ({ icon, children, as: H = 'h3', className = 'mb-3' }: { icon: IconName; children: React.ReactNode; as?: 'h2' | 'h3'; className?: string }) => (
  <H className={`flex items-center gap-2.5 text-sm font-semibold text-[var(--ejo-text)] ${className}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={icon} size={15} /></span><span>{children}</span></H>
);
const Group = ({ icon, children }: { icon: IconName; children: React.ReactNode }) => (
  <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]"><Icon name={icon} size={13} />{children}</h2>
);
const naira = (n: number | null) => (n === null ? '—' : `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`);
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
const PERIODS: [string, string][] = [['today', 'Today'], ['this_month', 'This month'], ['last_month', 'Last month'], ['last_30', 'Last 30 days'], ['this_quarter', 'This quarter'], ['this_year', 'This year']];

export default async function BusinessAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await guardPage('analytics.business.view', '/analytics');
  const { period, from, to } = await searchParams;
  // Refused on the server — typing the address directly does not get round it.
  if (!(await canSeeMasterAnalytics())) {
    return (
      <div className="w-full p-4 sm:p-8">
        <PageHeader hero icon="chart" title="Business analytics" description="This dashboard is for the Master Admin, Administrators, the Workshop Manager and Finance. Ask an administrator if you need access." />
      </div>
    );
  }
  const a = await getMasterAnalytics(period, { from, to });
  const e = a.current.earnings;
  const earnedTotal = Math.max(1, a.current.sales);
  const c = a.current;
  const Kpi = ({ label, value, change, hint, href, icon = 'chart', money = false }: { label: string; value: string | number | null; change?: number | null; hint?: string; href?: string; icon?: IconName; money?: boolean }) => (
    <StatTile icon={icon} label={label} value={value} prefix={money ? '₦' : undefined} delta={change} hint={hint} href={href} />
  );
  const maxWeek = Math.max(1, ...a.weeks.map((w) => w.sales));
  const maxMix = Math.max(1, ...a.diagnostic.mix.map((m) => m.value));
  const maxCust = Math.max(1, ...a.diagnostic.topCustomers.map((m) => m.value));
  const agingTotal = Math.max(1, a.position.receivables);
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="chart"
        eyebrow="Analytics"
        title="Business analytics"
        description={<>{a.periodLabel} · Job Cards and Vehicle Services together · sales counted when a job is completed; parts at their actual goods-receipt cost.</>}
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ejo-text-muted)]"><Icon name="calendar" size={14} />Period</span>
        <PeriodPills periods={PERIODS} active={a.periodKey} hrefFor={(k) => `/analytics?period=${k}`} />
        <form className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="period" value="custom" />
          <input type="date" name="from" required defaultValue={from ?? ''} aria-label="From" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]" />
          <span className="text-xs text-[var(--ejo-text-muted)]">to</span>
          <input type="date" name="to" defaultValue={to ?? ''} aria-label="To" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]" />
          <button type="submit" className={`rounded-full px-3 py-1 text-xs font-medium ${a.periodKey === 'custom' ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Custom</button>
        </form>
      </div>

      <PriorityActions actions={a.actions} />

      <Group icon="activity">Performance · descriptive</Group>
      <div className="ejo-stagger mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon="money" money label="Sales" value={c.sales} change={a.changes.sales} />
        <Kpi icon="trend-up" money label="Gross profit" value={c.grossProfit} change={a.changes.grossProfit} />
        <Kpi icon="percent" label="Gross margin" value={pct(c.grossMargin)} hint={c.grossMargin !== null && a.previous.grossMargin !== null ? `was ${a.previous.grossMargin}%` : undefined} />
        <Kpi icon="check-circle" label="Jobs completed" value={c.jobsCompleted} change={a.changes.jobsCompleted} hint={`${pluralize(c.jobCardsCompleted, 'Job Card')} · ${pluralize(c.servicesCompleted, 'service')}`} />
        <Kpi icon="clipboard" money label="Average job" value={c.averageJob} change={a.changes.averageJob} />
        <Kpi icon="receipt" money label="Collections" value={c.collections} change={a.changes.collections} hint="Payments less refunds" />
      </div>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className={card}>
          <T icon="pie">Sales by type</T>
          <div className="space-y-2">{a.diagnostic.mix.map((m) => (
            <BarRow key={m.name} label={m.name} value={m.value} max={maxMix} note={naira(m.value)} labelWidth="4.5rem" />
          ))}</div>
          <p className="mt-3 text-[11px] text-[var(--ejo-text-muted)]">Labour share {pct(c.labourShare)} · parts margin {pct(c.partsMargin)}</p>
        </div>
        <div className={card}>
          <T icon="users">Who pays</T>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Customers</dt><dd className="text-[var(--ejo-text)]">{naira(c.customerSales)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Warranty providers</dt><dd className="text-[var(--ejo-text)]">{naira(c.warrantySales)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Given away (goodwill / internal)</dt><dd className="text-[var(--ejo-text)]">{naira(c.givenAway)}</dd></div>
            <div className="flex justify-between border-t border-[var(--ejo-border)] pt-1"><dt className="text-[var(--ejo-text-muted)]">Warranty settled in period</dt><dd className="text-[var(--ejo-text)]">{naira(c.warrantySettled)}</dd></div>
          </dl>
        </div>
        <div className={card}>
          <T icon="cart">Cost of sales</T>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Parts (actual cost)</dt><dd className="text-[var(--ejo-text)]">{naira(c.partsCost)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Sublet (cash paid out)</dt><dd className="text-[var(--ejo-text)]">{naira(c.subletCost)}</dd></div>
            <div className="flex justify-between border-t border-[var(--ejo-border)] pt-1 font-medium"><dt className="text-[var(--ejo-text)]">Total</dt><dd className="text-[var(--ejo-text)]">{naira(c.cost)}</dd></div>
            <div className="flex justify-between pt-1"><dt className="text-[var(--ejo-text-muted)]">Store purchases in period</dt><dd className="text-[var(--ejo-text)]">{naira(c.purchases)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <T icon="trend-up" className="mb-1">How the money is earned</T>
          <p className="mb-3 text-[11px] text-[var(--ejo-text-muted)]">Billed on completed jobs in the period (warranty-covered lines included; goodwill and internal lines are given away, not earned).</p>
          <table className="w-full text-sm">
            <tbody>
              {([['Labour', e.labour], ['Internal jobs (in-house work)', e.internalJobs], ['Store parts', e.storeParts], ['Outside parts (bought through EPR)', e.outsideParts], ['Outside jobs (sublet through EPR)', e.outsideJobs], ['Sundry', e.sundry]] as [string, number][]).map(([l, v]) => (
                <tr key={l} className="border-t border-[var(--ejo-border)]"><td className="py-1.5 text-[var(--ejo-text)]">{l}</td><td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(v)}</td><td className="w-14 py-1.5 text-right text-xs text-[var(--ejo-text-muted)]">{Math.round((v / earnedTotal) * 100)}%</td></tr>
              ))}
              <tr className="border-t-2 border-[var(--ejo-border)] font-semibold"><td className="py-1.5 text-[var(--ejo-text)]">Total sales</td><td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(a.current.sales)}</td><td /></tr>
              <tr className="border-t border-[var(--ejo-border)] text-xs"><td className="py-1.5 text-[var(--ejo-text-muted)]">From Job Cards / from Vehicle Services</td><td className="py-1.5 text-right text-[var(--ejo-text-muted)]" colSpan={2}>{naira(e.jobCards)} / {naira(e.vehicleServices)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Outside parts and jobs are billed to the customer and paid for in cash through EPR, so the business keeps only the difference — shown below as outside purchases.</p>
        </div>
        <div className={card}>
          <T icon="trend-down" className="mb-1">Where the money goes</T>
          <p className="mb-3 text-[11px] text-[var(--ejo-text-muted)]">Costs of the jobs completed in the period, and money paid out in the period.</p>
          <table className="w-full text-sm">
            <tbody>
              {([['Store parts used (at their goods-receipt cost)', c.partsCost], ['Outside purchases (EPR cash paid out)', c.subletCost], ['Refunds paid back to customers', c.refunds], ['Goodwill and internal work given away', c.givenAway]] as [string, number][]).map(([l, v]) => (
                <tr key={l} className="border-t border-[var(--ejo-border)]"><td className="py-1.5 text-[var(--ejo-text)]">{l}</td><td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(v)}</td></tr>
              ))}
              <tr className="border-t-2 border-[var(--ejo-border)] font-semibold"><td className="py-1.5 text-[var(--ejo-text)]">Gross profit on the work</td><td className="py-1.5 text-right text-[var(--ejo-text)]">{naira(c.grossProfit)} · {pct(c.grossMargin)}</td></tr>
              <tr className="border-t border-[var(--ejo-border)] text-xs"><td className="py-1.5 text-[var(--ejo-text-muted)]">Stock bought for the store in the period (not yet a cost until used)</td><td className="py-1.5 text-right text-[var(--ejo-text-muted)]">{naira(c.purchases)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <Group icon="gauge">Position right now</Group>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Kpi icon="wrench" money label="Work in progress" value={a.position.wipValue} hint={`${pluralize(a.position.wipJobCards, 'Job Card')} · ${pluralize(a.position.wipServices, 'service')} open`} href="/workshop/custody" />
        <div className={card}>
          <T icon="clock" className="mb-2">Receivables</T>
          <p className="text-2xl font-bold tabular-nums text-[var(--ejo-text)]">{naira(a.position.receivables)}</p>
          <p className="text-[10px] text-[var(--ejo-text-muted)]">{pluralize(a.position.receivableJobs, 'finished job')} not fully paid</p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--ejo-bg)] ring-1 ring-inset ring-[var(--ejo-border)]">
            <div className="bg-[var(--ejo-success)]" style={{ width: `${(a.position.aging.d0_7 / agingTotal) * 100}%` }} title="0–7 days" />
            <div style={{ width: `${(a.position.aging.d8_30 / agingTotal) * 100}%`, background: CHART.primarySoft }} title="8–30 days" />
            <div className="bg-[var(--ejo-warning)]" style={{ width: `${(a.position.aging.d31_60 / agingTotal) * 100}%` }} title="31–60 days" />
            <div className="bg-[var(--ejo-error)]" style={{ width: `${(a.position.aging.d60plus / agingTotal) * 100}%` }} title="Over 60 days" />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--ejo-text-muted)]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--ejo-success)]" />0–7 days {naira(a.position.aging.d0_7)}</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: CHART.primarySoft }} />8–30 {naira(a.position.aging.d8_30)}</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--ejo-warning)]" />31–60 {naira(a.position.aging.d31_60)}</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--ejo-error)]" />60+ {naira(a.position.aging.d60plus)}</span>
          </div>
        </div>
        <Kpi icon="refund" money label="Refunds owed" value={a.position.overpaidTotal} hint="Customers who paid more than they owe" href="/workshop" />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <T as="h2" icon="bars" className="mb-1">Last 12 weeks</T>
          <p className="mb-3 flex flex-wrap gap-3 text-[11px] text-[var(--ejo-text-muted)]"><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--ejo-primary)]/30" />Sales</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--ejo-primary)]" />Gross profit</span></p>
          <div className="flex h-44 items-end gap-1.5">
            {a.weeks.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-1" title={`${w.label}: sales ${naira(w.sales)}, gross profit ${naira(w.grossProfit)}, ${pluralize(w.jobs, 'job')}`}>
                <div className="ejo-grow-up relative w-full rounded-t-md bg-[var(--ejo-primary)]/25 transition-colors hover:bg-[var(--ejo-primary)]/40" style={{ height: `${Math.max(2, (w.sales / maxWeek) * 140)}px` }}>
                  <div className="absolute bottom-0 w-full rounded-t-md bg-[var(--ejo-primary)]" style={{ height: `${w.sales > 0 ? Math.max(0, (w.grossProfit / w.sales) * 100) : 0}%` }} />
                </div>
                <span className="text-[9px] text-[var(--ejo-text-muted)]">{w.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <T as="h2" icon="search">Why sales changed <span className="font-normal text-[var(--ejo-text-muted)]">· diagnostic</span></T>
          <p className="text-sm text-[var(--ejo-text)]">{a.diagnostic.salesChange >= 0 ? 'Up' : 'Down'} <span className="font-semibold">{naira(Math.abs(a.diagnostic.salesChange))}</span> on the previous period.</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">From the number of jobs</dt><dd className="text-[var(--ejo-text)]">{naira(a.diagnostic.volumeEffect)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">From the size of jobs</dt><dd className="text-[var(--ejo-text)]">{naira(a.diagnostic.ticketEffect)}</dd></div>
            <div className="flex justify-between border-t border-[var(--ejo-border)] pt-1"><dt className="text-[var(--ejo-text-muted)]">Gross margin</dt><dd className="text-[var(--ejo-text)]">{a.diagnostic.marginChange === null ? '—' : `${a.diagnostic.marginChange >= 0 ? '+' : ''}${a.diagnostic.marginChange} points`}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Parts margin</dt><dd className="text-[var(--ejo-text)]">{a.diagnostic.partsMarginChange === null ? '—' : `${a.diagnostic.partsMarginChange >= 0 ? '+' : ''}${a.diagnostic.partsMarginChange} points`}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Labour share of sales</dt><dd className="text-[var(--ejo-text)]">{a.diagnostic.labourShareChange === null ? '—' : `${a.diagnostic.labourShareChange >= 0 ? '+' : ''}${a.diagnostic.labourShareChange} points`}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <T as="h2" icon="sparkles">Forecast <span className="font-normal text-[var(--ejo-text-muted)]">· predictive</span></T>
          <p className="text-sm text-[var(--ejo-text)]">This month so far <span className="font-semibold">{naira(a.predictive.monthToDate)}</span> in {pluralize(a.predictive.workingDaysDone, 'working day')} — on course for about <span className="font-semibold">{naira(a.predictive.monthProjection)}</span> over {pluralize(a.predictive.workingDaysInMonth, 'working day')}.</p>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Weekly trend {a.predictive.trendPerWeek >= 0 ? 'rising' : 'falling'} by about {naira(Math.abs(a.predictive.trendPerWeek))} a week.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-[var(--ejo-text-muted)]"><th className="py-1">Week</th><th>Expected</th><th>Likely range</th></tr></thead>
              <tbody>{a.predictive.forecast.map((f) => <tr key={f.label} className="border-t border-[var(--ejo-border)]"><td className="py-1.5">{f.label}</td><td>{naira(f.expected)}</td><td className="text-xs text-[var(--ejo-text-muted)]">{naira(f.low)} – {naira(f.high)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className={card}>
          <T as="h2" icon="star">Top customers in the period</T>
          {a.diagnostic.topCustomers.length === 0 ? <p className="flex items-center gap-2 text-sm text-[var(--ejo-text-muted)]"><Icon name="inbox" size={16} />No completed jobs in this period.</p> : (
            <div className="space-y-2">{a.diagnostic.topCustomers.map((m) => (
              <BarRow key={m.name} label={m.name} value={m.value} max={maxCust} note={naira(m.value)} />
            ))}</div>
          )}
        </div>
      </div>
    </div>
  );
}
