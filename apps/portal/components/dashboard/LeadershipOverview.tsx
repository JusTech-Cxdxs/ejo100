import { getLeadershipPulse } from '@/lib/actions/leadership';
import { getMasterAnalytics } from '@/lib/actions/master-analytics';
import { LoadingLink } from '@/components/LoadingLink';
import { Icon, SectionCard, StatTile, StatusChip } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const naira = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₦${Math.round(n).toLocaleString('en-NG')}`);
const age = (h: number | null) => (h === null ? '' : h < 1 ? 'under an hour' : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`);

/**
 * The leadership overview on the dashboard: this month's money, the work in
 * the workshop, decisions waiting (and for how long), customer support, and
 * every branch side by side — read-only, each tile opening the page behind
 * it. For directors and managers (analytics.business.view), within their reach.
 */
export async function LeadershipOverview() {
  const [p, a] = await Promise.all([getLeadershipPulse(), getMasterAnalytics('this_month').catch(() => null)]);
  const waiting = p.waiting.filter((w) => w.count > 0).sort((x, y) => (y.oldestHours ?? 0) - (x.oldestHours ?? 0));
  const totalWaiting = waiting.reduce((n, w) => n + w.count, 0);
  const stale = waiting.filter((w) => (w.oldestHours ?? 0) >= 48);
  const proj = a?.predictive.monthProjection ?? null;
  const last = a?.predictive.lastMonthSales ?? null;
  return (
    <section aria-labelledby="leadership-title" className="mb-6 space-y-4" data-testid="leadership-overview">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="leadership-title" className="flex items-center gap-2 text-base font-semibold text-[var(--ejo-text)]"><Icon name="chart" size={18} />{p.scope === 'branch' ? 'Your branch at a glance' : 'The business at a glance'}</h2>
          <p className="text-xs text-[var(--ejo-text-muted)]">This month to date · figures as of {formatDateTime(p.asOf)} · read-only</p>
        </div>
        <LoadingLink href="/analytics" className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">Full business analytics →</LoadingLink>
      </div>

      {a ? (
        <div className="ejo-stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatTile icon="money" label="Sales this month" value={naira(a.current.sales)} delta={a.changes.sales} hint="Work finished, at selling price" href="/analytics" />
          <StatTile icon="trend-up" label="Gross profit" value={naira(a.current.grossProfit)} delta={a.changes.grossProfit} hint={a.current.grossMargin !== null ? `${a.current.grossMargin}% margin` : undefined} href="/analytics" />
          <StatTile icon="receipt" label="Money collected" value={naira(a.current.collections)} delta={a.changes.collections} hint="Payments less refunds" href="/analytics" />
          <StatTile icon="clipboard" label="Jobs finished" value={a.current.jobsCompleted} delta={a.changes.jobsCompleted} hint={a.current.averageJob !== null ? `Average ${naira(a.current.averageJob)}` : undefined} href="/analytics" />
          <StatTile icon="alert" label="Owed on finished jobs" value={naira(a.position.receivables)} hint={pluralize(a.position.receivableJobs, 'job')} tone={a.position.receivables > 0 ? 'warning' : 'brand'} href="/analytics" />
          <StatTile icon="activity" label="Month projection" value={naira(proj)} hint={last ? `Last month ${naira(last)}` : 'At the current pace'} tone={proj !== null && last && proj < last * 0.85 ? 'warning' : 'brand'} href="/analytics" />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <SectionCard icon="garage" title="In the workshop now" description={`Median turnaround ${p.workshop.turnaroundHours !== null ? age(p.workshop.turnaroundHours) : '—'} from check-in to check-out (last 30 days, ${pluralize(p.workshop.checkedOut30d, 'vehicle')})`}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: 'Job Cards in', value: p.workshop.jobCardsIn, href: '/workshop/custody' },
              { label: 'Services in', value: p.workshop.servicesIn, href: '/workshop/vehicle-service-custody' },
              { label: 'Ready to collect', value: p.workshop.ready, href: '/workshop/custody' },
              { label: 'Waiting for parts', value: p.workshop.awaitingParts, href: '/workshop/parts-requests' },
              { label: 'Waiting for the customer', value: p.workshop.awaitingCustomer, href: '/workshop/custody' },
            ].map((t) => (
              <LoadingLink key={t.label} href={t.href} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 hover:border-[var(--ejo-primary)]/50">
                <span className="block text-2xl font-semibold tabular-nums text-[var(--ejo-text)]">{t.value}</span>
                <span className="block text-xs text-[var(--ejo-text-muted)]">{t.label}</span>
              </LoadingLink>
            ))}
          </div>
        </SectionCard>

        <SectionCard icon="check-circle" title={`Decisions waiting${totalWaiting ? ` · ${totalWaiting}` : ''}`} tone={stale.length ? 'warning' : 'brand'} description={stale.length ? `${pluralize(stale.length, 'queue')} with something waiting 2 days or more` : 'Oldest first — who is holding work up'}>
          {waiting.length ? (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {waiting.map((x) => (
                <li key={x.key}>
                  <LoadingLink href={x.href} className="flex items-center gap-3 py-2 text-sm hover:text-[var(--ejo-primary)]">
                    <span className="min-w-0 flex-1 text-[var(--ejo-text)]">{x.label}</span>
                    <span className="font-semibold tabular-nums text-[var(--ejo-text)]">{x.count}</span>
                    <span className={`w-28 text-right text-xs ${(x.oldestHours ?? 0) >= 48 ? 'font-semibold text-[var(--ejo-warning-text)]' : 'text-[var(--ejo-text-muted)]'}`}>oldest {age(x.oldestHours)}</span>
                  </LoadingLink>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-[var(--ejo-success)]">Nothing is waiting for a decision.</p>}
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SectionCard icon="branch" title="Branches side by side" description="In the workshop now, ready to collect, opened and collected this month" flush>
          {p.branches.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead><tr className="text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2 font-medium">Branch</th><th className="px-3 py-2 text-right font-medium">In now</th><th className="px-3 py-2 text-right font-medium">Ready</th><th className="px-3 py-2 text-right font-medium">Opened</th><th className="px-4 py-2 text-right font-medium">Collected</th></tr></thead>
                <tbody>
                  {p.branches.map((b) => (
                    <tr key={b.id} className="border-t border-[var(--ejo-border)]">
                      <td className="px-4 py-2 font-medium text-[var(--ejo-text)]">{b.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.inWorkshop}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.ready}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.openedThisMonth}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{naira(b.collectedThisMonth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="p-4 text-sm text-[var(--ejo-text-muted)]">No branches yet.</p>}
        </SectionCard>

        <SectionCard icon="inbox" title="Customers and support" description="Requests from email, the website, the portal and colleagues">
          {p.support ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Open requests</dt><dd className="text-2xl font-semibold tabular-nums text-[var(--ejo-text)]">{p.support.open}</dd></div>
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Past their target</dt><dd className={`text-2xl font-semibold tabular-nums ${p.support.late ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text)]'}`}>{p.support.late}</dd></div>
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Without an owner</dt><dd className={`text-2xl font-semibold tabular-nums ${p.support.unassigned ? 'text-[var(--ejo-warning-text)]' : 'text-[var(--ejo-text)]'}`}>{p.support.unassigned}</dd></div>
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Satisfaction (30 days)</dt><dd className="text-2xl font-semibold tabular-nums text-[var(--ejo-text)]">{p.support.csat !== null ? `${p.support.csat}/5` : '—'}</dd><dd className="text-[11px] text-[var(--ejo-text-muted)]">{pluralize(p.support.csatResponses, 'rating')}</dd></div>
            </dl>
          ) : <p className="text-sm text-[var(--ejo-text-muted)]">No support numbers yet.</p>}
          {a?.actions.length ? (
            <div className="mt-4 border-t border-[var(--ejo-border)] pt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Worth a look</p>
              <ul className="space-y-1.5">{a.actions.slice(0, 3).map((x) => <li key={x.title}><LoadingLink href={x.href} className="flex items-start gap-2 text-sm text-[var(--ejo-text)] hover:text-[var(--ejo-primary)]"><StatusChip tone={x.priority === 1 ? 'warning' : 'neutral'} label={x.priority === 1 ? 'Now' : 'Soon'} />{x.title}</LoadingLink></li>)}</ul>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </section>
  );
}
