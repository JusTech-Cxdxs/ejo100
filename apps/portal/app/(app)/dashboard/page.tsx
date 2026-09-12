import { getWorkshopDashboardCounts, currentUserIsMasterAdmin, currentUserId, listEligibleManagersForBranch } from '@/lib/actions/workshop';
import { getDashboardTrend, getNeedsAttentionSummary, listActiveAnnouncements } from '@/lib/actions/dashboard';
import { createAnnouncementFormAction, deactivateAnnouncementFormAction } from '@/lib/actions/dashboard-form-handlers';
import { DashboardTrendChart } from '@/components/DashboardTrendChart';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
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
  const isMasterAdmin = await currentUserIsMasterAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { branchId: true, organisationId: true } });

  let isManager = isMasterAdmin;
  if (!isMasterAdmin && user?.branchId) {
    const managers = await listEligibleManagersForBranch(user.branchId).catch(() => ({ supervisors: [] as { id: string }[] }));
    isManager = managers.supervisors.some((m) => m.id === userId);
  }

  const [counts, trend, attention, announcements] = await Promise.all([
    getWorkshopDashboardCounts(),
    getDashboardTrend(),
    getNeedsAttentionSummary(),
    user?.organisationId ? listActiveAnnouncements(user.organisationId) : Promise.resolve([]),
  ]);

  const stats = [
    { label: 'Active Job Cards', value: counts.activeJobCards },
    { label: 'Total In Custody', value: counts.inWorkshop },
    { label: 'Total Customers', value: counts.totalCustomers },
    { label: 'Total Vehicles Registered', value: counts.totalVehicles },
  ];

  const attentionItems = [
    { label: 'Open Pricing Alerts', value: attention.openPricingAlerts, href: '/inventory/pricing', show: isManager },
    { label: 'Pending Approvals', value: attention.pendingApprovals, href: '/workshop/job-cards', show: true },
    { label: 'Pending Assignments', value: attention.pendingAssignments, href: '/workshop/job-cards', show: true },
  ].filter((i) => i.show);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Dashboard</h1>
      <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Workshop
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <p className="text-2xl font-bold text-[var(--ejo-primary)]">{s.value}</p>
            <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{s.label}</p>
          </div>
        ))}
      </div>

      {attentionItems.some((i) => i.value > 0) ? (
        <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Needs Your Attention</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {attentionItems
              .filter((i) => i.value > 0)
              .map((i) => (
                <LoadingLink
                  key={i.label}
                  href={i.href}
                  className="flex items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-surface)] px-3 py-2 text-sm hover:opacity-80"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ejo-warning)] text-xs font-bold text-white">{i.value}</span>
                  <span className="text-[var(--ejo-text)]">{i.label}</span>
                </LoadingLink>
              ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-5">
          <p className="text-sm font-medium text-[var(--ejo-text)]">Nothing genuinely needs your attention right now — you&apos;re all caught up.</p>
        </div>
      )}

      <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">
          {isManager ? 'Job Cards & Revenue' : 'Job Cards'} — Last 14 Days
        </h2>
        <div className="mt-3">
          <DashboardTrendChart data={trend} showRevenue={isManager} />
        </div>
      </div>

      {isManager ? (
        <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Post an Announcement</h2>
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Shown to everyone in the scrolling bar at the top of every real page.</p>
          <form action={createAnnouncementFormAction} className="mt-3 flex flex-wrap items-end gap-2">
            <FormPendingOverlay />
            <div className="flex-1" style={{ minWidth: '240px' }}>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Message</label>
              <input name="message" required placeholder="e.g. Warehouse closed for stock count this Friday" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Expires (optional)</label>
              <input name="expiresAt" type="date" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
            <SubmitButton label="Post" pendingLabel="Posting…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
          </form>

          {announcements.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-[var(--ejo-border)] pt-4">
              {announcements.map((a: (typeof announcements)[number]) => (
                <div key={a.id} className="flex items-center justify-between rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm">
                  <div>
                    <p className="text-[var(--ejo-text)]">{a.message}</p>
                    <p className="text-[10px] text-[var(--ejo-text-muted)]">— {a.createdBy.fullName}</p>
                  </div>
                  <form action={deactivateAnnouncementFormAction}>
                    <input type="hidden" name="announcementId" value={a.id} />
                    <button type="submit" className="text-xs text-[var(--ejo-error)] hover:underline">Remove</button>
                  </form>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
