import { canSeeMasterAnalytics, getMasterAnalytics } from '@/lib/actions/master-analytics';
import { LoadingLink } from '@/components/LoadingLink';
import { pluralize } from '@/lib/utils/pluralize';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
const naira = (n: number | null) => (n === null ? '—' : `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`);
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
const PERIODS: [string, string][] = [['today', 'Today'], ['this_month', 'This month'], ['last_month', 'Last month'], ['last_30', 'Last 30 days'], ['this_quarter', 'This quarter'], ['this_year', 'This year']];

export default async function BusinessAnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const { period, from, to } = await searchParams;
  // Refused on the server — typing the address directly does not get round it.
  if (!(await canSeeMasterAnalytics())) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Business analytics</h1>
        <p className="mt-3 max-w-xl text-sm text-[var(--ejo-text-muted)]">This dashboard is for the Master Admin, Administrators, the Workshop Manager and Finance. Ask an administrator if you need access.</p>
      </div>
    );
  }
  const a = await getMasterAnalytics(period, { from, to });
  const e = a.current.earnings;
  const earnedTotal = Math.max(1, a.current.sales);
  const c = a.current;
  const Change = ({ v, invert = false }: { v: number | null; invert?: boolean }) =>
    v === null ? <span className="text-[10px] text-[var(--ejo-text-muted)]">no comparison</span> : <span className={`text-[11px] font-semibold ${(v >= 0) !== invert ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}% vs previous</span>;
  const Kpi = ({ label, value, change, hint, href }: { label: string; value: string | number; change?: number | null; hint?: string; href?: string }) => {
    const inner = (<><p className="text-xs text-[var(--ejo-text-muted)]">{label}</p><p className="mt-1 text-xl font-bold text-[var(--ejo-text)] sm:text-2xl">{value}</p>{change !== undefined ? <Change v={change} /> : null}{hint ? <p className="mt-1 text-[10px] text-[var(--ejo-text-muted)]">{hint}</p> : null}</>);
    return href ? <LoadingLink href={href} className={`${card} block hover:border-[var(--ejo-primary)]`}>{inner}</LoadingLink> : <div className={card}>{inner}</div>;
  };
  const maxWeek = Math.max(1, ...a.weeks.map((w) => w.sales));
  const maxMix = Math.max(1, ...a.diagnostic.mix.map((m) => m.value));
  const maxCust = Math.max(1, ...a.diagnostic.topCustomers.map((m) => m.value));
  const agingTotal = Math.max(1, a.position.receivables);
  return (
    <div className="w-full p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Business analytics</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{a.periodLabel} · Job Cards and Vehicle Services together · sales counted when a job is completed; parts at their actual goods-receipt cost.</p>
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODS.map(([k, l]) => <LoadingLink key={k} href={`/analytics?period=${k}`} className={`rounded-full px-3 py-1 text-xs font-medium ${a.periodKey === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l}</LoadingLink>)}
        <form className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="period" value="custom" />
          <input type="date" name="from" required defaultValue={from ?? ''} aria-label="From" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]" />
          <span className="text-xs text-[var(--ejo-text-muted)]">to</span>
          <input type="date" name="to" defaultValue={to ?? ''} aria-label="To" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]" />
          <button type="submit" className={`rounded-full px-3 py-1 text-xs font-medium ${a.periodKey === 'custom' ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Custom</button>
        </form>
      </div>

      {a.actions.length ? (
        <section className="mb-8 space-y-2">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">What to do now <span className="font-normal text-[var(--ejo-text-muted)]">· prescriptive</span></h2>
          {a.actions.map((x, i) => (
            <div key={i} className={`flex items-start gap-3 ${card}`}>
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${x.priority === 1 ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' : x.priority === 2 ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' : 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]'}`}>P{x.priority}</span>
              <div className="min-w-0 flex-1">
                <LoadingLink href={x.href} className="block text-sm font-medium text-[var(--ejo-text)] hover:underline">{x.title}</LoadingLink>
                <span className="block text-xs text-[var(--ejo-text-muted)]">{x.detail}</span>
                {x.items.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {x.items.map((it) => <LoadingLink key={it.href + it.label} href={it.href} className="rounded-full border border-[var(--ejo-border)] px-2 py-0.5 text-[11px] text-[var(--ejo-primary)] hover:bg-[var(--ejo-bg)]">{it.label} →</LoadingLink>)}
                  </div>
                ) : null}
              </div>
              {x.items.length > 1 ? <LoadingLink href={x.href} className="shrink-0 text-xs text-[var(--ejo-primary)] hover:underline">Open the list →</LoadingLink> : null}
            </div>
          ))}
        </section>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Performance <span className="font-normal text-[var(--ejo-text-muted)]">· descriptive</span></h2>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Sales" value={naira(c.sales)} change={a.changes.sales} />
        <Kpi label="Gross profit" value={naira(c.grossProfit)} change={a.changes.grossProfit} />
        <Kpi label="Gross margin" value={pct(c.grossMargin)} hint={c.grossMargin !== null && a.previous.grossMargin !== null ? `was ${a.previous.grossMargin}%` : undefined} />
        <Kpi label="Jobs completed" value={c.jobsCompleted} change={a.changes.jobsCompleted} hint={`${pluralize(c.jobCardsCompleted, 'Job Card')} · ${pluralize(c.servicesCompleted, 'service')}`} />
        <Kpi label="Average job" value={naira(c.averageJob)} change={a.changes.averageJob} />
        <Kpi label="Collections" value={naira(c.collections)} change={a.changes.collections} hint="Payments less refunds" />
      </div>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Sales by type</h3>
          <div className="space-y-1.5">{a.diagnostic.mix.map((m) => (
            <div key={m.name} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs"><span className="text-[var(--ejo-text)]">{m.name}</span><div className="h-3 rounded bg-[var(--ejo-bg)]"><div className="h-3 rounded bg-[var(--ejo-primary)]" style={{ width: `${(m.value / maxMix) * 100}%` }} /></div><span className="text-[var(--ejo-text-muted)]">{naira(m.value)}</span></div>
          ))}</div>
          <p className="mt-3 text-[11px] text-[var(--ejo-text-muted)]">Labour share {pct(c.labourShare)} · parts margin {pct(c.partsMargin)}</p>
        </div>
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Who pays</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Customers</dt><dd className="text-[var(--ejo-text)]">{naira(c.customerSales)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Warranty providers</dt><dd className="text-[var(--ejo-text)]">{naira(c.warrantySales)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--ejo-text-muted)]">Given away (goodwill / internal)</dt><dd className="text-[var(--ejo-text)]">{naira(c.givenAway)}</dd></div>
            <div className="flex justify-between border-t border-[var(--ejo-border)] pt-1"><dt className="text-[var(--ejo-text-muted)]">Warranty settled in period</dt><dd className="text-[var(--ejo-text)]">{naira(c.warrantySettled)}</dd></div>
          </dl>
        </div>
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Cost of sales</h3>
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
          <h3 className="mb-1 text-sm font-semibold text-[var(--ejo-text)]">How the money is earned</h3>
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
          <h3 className="mb-1 text-sm font-semibold text-[var(--ejo-text)]">Where the money goes</h3>
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

      <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Position right now</h2>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Kpi label="Work in progress" value={naira(a.position.wipValue)} hint={`${pluralize(a.position.wipJobCards, 'Job Card')} · ${pluralize(a.position.wipServices, 'service')} open`} href="/workshop/custody" />
        <div className={card}>
          <p className="text-xs text-[var(--ejo-text-muted)]">Receivables</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{naira(a.position.receivables)}</p>
          <p className="text-[10px] text-[var(--ejo-text-muted)]">{pluralize(a.position.receivableJobs, 'finished job')} not fully paid</p>
          <div className="mt-3 flex h-3 overflow-hidden rounded bg-[var(--ejo-bg)]">
            <div className="bg-[var(--ejo-success)]" style={{ width: `${(a.position.aging.d0_7 / agingTotal) * 100}%` }} title="0–7 days" />
            <div className="bg-[var(--ejo-info)]" style={{ width: `${(a.position.aging.d8_30 / agingTotal) * 100}%` }} title="8–30 days" />
            <div className="bg-[var(--ejo-warning)]" style={{ width: `${(a.position.aging.d31_60 / agingTotal) * 100}%` }} title="31–60 days" />
            <div className="bg-[var(--ejo-error)]" style={{ width: `${(a.position.aging.d60plus / agingTotal) * 100}%` }} title="Over 60 days" />
          </div>
          <p className="mt-2 text-[10px] text-[var(--ejo-text-muted)]">0–7 days {naira(a.position.aging.d0_7)} · 8–30 {naira(a.position.aging.d8_30)} · 31–60 {naira(a.position.aging.d31_60)} · 60+ {naira(a.position.aging.d60plus)}</p>
        </div>
        <Kpi label="Refunds owed" value={naira(a.position.overpaidTotal)} hint="Customers who paid more than they owe" href="/workshop" />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-1 text-sm font-semibold text-[var(--ejo-text)]">Last 12 weeks</h2>
          <p className="mb-3 text-[11px] text-[var(--ejo-text-muted)]">Sales (bar) and gross profit (dark part)</p>
          <div className="flex h-44 items-end gap-1.5">
            {a.weeks.map((w) => (
              <div key={w.label} className="flex flex-1 flex-col items-center gap-1" title={`${w.label}: sales ${naira(w.sales)}, gross profit ${naira(w.grossProfit)}, ${pluralize(w.jobs, 'job')}`}>
                <div className="relative w-full rounded-t bg-[var(--ejo-primary)]/30" style={{ height: `${Math.max(2, (w.sales / maxWeek) * 140)}px` }}>
                  <div className="absolute bottom-0 w-full rounded-t bg-[var(--ejo-primary)]" style={{ height: `${w.sales > 0 ? Math.max(0, (w.grossProfit / w.sales) * 100) : 0}%` }} />
                </div>
                <span className="text-[9px] text-[var(--ejo-text-muted)]">{w.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Why sales changed <span className="font-normal text-[var(--ejo-text-muted)]">· diagnostic</span></h2>
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
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Forecast <span className="font-normal text-[var(--ejo-text-muted)]">· predictive</span></h2>
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
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Top customers in the period</h2>
          {a.diagnostic.topCustomers.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No completed jobs in this period.</p> : (
            <div className="space-y-1.5">{a.diagnostic.topCustomers.map((m) => (
              <div key={m.name} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs"><span className="truncate text-[var(--ejo-text)]" title={m.name}>{m.name}</span><div className="h-3 rounded bg-[var(--ejo-bg)]"><div className="h-3 rounded bg-[var(--ejo-info)]" style={{ width: `${(m.value / maxCust) * 100}%` }} /></div><span className="text-[var(--ejo-text-muted)]">{naira(m.value)}</span></div>
            ))}</div>
          )}
        </div>
      </div>
    </div>
  );
}
