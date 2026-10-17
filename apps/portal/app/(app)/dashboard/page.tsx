import { redirect } from 'next/navigation';
import { prisma } from '@ejo/database';
import { allows } from '@/lib/authz/server';
import { OrgTrail } from '@/components/OrgTrail';
import { getWorkshopDashboardCounts, requireUser } from '@/lib/actions/workshop';
import { getDashboardTrend, getDashboardNotifications, getPlatformGlance } from '@/lib/actions/dashboard';
import { getMyBroadcasts, canBroadcast } from '@/lib/actions/notifications';
import { getMyJobs, getMyNumbers } from '@/lib/actions/my-work';
import { isApproval } from '@/lib/approvals';
import { JOB_STATUS_LABEL, jobTone } from '@/lib/crm';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { BROADCAST_CATEGORY } from '@/lib/notification-rules';
import { DashboardTrendChart } from '@/components/LazyCharts';
import { LoadingLink } from '@/components/LoadingLink';
import { DashboardActivity } from '@/components/DashboardActivity';
import { EnyoBriefCard } from '@/components/enyo/EnyoBriefCard';
import { EmptyState, Icon, PageHeader, SectionCard, StatTile, type IconName, type Tone } from '@/components/ui';
import { ACTION_ICON, CATEGORY_ICON, CATEGORY_TILE } from '@/components/ui/notify-icons';
import { APPROVAL_PERMISSIONS, type PermissionKey } from '@/lib/authz/catalogue';

/** The shortcuts a person sees — only for what they may do. */
const QUICK: { key: PermissionKey; label: string; href: string; icon: IconName }[] = [
  // Customer care (the support department)
  { key: 'support.tickets.manage', label: 'Support centre', href: '/crm/support', icon: 'inbox' },
  { key: 'support.tickets.manage', label: 'Log a call or complaint', href: '/crm/support/new', icon: 'phone' },
  // Leadership
  { key: 'analytics.business.view', label: 'Business analytics', href: '/analytics', icon: 'chart' },
  { key: 'analytics.business.view', label: 'How work flows', href: '/analytics/workflows', icon: 'activity' },
  // IT
  { key: 'admin.users.manage', label: 'People & access', href: '/users', icon: 'users' },
  { key: 'audit.view', label: 'Error log', href: '/audit-logs/errors', icon: 'alert' },
  { key: 'admin.settings.manage', label: 'System health', href: '/settings#health', icon: 'activity' },
  { key: 'workshop.job_card.create', label: 'Open a Job Card', href: '/workshop/job-cards', icon: 'clipboard' },
  { key: 'workshop.job_card.create', label: 'Book a service', href: '/workshop/vehicle-service/book', icon: 'droplet' },
  { key: 'workshop.view', label: 'Vehicles in custody', href: '/workshop/custody', icon: 'garage' },
  { key: 'store.grn.record', label: 'Record goods receipt', href: '/inventory/goods-receipts/new', icon: 'receipt' },
  { key: 'store.view', label: 'Parts catalog', href: '/inventory/parts', icon: 'package' },
  { key: 'warranty.manage', label: 'Start a warranty claim', href: '/warranty/claims/new', icon: 'shield-check' },
  { key: 'security.reception.operate', label: 'Visitors', href: '/security/visitors', icon: 'badge' },
  { key: 'security.exit_pass.request', label: 'Request an exit pass', href: '/security/exit-passes/new', icon: 'exit' },
  { key: 'schedule.view', label: 'New appointment', href: '/schedule/new', icon: 'calendar' },
  { key: 'notifications.broadcast.send', label: 'New broadcast', href: '/notifications/broadcasts/new', icon: 'megaphone' },
  // Everyone: their own help desk and features guide.
  { key: 'security.exit_pass.request', label: 'Get help', href: '/support/help', icon: 'help' },
  { key: 'security.exit_pass.request', label: 'What I can do here', href: '/support/features', icon: 'sparkles' },
];

