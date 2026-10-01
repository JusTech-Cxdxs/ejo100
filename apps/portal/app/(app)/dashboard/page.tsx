import { getWorkshopDashboardCounts, currentUserIsMasterAdmin, currentUserId, listEligibleManagersForBranch } from '@/lib/actions/workshop';
import { getDashboardTrend, getDashboardNotifications } from '@/lib/actions/dashboard';
import { getMyBroadcasts, canBroadcast } from '@/lib/actions/notifications';
import { BROADCAST_CATEGORY } from '@/lib/notification-rules';
import { DashboardTrendChart } from '@/components/DashboardTrendChart';
import { LoadingLink } from '@/components/LoadingLink';
import { prisma } from '@ejo/database';

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
  const userId = await currentUserId();
  const [isMasterAdmin, user] = await Promise.all([
    currentUserIsMasterAdmin(),
    prisma.user.findUnique({ where: { id: userId }, select: { branchId: true, organisationId: true } }),
  ]);

  let isManager = isMasterAdmin;
  if (!isMasterAdmin && user?.branchId) {
    const managers = await listEligibleManagersForBranch(user.branchId).catch(() => ({ supervisors: [] as { id: string }[] }));
    isManager = managers.supervisors.some((m) => m.id === userId);
  }

  const [counts, trend, notifications, myBroadcasts, broadcaster] = await Promise.all([
    getWorkshopDashboardCounts(),
    getDashboardTrend(),
    getDashboardNotifications(),
    getMyBroadcasts(),
    canBroadcast(),
  ]);

  const stats = [
    { label: 'Active Job Cards', value: counts.activeJobCards, href: '/workshop/custody' },
    { label: 'Total In Custody', value: counts.inWorkshop, href: '/workshop/custody' },
    { label: 'Total Customers', value: counts.totalCustomers, href: '/workshop/customers' },
    { label: 'Total Vehicles Registered', value: counts.totalVehicles, href: '/workshop/vehicles' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
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
      </div>

      {notifications.length > 0 ? (
        <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Needs Your Attention</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
            Click any item to open it and take care of it.
          </p>
          <div className="mt-3 space-y-2">
            {notifications.slice(0, 6).map((n) => (
              <LoadingLink
                key={n.id}
                href={n.url}
                className="flex items-center justify-between rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-surface)] px-3 py-2.5 text-sm hover:opacity-80"
              >
                <div>
                  <p className="font-medium text-[var(--ejo-text)]">{n.title}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{n.detail}</p>
                </div>
              </LoadingLink>
            ))}
            {notifications.length > 6 ? (
              <p className="text-xs text-[var(--ejo-text-muted)]">
                +{notifications.length - 6} more — open the notification bell above to see the full list.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-5">
          <p className="text-sm font-medium text-[var(--ejo-text)]">Nothing needs your attention right now — you&apos;re all caught up.</p>
        </div>
      )}

      <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">
          {isManager ? 'Job Cards & Revenue' : 'Job Cards'} — Last 14 Working Days
        </h2>
        <div className="mt-3">
          <DashboardTrendChart data={trend} showRevenue={isManager} />
        </div>
      </div>

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
          Workshop is live for Kewalram Nigeria — Automobile Division. Additional business units
          activate here as they&apos;re approved, with no change to this dashboard&apos;s structure.
        </p>
      </div>
    </div>
  );
}
