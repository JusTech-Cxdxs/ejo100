import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { getSupportAnalytics } from '@/lib/actions/support-analytics';
import { PageHeader, SectionCard, StatTile, BarRow, EmptyState, CHART } from '@/components/ui';
import { minutesLabel } from '@/lib/support/core';
import { CHANNEL_LABEL } from '@/lib/support/core';

export const metadata = { title: 'Support numbers' };
export const dynamic = 'force-dynamic';

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const PERIODS = [7, 30, 90, 365];

/**
 * The Support centre's numbers: how fast people get a first answer, how
 * many targets are met, how much Enyo resolves by itself and why it hands
 * over, reopen rate, satisfaction, backlog age, topics, teams and people.
 * Counts and times only; within the person's reach.
 */
export default async function SupportAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string; queue?: string }> }) {
  await guardPage('support.tickets.manage', '/crm/support/analytics');
  const sp = await searchParams;
  const a = await getSupportAnalytics({ days: Number(sp.days), queueId: sp.queue });
  const m = a.m;
  const href = (o: { days?: number; queue?: string | null }) => {
    const u = new URLSearchParams();
    u.set('days', String(o.days ?? a.days));
    const q = o.queue === undefined ? a.queueId : o.queue;
    if (q) u.set('queue', q);
    return `/crm/support/analytics?${u.toString()}`;
  };
  const maxTrend = Math.max(1, ...a.trend.map((d) => Math.max(d.opened, d.resolved)));
  const maxTopic = Math.max(1, ...a.topics.map((t) => t.count));
  const maxReason = Math.max(1, ...m.handovers.map((h) => h.count));
  const backlogMax = Math.max(1, m.backlog.under1d, m.backlog.d1to3, m.backlog.d3to7, m.backlog.over7d);
  const channels = Object.entries(m.byChannel).sort((x, y) => y[1] - x[1]);
  const maxChannel = Math.max(1, ...channels.map(([, n]) => n));

  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <PageHeader hero icon="chart" eyebrow="Support centre" title="Support numbers" back={{ href: '/crm/support', label: 'Support centre' }}
        description={`Requests opened in the last ${a.days} days${a.queueId ? ' for one team' : ''}: speed, targets, Enyo’s share, satisfaction and what people write about.`} />

      <div className="mb-5 flex flex-wrap gap-2">
        {PERIODS.map((d) => (
          <Link key={d} href={href({ days: d })} prefetch={false} aria-current={a.days === d ? 'page' : undefined}
            className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-medium ${a.days === d ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text-muted)]'}`}>
            {d === 365 ? 'Last year' : `Last ${d} days`}
          </Link>
        ))}
        {a.queueId ? <Link href={href({ queue: null })} prefetch={false} className="inline-flex min-h-10 items-center rounded-full border border-[var(--ejo-border)] px-3.5 text-sm text-[var(--ejo-primary)]">All teams</Link> : null}
      </div>

      {m.total === 0 ? (
        <EmptyState icon="chart" title="No requests in this period">Numbers appear as soon as requests come in by email, chat or a colleague.</EmptyState>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile icon="inbox" label="Requests" value={m.total} hint={`${m.open + m.onHold} still open`} />
            <StatTile icon="clock" label="First answer (median)" value={minutesLabel(m.firstResponseMedianMin)} hint={`9 in 10 within ${minutesLabel(m.firstResponseP90Min)}`} />
            <StatTile icon="check-circle" label="First-answer target met" value={pct(m.slaAttainment)} hint={`${m.slaBreached} late`} tone={m.slaAttainment !== null && m.slaAttainment < 0.8 ? 'warning' : 'success'} />
            <StatTile icon="sparkles" label="Resolved by Enyo" value={pct(m.aiResolutionRate)} hint={`${m.aiConfirmed} confirmed · ${m.aiAssumed} no further question · ${m.aiEscalated} needed a person`} />
            <StatTile icon="star" label="Satisfied customers" value={pct(m.csat)} hint={`${m.csatResponses} rating${m.csatResponses === 1 ? '' : 's'} (4 or 5 out of 5)`} />
            <StatTile icon="refund" label="Reopened" value={pct(m.reopenRate)} hint={`Resolution (median) ${minutesLabel(m.resolutionMedianMin)}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard icon="trend-up" title="Opened and resolved, day by day" description="Lagos days.">
              <div className="flex h-40 items-end gap-[3px]" role="img" aria-label={`Requests opened and resolved per day over ${a.trend.length} days`}>
                {a.trend.map((d) => (
                  <div key={d.day} className="flex h-full min-w-0 flex-1 items-end gap-px" title={`${d.day}: ${d.opened} opened, ${d.resolved} resolved`}>
                    <span className="block w-1/2 rounded-t-sm" style={{ height: `${(d.opened / maxTrend) * 100}%`, background: CHART.primary }} />
                    <span className="block w-1/2 rounded-t-sm" style={{ height: `${(d.resolved / maxTrend) * 100}%`, background: CHART.primarySoft }} />
                  </div>
                ))}
              </div>
              <p className="mt-2 flex gap-4 text-xs text-[var(--ejo-text-muted)]">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.primary }} />Opened</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.primarySoft }} />Resolved</span>
              </p>
            </SectionCard>

            <SectionCard icon="list" title="What people write about" description="Enyo’s reading of each request.">
              <div className="space-y-2">{a.topics.map((t) => <BarRow key={t.label} label={t.label} value={t.count} max={maxTopic} note={t.count} labelWidth="11rem" />)}</div>
            </SectionCard>

            <SectionCard icon="user" title="Why a person was needed" description="When Enyo did not answer by itself (several reasons can apply).">
              {m.handovers.length ? <div className="space-y-2">{m.handovers.map((h) => <BarRow key={h.reason} label={h.label} value={h.count} max={maxReason} note={h.count} colour={CHART.warning} labelWidth="14rem" />)}</div> : <p className="text-sm text-[var(--ejo-text-muted)]">Nothing recorded yet.</p>}
            </SectionCard>

            <SectionCard icon="clock" title="Waiting for a solution" description="Open requests by age.">
              <div className="space-y-2">
                <BarRow label="Under a day" value={m.backlog.under1d} max={backlogMax} note={m.backlog.under1d} />
                <BarRow label="1–3 days" value={m.backlog.d1to3} max={backlogMax} note={m.backlog.d1to3} />
                <BarRow label="3–7 days" value={m.backlog.d3to7} max={backlogMax} note={m.backlog.d3to7} colour={CHART.warning} />
                <BarRow label="Over a week" value={m.backlog.over7d} max={backlogMax} note={m.backlog.over7d} colour={CHART.warning} />
              </div>
              <div className="mt-4 space-y-2">
                {channels.map(([c, n]) => <BarRow key={c} label={CHANNEL_LABEL[c] ?? c} value={n} max={maxChannel} note={n} colour={CHART.neutral} />)}
              </div>
            </SectionCard>
          </div>

          <SectionCard icon="layers" title="Teams" className="mt-6" flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead><tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-5 py-2 font-medium">Team</th><th className="px-3 py-2 font-medium">Requests</th><th className="px-3 py-2 font-medium">Open</th><th className="px-3 py-2 font-medium">Target met</th><th className="px-3 py-2 font-medium">Satisfied</th></tr></thead>
                <tbody>{a.queues.map((q) => (
                  <tr key={q.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-5 py-2"><Link href={href({ queue: q.id })} prefetch={false} className="font-medium text-[var(--ejo-primary)] hover:underline">{q.name}</Link></td>
                    <td className="px-3 py-2 tabular-nums">{q.total}</td><td className="px-3 py-2 tabular-nums">{q.open}</td><td className="px-3 py-2 tabular-nums">{pct(q.slaAttainment)}</td><td className="px-3 py-2 tabular-nums">{pct(q.csat)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </SectionCard>

          {a.agents.length ? (
            <SectionCard icon="users" title="People" description="For the people who run the centre. Small numbers say little; satisfaction shows from 3 ratings." className="mt-6" flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead><tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-5 py-2 font-medium">Colleague</th><th className="px-3 py-2 font-medium">Requests</th><th className="px-3 py-2 font-medium">Resolved</th><th className="px-3 py-2 font-medium">First answer (median)</th><th className="px-3 py-2 font-medium">Reopened</th><th className="px-3 py-2 font-medium">Satisfied</th></tr></thead>
                  <tbody>{a.agents.map((p) => (
                    <tr key={p.userId} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-5 py-2 font-medium text-[var(--ejo-text)]">{p.name}</td><td className="px-3 py-2 tabular-nums">{p.handled}</td><td className="px-3 py-2 tabular-nums">{p.resolved}</td>
                      <td className="px-3 py-2 tabular-nums">{minutesLabel(p.firstResponseMedianMin)}</td><td className="px-3 py-2 tabular-nums">{p.reopened}</td><td className="px-3 py-2 tabular-nums">{pct(p.csat)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