/** The "at a glance" tiles: an icon per destination; colour only when it means something. */
const GLANCE_ICON: Record<string, IconName> = {
  '/workshop/custody': 'clipboard', '/workshop/vehicle-service-custody': 'droplet', '/workshop/parts-requests': 'package', '/workshop/external-procurement': 'cart',
  '/inventory/goods-receipts': 'receipt', '/warranty/claims': 'shield-check', '/security/on-premises': 'badge', '/security/incidents?tab=open': 'alert',
  '/schedule/appointments?show=today': 'calendar', '/notifications?tab=broadcasts': 'megaphone',
};
const GLANCE_TONE: Record<string, Tone> = { warning: 'warning', error: 'error', muted: 'neutral' };
const TONE_CHIP: Record<string, string> = {
  success: 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]', warning: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]', error: 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)]',
  info: 'bg-[var(--ejo-info)]/12 text-[var(--ejo-info)]', brand: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]', muted: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
};

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * Counts, trends and the "needs your attention" summary. The revenue trend
 * and announcement composer are for Master Admin and Managers only.
 */
export default async function DashboardPage() {
  // What this person works with — the dashboard shows only their areas.
  // A session that just ended (account switched off) goes to sign-in quietly,
  // like the layout does, instead of a render error.
  const me = await requireUser().catch(() => redirect('/signed-out'));
  const [seesWorkshop, seesMoney, quickAllowed, approverFlags, worksJobs] = await Promise.all([
    allows('workshop.view'), allows('analytics.business.view'), Promise.all(QUICK.map((q) => allows(q.key))), Promise.all(APPROVAL_PERMISSIONS.map((k) => allows(k))),
    Promise.all([allows('workshop.job.work'), allows('workshop.job.supervise')]).then((xs) => xs.some(Boolean)),
  ]);
  const approver = approverFlags.some(Boolean);
  const [counts, trend, notifications, myBroadcasts, broadcaster, glance, person, myNumbers, myJobs] = await Promise.all([
    getWorkshopDashboardCounts(),
    getDashboardTrend(),
    getDashboardNotifications(),
    getMyBroadcasts(),
    canBroadcast(),
    getPlatformGlance(),
    prisma.user.findUnique({ where: { id: me.id }, select: { fullName: true } }).catch(() => null),
    getMyNumbers().catch(() => []),
    worksJobs ? getMyJobs().catch(() => []) : Promise.resolve([]),
  ]);
  const approvals = notifications.filter(isApproval);
  // Unique destinations, role-specific first, at most ten.
  const allowedQuick = QUICK.filter((q, i) => quickAllowed[i] && QUICK.findIndex((x) => x.href === q.href) === i);
  const forEveryone = (q: (typeof QUICK)[number]) => q.href === '/support/help' || q.href === '/support/features';
  const quick = [...allowedQuick.filter((q) => !forEveryone(q)).slice(0, 8), ...allowedQuick.filter(forEveryone)];
  const firstName = person?.fullName?.trim().split(/\s+/)[0];
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' }).format(new Date());

  const stats: { label: string; value: number; href: string; icon: IconName }[] = [
    { label: 'Active Job Cards', value: counts.activeJobCards, href: '/workshop/custody', icon: 'clipboard' },
    { label: 'Job Cards in custody', value: counts.inWorkshop, href: '/workshop/custody', icon: 'garage' },
    { label: 'Vehicle Services in custody', value: counts.servicesInWorkshop, href: '/workshop/vehicle-service-custody', icon: 'droplet' },
    { label: 'Total Customers', value: counts.totalCustomers, href: '/workshop/customers', icon: 'users' },
    { label: 'Vehicles registered', value: counts.totalVehicles, href: '/workshop/vehicles', icon: 'car' },
  ];

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        icon="dashboard"
        eyebrow={today}
        title="Dashboard"
        description={<>{greeting()}{firstName ? `, ${firstName}` : ''} — here is what is happening across <OrgTrail upTo="unit" />.</>}
        meta={
          notifications.length > 0 ? (
            <a href="#attention" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ejo-warning)]/15 px-3 py-1 text-xs font-semibold text-[var(--ejo-warning-text)] ring-1 ring-inset ring-[var(--ejo-warning)]/30 hover:bg-[var(--ejo-warning)]/25">
              <Icon name="bolt" size={13} />{notifications.length} {notifications.length === 1 ? 'thing needs' : 'things need'} you
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ejo-success)]/12 px-3 py-1 text-xs font-semibold text-[var(--ejo-success)] ring-1 ring-inset ring-[var(--ejo-success)]/25"><Icon name="check-circle" size={13} />All caught up</span>
          )
        }
      />

      {/* Enyo's brief: what is waiting for this person, with links, to read or to hear. */}
      <EnyoBriefCard userKey={me.id} />

      {seesWorkshop ? (
        <div className="ejo-stagger mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
          {stats.map((s) => <StatTile key={s.label} icon={s.icon} label={s.label} value={s.value} href={s.href} />)}
        </div>
      ) : null}

      {approver || approvals.length ? (
        <LoadingLink href="/approvals" className={`ejo-lift mb-6 flex items-center gap-3 rounded-[var(--ejo-radius-lg)] border p-4 ${approvals.length ? 'border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/8' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${approvals.length ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]' : 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]'}`}><Icon name="check-circle" size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--ejo-text)]">{approvals.length ? `${pluralize(approvals.length, 'decision')} waiting for your approval` : 'Nothing waiting for your approval'}</span>
            <span className="block text-xs text-[var(--ejo-text-muted)]">{approvals.length ? 'Estimates, closes, parts, purchases, claims and passes — oldest first.' : 'Requests that need your decision appear here as soon as they reach you.'}</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-[var(--ejo-primary)]">Open Approvals →</span>
        </LoadingLink>
      ) : null}

      {myNumbers.length ? (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]"><Icon name="user" size={13} />My numbers this month</h2>
          <div className="ejo-stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-label="My numbers">
            {myNumbers.map((t) => (
              <StatTile key={t.label} icon={t.icon as IconName} label={t.label} value={t.value} hint={t.hint} href={t.href} decimals={t.decimals} suffix={t.suffix} tone={t.tone ?? 'brand'} emphasis={t.tone === 'warning'} />
            ))}
          </div>
        </div>
      ) : null}

      {worksJobs ? (
        <SectionCard id="my-jobs" icon="wrench" title={<>My jobs {myJobs.length ? <span className="ml-1 rounded-full bg-[var(--ejo-bg)] px-2 py-0.5 text-xs text-[var(--ejo-text-muted)] ring-1 ring-[var(--ejo-border)]">{myJobs.length}</span> : null}</>} description="Open Job Cards and Vehicle Services where you are the technician or the supervisor." className="mb-6">
          {myJobs.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No open jobs are assigned to you right now.</p> : (
            <ul className="divide-y divide-[var(--ejo-border)]">
              {myJobs.map((j) => (
                <li key={`${j.kind}-${j.id}`}>
                  <LoadingLink href={j.url} className="group flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <span className="font-medium text-[var(--ejo-primary)] group-hover:underline">{j.number}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--ejo-text)]">{j.vehicle}</span>
                    <span className="text-xs text-[var(--ejo-text-muted)]">{j.as} · {formatDateTimeCompact(j.updatedAt)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CHIP[jobTone(j.kind, j.status)] ?? TONE_CHIP.muted}`}>{JOB_STATUS_LABEL[j.kind][j.status] ?? j.status}</span>
                  </LoadingLink>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : null}

      {quick.length ? (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]"><Icon name="bolt" size={13} />Quick actions</h2>
          <div className="ejo-stagger flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {quick.map((q) => (
              <LoadingLink key={q.href} href={q.href} className="ejo-lift ejo-press group inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] py-1.5 pl-1.5 pr-3.5 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50 hover:text-[var(--ejo-primary)]">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)] transition-colors group-hover:bg-[var(--ejo-primary)] group-hover:text-white"><Icon name={q.icon} size={15} /></span>
                {q.label}
              </LoadingLink>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <SectionCard
          id="attention"
          icon="bolt"
          tone={notifications.length ? 'warning' : 'success'}
          title={<>Needs your attention {notifications.length ? <span className="ml-1 rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-xs text-[var(--ejo-warning-text)]">{notifications.length} {notifications.length === 1 ? 'thing' : 'things'}</span> : null}</>}
          description="Each item stays here until it has been dealt with."
          actions={<LoadingLink href="/notifications" className="font-medium text-[var(--ejo-primary)] hover:underline">Open the Notification Center →</LoadingLink>}
        >
          {notifications.length > 0 ? (
            <>
              <div className="ejo-stagger grid gap-2 sm:grid-cols-2">
                {notifications.slice(0, 12).map((n) => (
                  <LoadingLink
                    key={n.id}
                    href={n.url}
                    className="ejo-lift group flex gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 text-sm hover:border-[var(--ejo-primary)]/50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]"><Icon name={ACTION_ICON[n.kind] ?? 'bolt'} size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[var(--ejo-text)]">{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--ejo-text-muted)]">{n.detail}</span>
                      <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ejo-primary)]">Open <span className="transition-transform group-hover:translate-x-0.5"><Icon name="arrow-right" size={12} /></span></span>
                    </span>
                  </LoadingLink>
                ))}
              </div>
              {notifications.length > 12 ? (
                <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">
                  +{notifications.length - 12} more — <LoadingLink href="/notifications" className="text-[var(--ejo-primary)] hover:underline">see them all</LoadingLink>.
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-success)]/8 px-4 py-4">
              <span className="ejo-float flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]"><Icon name="check-circle" size={18} /></span>
              <p className="text-sm font-medium text-[var(--ejo-text)]">Nothing needs your attention right now — you&apos;re all caught up.</p>
            </div>
          )}
        </SectionCard>

        <SectionCard icon="activity" title="What’s new" description="Activity in your areas you haven’t opened yet." actions={<LoadingLink href="/notifications" className="font-medium text-[var(--ejo-primary)] hover:underline">All activity →</LoadingLink>}>
          <DashboardActivity />
        </SectionCard>
      </div>

      {glance.length > 0 ? (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]"><Icon name="globe" size={13} />{seesWorkshop ? 'The whole business at a glance' : 'Your areas at a glance'}</h2>
          <div className="ejo-stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {glance.map((t) => (
              <StatTile key={t.label} icon={GLANCE_ICON[t.href] ?? 'grid'} label={t.label} value={t.value} hint={t.hint} href={t.href} tone={GLANCE_TONE[t.tone] ?? 'brand'} emphasis={t.tone === 'warning' || t.tone === 'error'} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {seesWorkshop ? (
          <SectionCard icon="chart" title={<>{seesMoney ? 'Work opened and money collected' : 'Work opened'} — last 14 working days</>}>
            <DashboardTrendChart data={trend} showRevenue={seesMoney} />
          </SectionCard>
        ) : null}

        <div className={`grid gap-4 ${seesWorkshop ? '' : 'xl:col-span-2 md:grid-cols-2'}`}>
          <SectionCard
            icon="megaphone"
            title="Broadcasts"
            actions={<>
              <LoadingLink href="/notifications?tab=broadcasts" className="text-[var(--ejo-primary)] hover:underline">All for me →</LoadingLink>
              {broadcaster ? <LoadingLink href="/notifications/broadcasts/new" className="font-medium text-[var(--ejo-primary)] hover:underline">+ New broadcast</LoadingLink> : null}
            </>}
          >
            {myBroadcasts.length === 0 ? <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="megaphone" title="No broadcasts running right now." /></div> : (
              <div className="space-y-2">
                {myBroadcasts.slice(0, 4).map((b) => (
                  <LoadingLink key={b.key} href={`/notifications?tab=broadcasts#${b.id}`} className="ejo-lift flex gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 hover:border-[var(--ejo-primary)]/50">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CATEGORY_TILE[b.category] ?? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]'}`}><Icon name={CATEGORY_ICON[b.category] ?? 'megaphone'} size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate text-sm font-medium text-[var(--ejo-text)]">{b.title}</span>{!b.read ? <span className="shrink-0 rounded-full bg-[var(--ejo-primary)] px-1.5 py-px text-[9px] font-bold uppercase text-white">New</span> : null}</span>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{BROADCAST_CATEGORY[b.category]?.label}</span>
                      <span className="block truncate text-xs text-[var(--ejo-text-muted)]">{b.message}</span>
                    </span>
                  </LoadingLink>
                ))}
              </div>
            )}
          </SectionCard>

          <LoadingLink href="/roadmap" className="ejo-hero ejo-lift group relative block overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] p-5 hover:border-[var(--ejo-primary)]/50">
            <div className="ejo-orb pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[var(--ejo-primary)]/20 blur-2xl" aria-hidden="true" />
            <p className="relative flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ejo-warning-text)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-warning)]" />Coming next</p>
            <p className="relative mt-2 text-sm font-semibold text-[var(--ejo-text)]">One platform for the whole enterprise</p>
            <p className="relative mt-1 text-xs text-[var(--ejo-text-muted)]">Workshop is live for <OrgTrail upTo="unit" />. See what the next modules will do →</p>
          </LoadingLink>
        </div>
      </div>
    </div>
  );
}
