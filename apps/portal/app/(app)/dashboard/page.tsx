import { allows } from '@/lib/authz/server';
import { OrgTrail } from '@/components/OrgTrail';
import { getWorkshopDashboardCounts } from '@/lib/actions/workshop';
import { getDashboardTrend, getDashboardNotifications, getPlatformGlance } from '@/lib/actions/dashboard';
import { getMyBroadcasts, canBroadcast } from '@/lib/actions/notifications';
import { BROADCAST_CATEGORY } from '@/lib/notification-rules';
import { DashboardTrendChart } from '@/components/DashboardTrendChart';
import { LoadingLink } from '@/components/LoadingLink';

/**
 * Real counts, real trend, and a real "needs your attention" summary
 * — no hardcoded numbers, no filler chart data. The revenue trend and
 * the announcement composer are only ever shown to Master Admin or a
 * real eligible Manager, matching how every other management-level
 * view already works in this system — everyone else still gets the
 * real Job Cards trend and the same real attention summary, since
 * those are genuinely everyone's business, not just management's.
 */
export default async function DashboardPage() {
  // What this person works with — the dashboard shows only their areas.
  const [seesWorkshop, seesMoney] = await Promise.all([allows('workshop.view'), allows('analytics.business.view')]);
  const [counts, trend, notifications, myBroadcasts, broadcaster, glance] = await Promise.all([
    getWorkshopDashboardCounts(),
    getDashboardTrend(),
    getDashboardNotifications(),
    getMyBroadcasts(),
    canBroadcast(),
    getPlatformGlance(),
  ]);

  const stats = [
    { label: 'Active Job Cards', value: counts.activeJobCards, href: '/workshop/custody' },
    { label: 'Job Cards in custody', value: counts.inWorkshop, href: '/workshop/custody' },
    { label: 'Vehicle Services in custody', value: counts.servicesInWorkshop, href: '/workshop/vehicle-service-custody' },
    { label: 'Total Customers', value: counts.totalCustomers, href: '/workshop/customers' },
    { label: 'Total Vehicles Registered', value: counts.totalVehicles, href: '/workshop/vehicles' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
        <OrgTrail />
      </p>

      {seesWorkshop ? <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s) => (
          <LoadingLink
            key={s.label}
            href={s.href}
            className="block rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 hover:border-[var(--ejo-primary)]/50"
          >
            <p className="text-2xl font-bold text-[var(--ejo-primary)]">{s.value}</p>
            <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{s.label}</p>
          </LoadingLink>
        ))}
      </div> : null}

      {notifications.length > 0 ? (
        <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Needs your attention <span className="ml-1 rounded-full bg-[var(--ejo-warning)]/20 px-2 py-0.5 text-xs text-[var(--ejo-warning)]">{notifications.length} {notifications.length === 1 ? 'thing' : 'things'}</span></h2>
            <LoadingLink href="/notifications" className="text-xs text-[var(--ejo-primary)] hover:underline">Open the Notification Center →</LoadingLink>
          </div>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Each one stays here until it is done — open it to take care of it.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {notifications.slice(0, 12).map((n) => (
              <LoadingLink
                key={n.id}
                href={n.url}
                className="group flex flex-col justify-between rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-surface)] px-3 py-2.5 text-sm hover:border-[var(--ejo-primary)]"
              >
                <span>
                  <span className="block font-medium text-[var(--ejo-text)]">{n.title}</span>
                  <span className="mt-0.5 block text-xs text-[var(--ejo-text-muted)]">{n.detail}</span>
                </span>
                <span className="mt-2 text-[11px] font-medium text-[var(--ejo-primary)] group-hover:underline">Open →</span>
              </LoadingLink>
            ))}
          </div>
          {notifications.length > 12 ? (
            <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
              +{notifications.length - 12} more — <LoadingLink href="/notifications" className="text-[var(--ejo-primary)] hover:underline">see them all</LoadingLink>.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-5">
          <p className="text-sm font-medium text-[var(--ejo-text)]">Nothing needs your attention right now — you&apos;re all caught up.</p>
        </div>
      )}

      {glance.length > 0 ? <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">{seesWorkshop ? 'The whole business at a glance' : 'Your areas at a glance'}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {glance.map((t) => (
            <LoadingLink key={t.label} href={t.href} className="group rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 hover:border-[var(--ejo-primary)]">
              <span className={`mb-2 block h-1 w-8 rounded-full ${t.tone === 'primary' ? 'bg-[var(--ejo-primary)]' : t.tone === 'info' ? 'bg-[var(--ejo-info)]' : t.tone === 'warning' ? 'bg-[var(--ejo-warning)]' : t.tone === 'error' ? 'bg-[var(--ejo-error)]' : t.tone === 'success' ? 'bg-[var(--ejo-success)]' : 'bg-[var(--ejo-border)]'}`} />
              <p className="text-2xl font-bold text-[var(--ejo-text)]">{t.value}</p>
              <p className="text-xs font-medium text-[var(--ejo-text)]">{t.label}</p>
              <p className="text-[10px] text-[var(--ejo-text-muted)] group-hover:text-[var(--ejo-primary)]">{t.hint} →</p>
            </LoadingLink>
          ))}
        </div>
      </div> : null}

      {seesWorkshop ? <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">
          {seesMoney ? 'Work opened and money collected' : 'Work opened'} — last 14 working days
        </h2>
        <div className="mt-3">
          <DashboardTrendChart data={trend} showRevenue={seesMoney} />
        </div>
      </div> : null}

      <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Broadcasts</h2>
          <span className="flex flex-wrap gap-3 text-xs">
            <LoadingLink href="/notifications?tab=broadcasts" className="text-[var(--ejo-primary)] hover:underline">All for me →</LoadingLink>
            {broadcaster ? <LoadingLink href="/notifications/broadcasts/new" className="font-medium text-[var(--ejo-primary)] hover:underline">+ New broadcast</LoadingLink> : null}
          </span>
        </div>
        {myBroadcasts.length === 0 ? <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">No broadcasts running right now.</p> : (
          <div className="mt-3 space-y-2">
            {myBroadcasts.slice(0, 4).map((b) => (
              <LoadingLink key={b.key} href={`/notifications?tab=broadcasts#${b.id}`} className={`block rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] border-l-4 ${BROADCAST_CATEGORY[b.category]!.bar} bg-[var(--ejo-bg)] px-3 py-2 hover:border-[var(--ejo-primary)]`}>
                <span className="text-sm font-medium text-[var(--ejo-text)]">{BROADCAST_CATEGORY[b.category]!.icon} {b.title}</span>{!b.read ? <span className="ml-2 text-[10px] font-semibold text-[var(--ejo-primary)]">New</span> : null}
                <span className="block truncate text-xs text-[var(--ejo-text-muted)]">{b.message}</span>
              </LoadingLink>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Modules</h2>
        <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
          Workshop is live for <OrgTrail upTo="unit" />. Additional business units
          activate here as they&apos;re approved, with no change to this dashboard&apos;s structure.
        </p>
      </div>
    </div>
  );
}
