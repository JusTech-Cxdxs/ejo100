import { guardPage } from '@/lib/authz/server';
import { getBroadcastAnalytics } from '@/lib/actions/notifications';
import { LoadingLink } from '@/components/LoadingLink';
import { BROADCAST_CATEGORY } from '@/lib/notification-rules';
import { pluralize } from '@/lib/utils/pluralize';
import { PageHeader, StatTile, PriorityActions, BarRow, EmptyState, Icon, type IconName } from '@/components/ui';
import { CATEGORY_ICON } from '@/components/ui/notify-icons';

const card = 'min-w-0 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5';
const AUDIENCE: Record<string, string> = { ALL: 'Everyone', BRANCH: 'Branches', DEPARTMENT: 'Departments', ROLE: 'Roles' };
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);

export default async function BroadcastAnalyticsPage() {
  await guardPage('notifications.broadcast.send', '/notifications/broadcasts/analytics');
  const a = await getBroadcastAnalytics();
  const t = a.totals;
  const maxCat = Math.max(1, ...a.byCategory.map((c) => c.count));
  const maxMonth = Math.max(1, ...a.months.map((m) => m.count));
  const Kpi = ({ label, value, hint, href, icon = 'megaphone' }: { label: string; value: string | number; hint?: string; href?: string; icon?: IconName }) => (
    <StatTile icon={icon} label={label} value={value} hint={hint} href={href} />
  );
  const T = ({ icon, children }: { icon: IconName; children: React.ReactNode }) => (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ejo-text)]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={icon} size={15} /></span>{children}</h2>
  );
  const Row = ({ b }: { b: (typeof a.best)[number] }) => (
    <LoadingLink href={`/notifications/broadcasts/${b.id}`} className="flex items-center justify-between gap-2 rounded-[var(--ejo-radius-md)] px-1 py-2 text-sm transition-colors hover:bg-[var(--ejo-bg)]">
      <span className="flex min-w-0 items-center gap-2"><span className="shrink-0 text-[var(--ejo-primary)]"><Icon name={CATEGORY_ICON[b.category] ?? 'megaphone'} size={15} /></span><span className="truncate">{b.title}</span></span>
      <span className="shrink-0 text-xs text-[var(--ejo-text-muted)]">{b.read} of {b.reach} · {pct(b.readRate)}</span>
    </LoadingLink>
  );
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        back={{ href: '/notifications/broadcasts', label: 'Broadcasts' }}
        icon="chart"
        eyebrow="Analytics · Broadcasts"
        title="Broadcast analytics"
        description="Last 12 months (monthly chart: last 6) — how many broadcasts went out, who they reached, who read them and how email delivery went."
      />

      <PriorityActions actions={a.actions} note={null} />

      <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi icon="megaphone" label="Broadcasts" value={t.total} href="/notifications/broadcasts?tab=all" />
        <Kpi icon="activity" label="Live now" value={t.live} href="/notifications/broadcasts?tab=live" />
        <Kpi icon="calendar" label="Scheduled" value={t.scheduled} href="/notifications/broadcasts?tab=scheduled" />
        <Kpi icon="check-circle" label="Ended" value={t.ended} href="/notifications/broadcasts?tab=ended" />
        <Kpi icon="close" label="Stopped early" value={t.stopped} href="/notifications/broadcasts?tab=ended" />
        <Kpi icon="users" label="People reached" value={t.reach} hint="Across broadcasts that have started" />
        <Kpi icon="eye" label="Reads" value={t.read} />
        <Kpi icon="percent" label="Read rate" value={pct(t.readRate)} hint="Reads ÷ people reached" />
        <Kpi icon="mail" label="Emails sent" value={t.emailsSent} hint={t.emailsFailed ? `${pluralize(t.emailsFailed, 'failure')}` : 'No failures'} />
        <Kpi icon="check" label="Email delivery rate" value={pct(t.deliveryRate)} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <T icon="pie">By kind</T>
          <div className="space-y-2">
            {a.byCategory.map((c) => {
              const m = BROADCAST_CATEGORY[c.category]!;
              return (
                <LoadingLink key={c.category} href={`/notifications/broadcasts?tab=all&category=${c.category}`} className="block rounded-[var(--ejo-radius-md)] transition-opacity hover:opacity-80">
                  <BarRow label={<span className="inline-flex items-center gap-1.5"><Icon name={CATEGORY_ICON[c.category] ?? 'megaphone'} size={13} />{m.label}</span>} value={c.count} max={maxCat} note={`${c.count} · read ${pct(c.readRate)}`} />
                </LoadingLink>
              );
            })}
          </div>
        </div>
        <div className={card}>
          <T icon="bars">Published per month</T>
          <div className="flex h-40 items-end gap-2">
            {a.months.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-[var(--ejo-text-muted)]">{m.count}</span>
                <div className="ejo-grow-up w-full rounded-t-md bg-gradient-to-t from-[var(--ejo-primary)] to-[var(--ejo-accent)]" style={{ height: `${Math.max(2, (m.count / maxMonth) * 120)}px` }} />
                <span className="text-[10px] text-[var(--ejo-text-muted)]">{m.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 border-t border-[var(--ejo-border)] pt-3 text-xs text-[var(--ejo-text-muted)]">
            {a.byAudience.map((x) => <span key={x.audience}>{AUDIENCE[x.audience]}: <span className="font-medium text-[var(--ejo-text)]">{x.count}</span></span>)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}><T icon="star">Best read</T>{a.best.length ? <div className="divide-y divide-[var(--ejo-border)]">{a.best.map((b) => <Row key={b.id} b={b} />)}</div> : <EmptyState compact icon="megaphone" title="No broadcasts have run yet." />}</div>
        <div className={card}><T icon="trend-down">Least read</T>{a.worst.length ? <div className="divide-y divide-[var(--ejo-border)]">{a.worst.map((b) => <Row key={b.id} b={b} />)}</div> : <EmptyState compact icon="megaphone" title="No broadcasts have run yet." />}</div>
      </div>
    </div>
  );
}
