import { guardPage } from '@/lib/authz/server';
import { HistoryToggle } from '@/components/HistoryToggle';
import { getHeadquarters, type HqRow } from '@/lib/actions/headquarters';
import { getMasterAnalytics } from '@/lib/actions/master-analytics';
import { getLeadershipPulse } from '@/lib/actions/leadership';
import { HQ_PERIODS } from '@/lib/hq-core';
import { LoadingLink } from '@/components/LoadingLink';
import { HqTabs } from '@/components/HqTabs';
import { AskEnyoButton } from '@/components/enyo/AskEnyoButton';
import { Icon, PageHeader, SectionCard, StatTile, StatusChip } from '@/components/ui';
import { formatDateTime, formatRelative } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { ExportAction } from '@/components/ExportAction';

export const metadata = { title: 'Headquarters' };
export const dynamic = 'force-dynamic';

const naira = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₦${Math.round(n).toLocaleString('en-NG')}`);
const compact = (n: number) => (Math.abs(n) >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}m` : Math.abs(n) >= 1_000 ? `₦${Math.round(n / 1_000)}k` : `₦${Math.round(n)}`);
const hours = (h: number | null) => (h === null ? '—' : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`);
const TONE = { good: 'success', watch: 'warning', act: 'error' } as const;

/** Twelve weeks of sales as bars (server-drawn, no script), with the figures for screen readers. */
function WeeklySales({ weeks }: { weeks: { label: string; sales: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.sales));
  const W = 560, H = 160, gap = 8, bw = (W - gap * (weeks.length - 1)) / weeks.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="h-auto w-full" role="img" aria-label="Sales per week, last twelve weeks">
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--ejo-border)" />
        {weeks.map((w, i) => {
          const h = Math.max(w.sales > 0 ? 3 : 0, (w.sales / max) * (H - 14));
          const x = i * (bw + gap);
          const last = i === weeks.length - 1;
          return (
            <g key={w.label}>
              <rect x={x} y={H - h} width={bw} height={h} rx="3" fill="var(--ejo-primary)" opacity={last ? 0.45 : 0.85}><title>{`${w.label}: ${naira(w.sales)}${last ? ' (this week, so far)' : ''}`}</title></rect>
              {i % 2 === weeks.length % 2 || last ? <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--ejo-text-muted)">{w.label}</text> : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-[var(--ejo-text-muted)]"><span>Highest week {naira(max)}</span><span>The paler bar is this week, so far</span></figcaption>
      <table className="sr-only"><caption>Sales per week</caption><tbody>{weeks.map((w) => <tr key={w.label}><th>{w.label}</th><td>{naira(w.sales)}</td></tr>)}</tbody></table>
    </figure>
  );
}

function BranchTable({ rows, period }: { rows: HqRow[]; period: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <caption className="sr-only">Branches side by side, {period}</caption>
        <thead>
          <tr className="border-b border-[var(--ejo-border)] text-[11px] uppercase tracking-wide text-[var(--ejo-text-muted)]">
            <th scope="col" className="px-4 py-2.5 font-semibold">Branch</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Opened</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Finished</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Collected</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">In now</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Ready</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Waiting</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Support</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Turnaround</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Health</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-b border-[var(--ejo-border)] last:border-0 hover:bg-[var(--ejo-bg)]">
              <th scope="row" className="px-4 py-3 font-medium text-[var(--ejo-text)]">{b.name}<span className="block text-xs font-normal text-[var(--ejo-text-muted)]">{pluralize(b.staff, 'person', 'people')}</span></th>
              <td className="px-3 py-3 text-right tabular-nums">{b.opened}</td>
              <td className="px-3 py-3 text-right tabular-nums">{b.finished}</td>
              <td className="px-3 py-3 text-right tabular-nums">{naira(b.collected)}{b.fromSap ? <span className="block text-xs text-[var(--ejo-text-muted)]" title="Invoiced in SAP before EJO 100, dated in this period">+ {naira(b.fromSap)} in SAP</span> : null}</td>
              <td className="px-3 py-3 text-right tabular-nums">{b.inWorkshop}</td>
              <td className={`px-3 py-3 text-right tabular-nums ${b.ready >= 5 ? 'font-semibold text-[var(--ejo-warning-text)]' : ''}`}>{b.ready}</td>
              <td className="px-3 py-3 text-right tabular-nums">{b.waiting}{b.oldestWaitingHours !== null ? <span className={`block text-xs ${b.oldestWaitingHours >= 48 ? 'font-semibold text-[var(--ejo-error)]' : 'text-[var(--ejo-text-muted)]'}`}>oldest {hours(b.oldestWaitingHours)}</span> : null}</td>
              <td className="px-3 py-3 text-right tabular-nums">{b.supportOpen}{b.supportLate ? <span className="block text-xs font-semibold text-[var(--ejo-error)]">{b.supportLate} late</span> : null}</td>
              <td className={`px-3 py-3 text-right tabular-nums ${(b.turnaroundHours ?? 0) > 72 ? 'font-semibold text-[var(--ejo-warning-text)]' : ''}`}>{hours(b.turnaroundHours)}</td>
              <td className="px-4 py-3"><StatusChip tone={TONE[b.health.tone]} label={b.health.label} />{b.health.reasons.length ? <span className="mt-1 block max-w-[16rem] text-xs text-[var(--ejo-text-muted)]">{b.health.reasons.join('; ')}</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Headquarters: the whole organisation on one page for the people who run it
 * — this period's money, every branch side by side with its health, where
 * decisions are waiting, people and customers, and the notices sent; with a
 * spreadsheet export. Read-only: each figure opens the page where it is dealt
 * with, and decisions stay with the managers who own them.
 */
export default async function HeadquartersPage({ searchParams }: { searchParams: Promise<{ period?: string; history?: string }> }) {
  await guardPage('analytics.business.view', '/headquarters');
  const sp = await searchParams;
  // History from before EJO (SAP invoices) is included unless the viewer chooses EJO's own figures only.
  const history = sp.history !== 'exclude';
  const [hq, a, pulse] = await Promise.all([getHeadquarters(sp.period, { history }), getMasterAnalytics(sp.period, undefined, { history }).catch(() => null), getLeadershipPulse().catch(() => null)]);
  const t = hq.totals;
  const toAct = hq.branches.filter((b) => b.health.tone === 'act');
  const waiting = (pulse?.waiting ?? []).filter((w) => w.count > 0).sort((x, y) => (y.oldestHours ?? 0) - (x.oldestHours ?? 0));
  const periodLink = (k: string) => { const p = new URLSearchParams({ ...(k === 'this_month' ? {} : { period: k }), ...(history ? {} : { history: 'exclude' }) }).toString(); return `/headquarters${p ? `?${p}` : ''}`; };

  return (
    <div className="w-full max-w-[90rem] space-y-6 p-4 sm:p-8" data-testid="headquarters">
      <PageHeader
        hero
        icon="building"
        eyebrow={hq.organisationName ?? 'Your organisation'}
        title={hq.scope === 'branch' ? 'Your branch' : 'Headquarters'}
        description={`${hq.period.label} · ${pluralize(hq.branches.length, 'branch', 'branches')} · figures as of ${formatDateTime(hq.asOf)}. Read-only: each figure opens the page where it is dealt with.`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <AskEnyoButton variant="solid" send speak icon="speaker" label="Brief me" question={`Give me a spoken briefing on ${hq.lensBranch ?? (hq.scope === 'branch' ? 'my branch' : 'the whole organisation, branch by branch')} this month (use branch_briefing, then stock_alerts and warranty_watch): the one-line verdict, money and what makes it, the workshop — Job Cards and Vehicle Services — decisions waiting, inventory, warranty, the team, customers and support, and the three things I should do first.`} />
            <ExportAction kind="headquarters" params={{ period: hq.period.key, history: history ? undefined : 'exclude' }} />
            {hq.canBroadcast ? <LoadingLink href="/notifications/broadcasts/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-sm font-semibold text-white hover:brightness-110"><Icon name="megaphone" size={15} />Send a notice</LoadingLink> : null}
          </div>
        )}
      />

      <HqTabs active="/headquarters" period={hq.period.key} />
      {hq.lensBranch ? <p role="status" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/30 bg-[var(--ejo-primary)]/[0.06] px-4 py-2.5 text-sm text-[var(--ejo-text)]">Showing <b>{hq.lensBranch}</b> only. Choose <b>All branches</b> in the bar at the top to compare every branch.</p> : null}
      <nav aria-label="Period" className="flex flex-wrap gap-2">
        {HQ_PERIODS.map((p) => (
          <LoadingLink key={p.key} href={periodLink(p.key)} aria-current={hq.period.key === p.key ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${hq.period.key === p.key ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]'}`}>{p.label}</LoadingLink>
        ))}
        <span className="ml-auto"><HistoryToggle path="/headquarters" params={{ period: sp.period }} include={history} /></span>
      </nav>

      {toAct.length ? (
        <div role="status" className="flex items-start gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/[0.06] px-4 py-3">
          <span className="mt-0.5 text-[var(--ejo-error)]"><Icon name="alert" size={18} /></span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-[var(--ejo-text)]">{pluralize(toAct.length, 'branch needs', 'branches need')} action</p>
            <ul className="mt-0.5 text-[var(--ejo-text-muted)]">{toAct.map((b) => <li key={b.id}><span className="font-medium text-[var(--ejo-text)]">{b.name}:</span> {b.health.reasons.join('; ')}</li>)}</ul>
          </div>
        </div>
      ) : hq.branches.length ? (
        <p role="status" className="flex items-center gap-2 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/[0.06] px-4 py-3 text-sm text-[var(--ejo-text)]"><Icon name="check-circle" size={17} className="text-[var(--ejo-success)]" />Every branch is on track: no decision waiting two days, no customer request past its target.</p>
      ) : null}

      {a ? (
        <div className="ejo-stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatTile icon="money" label="Sales" value={naira(a.current.sales)} delta={a.changes.sales} hint="Work finished, at selling price" href="/analytics" />
          <StatTile icon="trend-up" label="Gross profit" value={naira(a.current.grossProfit)} delta={a.changes.grossProfit} hint={a.current.grossMargin !== null ? `${a.current.grossMargin}% margin` : undefined} href="/analytics" />
          <StatTile icon="receipt" label="Money collected" value={naira(a.current.collections)} delta={a.changes.collections} hint="Payments less refunds" href="/analytics" />
          <StatTile icon="clipboard" label="Jobs finished" value={a.current.jobsCompleted} delta={a.changes.jobsCompleted} hint={a.current.averageJob !== null ? `Average ${naira(a.current.averageJob)}` : undefined} href="/analytics" />
          <StatTile icon="alert" label="Owed on finished jobs" value={naira(a.position.receivables)} hint={pluralize(a.position.receivableJobs, 'job')} tone={a.position.receivables > 0 ? 'warning' : 'brand'} href="/analytics" />
          <StatTile icon="activity" label="Month projection" value={naira(a.predictive.monthProjection)} hint={a.predictive.lastMonthSales ? `Last month ${naira(a.predictive.lastMonthSales)}` : 'At the current pace'} href="/analytics" />
        </div>
      ) : null}
      {a?.sapHistory.amount ? (
        <p className="flex items-start gap-2 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3 text-sm text-[var(--ejo-text)]"><Icon name="history" size={16} className="mt-0.5 shrink-0 text-[var(--ejo-text-muted)]" /><span>Invoiced in SAP before EJO 100, dated in this period: <b className="tabular-nums">{naira(a.sapHistory.amount)}</b> on {pluralize(a.sapHistory.invoices, 'invoice')}{a.sapHistory.previous ? ` (previous period ${naira(a.sapHistory.previous)})` : ''}. History brought in from SAP — counted in each customer’s spend and in the top customers, kept out of EJO’s own sales, margins and projections.</span></p>
      ) : null}

      <SectionCard icon="branch" title="Branches side by side" description={`${hq.period.label}: jobs opened and finished, money collected; now: in the workshop, ready to collect, decisions and customer requests waiting; median turnaround from check-in to check-out.`} flush
        actions={<a href={`/headquarters/export?period=${hq.period.key}${history ? "" : "&history=exclude"}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Export</a>}>
        {hq.branches.length ? <BranchTable rows={hq.branches} period={hq.period.label} /> : <p className="p-4 text-sm text-[var(--ejo-text-muted)]">No branches yet — add them on Organisation structure.</p>}
        {hq.branches.length > 1 ? (
          <p className="border-t border-[var(--ejo-border)] px-4 py-2.5 text-xs text-[var(--ejo-text-muted)]">All branches: {t.opened} opened · {t.finished} finished · {naira(t.collected)} collected{t.fromSap ? ` (+ ${naira(t.fromSap)} invoiced in SAP before EJO)` : ''} · {t.inWorkshop} in now · {t.ready} ready · {t.waiting} decisions waiting · {t.supportOpen} support requests open{t.supportLate ? ` (${t.supportLate} late)` : ''}</p>
        ) : null}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <SectionCard icon="chart" title="Sales, week by week" description="Last twelve weeks, Monday to Sunday, work finished at selling price" actions={<LoadingLink href="/analytics" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Full analytics →</LoadingLink>}>
          {a ? <WeeklySales weeks={a.weeks} /> : <p className="text-sm text-[var(--ejo-text-muted)]">No figures yet.</p>}
          {a?.actions.length ? (
            <div className="mt-4 border-t border-[var(--ejo-border)] pt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Worth a look</p>
              <ul className="space-y-1.5">{a.actions.slice(0, 4).map((x) => <li key={x.title}><LoadingLink href={x.href} className="flex items-start gap-2 text-sm text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]"><StatusChip tone={x.priority === 1 ? 'warning' : 'neutral'} label={x.priority === 1 ? 'Now' : 'Soon'} />{x.title}</LoadingLink></li>)}</ul>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard icon="check-circle" title={`Decisions waiting${t.waiting ? ` · ${t.waiting}` : ''}`} description="Oldest first — who is holding work up. Decisions stay with the managers who own them.">
          {waiting.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {waiting.map((x) => (
                <li key={x.key}><LoadingLink href={x.href} className="flex items-center gap-3 py-2 text-sm hover:text-[var(--ejo-primary)]">
                  <span className="min-w-0 flex-1 text-[var(--ejo-text)]">{x.label}</span>
                  <span className="font-semibold tabular-nums">{x.count}</span>
                  <span className={`w-24 text-right text-xs ${(x.oldestHours ?? 0) >= 48 ? 'font-semibold text-[var(--ejo-error)]' : 'text-[var(--ejo-text-muted)]'}`}>oldest {hours(x.oldestHours)}</span>
                </LoadingLink></li>
              ))}
            </ul>
          ) : <p className="text-sm text-[var(--ejo-success)]">Nothing is waiting for a decision.</p>}
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard icon="users" title="People">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-[var(--ejo-text-muted)]">Active staff</dt><dd className="text-2xl font-semibold tabular-nums">{t.staff}</dd>{t.staffAtHeadOffice ? <dd className="text-[11px] text-[var(--ejo-text-muted)]">{t.staffAtHeadOffice} at head office</dd> : null}</div>
            <div><dt className="text-xs text-[var(--ejo-text-muted)]">Joined, {hq.period.label.toLowerCase()}</dt><dd className="text-2xl font-semibold tabular-nums">{t.staffNew}</dd></div>
          </dl>
          <ul className="mt-4 space-y-1.5 text-xs text-[var(--ejo-text-muted)]">
            {hq.branches.slice(0, 6).map((b) => <li key={b.id} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{b.name}</span><span className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--ejo-bg)]"><span className="block h-full rounded-full bg-[var(--ejo-primary)]" style={{ width: `${t.staff ? Math.round((b.staff / Math.max(...hq.branches.map((x) => x.staff), 1)) * 100) : 0}%` }} /></span><span className="w-8 text-right tabular-nums text-[var(--ejo-text)]">{b.staff}</span></li>)}
          </ul>
        </SectionCard>

        <SectionCard icon="handshake" title="Customers">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-xs text-[var(--ejo-text-muted)]">New customers</dt><dd className="text-2xl font-semibold tabular-nums">{t.customersNew ?? '—'}</dd><dd className="text-[11px] text-[var(--ejo-text-muted)]">{hq.period.label}</dd></div>
            <div><dt className="text-xs text-[var(--ejo-text-muted)]">Support requests open</dt><dd className={`text-2xl font-semibold tabular-nums ${t.supportLate ? 'text-[var(--ejo-error)]' : ''}`}>{t.supportOpen}</dd><dd className="text-[11px] text-[var(--ejo-text-muted)]">{t.supportLate ? `${t.supportLate} past target` : 'none past target'}</dd></div>
            {pulse?.support?.csat !== null && pulse?.support ? <div className="col-span-2"><dt className="text-xs text-[var(--ejo-text-muted)]">Satisfaction (30 days)</dt><dd className="text-lg font-semibold tabular-nums">{pulse.support.csat}/5 <span className="text-xs font-normal text-[var(--ejo-text-muted)]">from {pluralize(pulse.support.csatResponses, 'rating')}</span></dd></div> : null}
          </dl>
        </SectionCard>

        <SectionCard icon="megaphone" title="Notices" description={hq.canBroadcast ? 'The latest broadcasts to staff and customers' : undefined}
          actions={hq.canBroadcast ? <LoadingLink href="/notifications/broadcasts" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">All →</LoadingLink> : undefined}>
          {hq.broadcasts === null ? <p className="text-sm text-[var(--ejo-text-muted)]">Notices are sent by leadership, IT and broadcasters.</p> : hq.broadcasts.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {hq.broadcasts.map((b) => (
                <li key={b.id} className="py-2"><LoadingLink href={`/notifications/broadcasts/${b.id}`} className="block text-sm hover:text-[var(--ejo-primary)]">
                  <span className="block truncate font-medium text-[var(--ejo-text)]">{b.title}</span>
                  <span className="text-xs text-[var(--ejo-text-muted)]">{b.category} · {b.audience} · {b.state} · {formatRelative(b.startsAt)}</span>
                </LoadingLink></li>
              ))}
            </ul>
          ) : <p className="text-sm text-[var(--ejo-text-muted)]">No notices yet.</p>}
          {hq.canBroadcast ? <LoadingLink href="/notifications/broadcasts/new" className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"><Icon name="megaphone" size={15} />Send a notice</LoadingLink> : null}
        </SectionCard>
      </div>

      <details className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-[var(--ejo-text)]">How these figures are worked out</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--ejo-text-muted)]">
          <li><b>Opened</b> and <b>finished</b>: Job Cards and Vehicle Services created, and completed (not cancelled), in the period.</li>
          <li><b>Collected</b>: payments recorded in the period less refunds recorded in the period. <b>Sales</b> (top) is work finished at its selling price, from Business analytics.</li>
          <li><b>In now</b> and <b>ready</b>: as of now, whatever the period. <b>Waiting</b>: estimates, parts requests, outside purchases, warranty claims and exit passes waiting for someone to decide.</li>
          <li><b>Health</b>: <i>needs action</i> when a decision has waited two days or more or a customer request is past its target; <i>watch</i> when five or more vehicles wait to be collected or the median job takes more than three days.</li>
          <li>{hq.scope === 'branch' ? 'You see your own branch.' : 'You see every branch of the organisation.'} Counts and totals only; no customer details. Exports are recorded in the audit trail.</li>
        </ul>
      </details>
    </div>
  );
}
