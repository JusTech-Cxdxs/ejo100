import { getBroadcastAnalytics } from '@/lib/actions/notifications';
import { LoadingLink } from '@/components/LoadingLink';
import { BROADCAST_CATEGORY } from '@/lib/notification-rules';
import { pluralize } from '@/lib/utils/pluralize';

const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
const AUDIENCE: Record<string, string> = { ALL: 'Everyone', BRANCH: 'Branches', DEPARTMENT: 'Departments', ROLE: 'Roles' };
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

export default async function BroadcastAnalyticsPage() {
  const a = await getBroadcastAnalytics();
  const t = a.totals;
  const maxCat = Math.max(1, ...a.byCategory.map((c) => c.count));
  const maxMonth = Math.max(1, ...a.months.map((m) => m.count));
  const Kpi = ({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) => {
    const inner = (<><p className="text-xs text-[var(--ejo-text-muted)]">{label}</p><p className="mt-1 text-2xl font-bold text-[var(--ejo-text)]">{value}</p>{hint ? <p className="mt-1 text-[10px] text-[var(--ejo-text-muted)]">{hint}</p> : null}</>);
    return href ? <LoadingLink href={href} className={`${card} block hover:border-[var(--ejo-primary)]`}>{inner}</LoadingLink> : <div className={card}>{inner}</div>;
  };
  const Row = ({ b }: { b: (typeof a.best)[number] }) => (
    <LoadingLink href={`/notifications/broadcasts/${b.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:bg-[var(--ejo-bg)]">
      <span className="min-w-0 truncate">{BROADCAST_CATEGORY[b.category]?.icon} {b.title}</span>
      <span className="shrink-0 text-xs text-[var(--ejo-text-muted)]">{b.read} of {b.reach} · {pct(b.readRate)}</span>
    </LoadingLink>
  );
  return (
    <div className="w-full p-4 sm:p-8">
      <LoadingLink href="/notifications/broadcasts" className="mb-2 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Broadcasts</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Broadcast analytics</h1>
      <p className="mb-6 mt-1 text-sm text-[var(--ejo-text-muted)]">Last 12 months — how many broadcasts went out, who they reached, who read them and how email delivery went.</p>

      {a.actions.length ? (
        <div className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">What to do now</h2>
          {a.actions.map((x, i) => (
            <LoadingLink key={i} href={x.href} className={`flex items-start gap-3 ${card} hover:border-[var(--ejo-primary)]`}>
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${x.priority === 1 ? 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]' : x.priority === 2 ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' : 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]'}`}>P{x.priority}</span>
              <span><span className="block text-sm font-medium text-[var(--ejo-text)]">{x.title}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{x.detail}</span></span>
            </LoadingLink>
          ))}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Broadcasts" value={t.total} href="/notifications/broadcasts?tab=all" />
        <Kpi label="Live now" value={t.live} href="/notifications/broadcasts?tab=live" />
        <Kpi label="Scheduled" value={t.scheduled} href="/notifications/broadcasts?tab=scheduled" />
        <Kpi label="Ended" value={t.ended} href="/notifications/broadcasts?tab=ended" />
        <Kpi label="Stopped early" value={t.stopped} href="/notifications/broadcasts?tab=ended" />
        <Kpi label="People reached" value={t.reach} hint="Across broadcasts that have started" />
        <Kpi label="Reads" value={t.read} />
        <Kpi label="Read rate" value={pct(t.readRate)} hint="Reads ÷ people reached" />
        <Kpi label="Emails sent" value={t.emailsSent} hint={t.emailsFailed ? `${pluralize(t.emailsFailed, 'failure')}` : 'No failures'} />
        <Kpi label="Email delivery rate" value={pct(t.deliveryRate)} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">By kind</h2>
          <div className="space-y-2">
            {a.byCategory.map((c) => {
              const m = BROADCAST_CATEGORY[c.category]!;
              return (
                <LoadingLink key={c.category} href={`/notifications/broadcasts?tab=all&category=${c.category}`} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs hover:opacity-80">
                  <span className="truncate text-[var(--ejo-text)]">{m.icon} {m.label}</span>
                  <div className="h-3 rounded bg-[var(--ejo-bg)]"><div className={`h-3 rounded border-l-4 ${m.bar} bg-[var(--ejo-primary)]/60`} style={{ width: `${(c.count / maxCat) * 100}%` }} /></div>
                  <span className="text-[var(--ejo-text-muted)]">{c.count} · read {pct(c.readRate)}</span>
                </LoadingLink>
              );
            })}
          </div>
        </div>
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">Published per month</h2>
          <div className="flex h-40 items-end gap-2">
            {a.months.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-[var(--ejo-text-muted)]">{m.count}</span>
                <div className="w-full rounded-t bg-[var(--ejo-primary)]" style={{ height: `${Math.max(2, (m.count / maxMonth) * 120)}px` }} />
                <span className="text-[10px] text-[var(--ejo-text-muted)]">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--ejo-border)] pt-3 text-xs text-[var(--ejo-text-muted)]">
            {a.byAudience.map((x) => <span key={x.audience}>{AUDIENCE[x.audience]}: <span className="font-medium text-[var(--ejo-text)]">{x.count}</span></span>)}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={card}><h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Best read</h2>{a.best.length ? <div className="divide-y divide-[var(--ejo-border)]">{a.best.map((b) => <Row key={b.id} b={b} />)}</div> : <p className="text-sm text-[var(--ejo-text-muted)]">No broadcasts have run yet.</p>}</div>
        <div className={card}><h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Least read</h2>{a.worst.length ? <div className="divide-y divide-[var(--ejo-border)]">{a.worst.map((b) => <Row key={b.id} b={b} />)}</div> : <p className="text-sm text-[var(--ejo-text-muted)]">No broadcasts have run yet.</p>}</div>
      </div>
    </div>
  );
}
