import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/actions/workshop';
import { currentAssist } from '@/lib/authz/server';
import { getDashboardNotifications } from '@/lib/actions/dashboard';
import { approvalArea, APPROVAL_AREAS, type ApprovalArea } from '@/lib/approvals';
import { LoadingLink } from '@/components/LoadingLink';
import { EmptyState, Icon, PageHeader, SectionCard, type IconName } from '@/components/ui';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { getMyPending } from '@/lib/actions/pending';
import { WaitingOnOthers } from '@/components/WaitingOnOthers';

const AREA_ICON: Record<ApprovalArea, IconName> = { Workshop: 'wrench', Store: 'package', Money: 'money', Warranty: 'shield-check', Security: 'lock', Plant: 'garage' };
const AREA_HINT: Record<ApprovalArea, string> = {
  Workshop: 'Estimates, jobs to supervise, closing and cancelling',
  Store: 'Parts requests',
  Money: 'Outside purchases',
  Warranty: 'Warranties to verify, claims, policy and provider removals',
  Security: 'Exit passes, road tests and contractor passes',
  Plant: 'Kits to release to the line, and pre-delivery inspections to accept or reject',
};

/**
 * Everything waiting for THIS person's decision, in one place. Built from the
 * same live list as the dashboard and the bell, so an item disappears here the
 * moment it is decided. Each item opens the record, where the decision is made
 * (and checked again on the server). Open to everyone signed in: it only ever
 * lists what is waiting for the viewer — and, below, what the viewer asked
 * for that is still waiting on someone else.
 */
export default async function ApprovalsPage() {
  await requireUser().catch(() => redirect('/signed-out'));
  // Nothing is decided during an assisted session, so nothing is listed.
  const assisting = await currentAssist();
  const [notes, waiting] = assisting ? [[], []] : await Promise.all([getDashboardNotifications(), getMyPending().catch(() => [])]);
  const items = notes
    .map((n) => ({ ...n, area: approvalArea(n) }))
    .filter((n): n is typeof n & { area: ApprovalArea } => n.area !== null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const groups = APPROVAL_AREAS.map((area) => ({ area, rows: items.filter((i) => i.area === area) })).filter((g) => g.rows.length > 0);

  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        icon="check-circle"
        title="Approvals"
        description={items.length ? `${pluralize(items.length, 'decision')} waiting for you, oldest first. Open one to approve or decline it.` : 'Everything that needs your decision shows up here.'}
      />
      {groups.length === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <EmptyState icon="check-circle" title="Nothing is waiting for your approval.">
            New requests appear here as soon as they reach you, and you are told by the bell.
          </EmptyState>
        </div>
      ) : (
        <div className="ejo-stagger grid gap-4 xl:grid-cols-2">
          {groups.map((g) => (
            <SectionCard key={g.area} icon={AREA_ICON[g.area]} title={<>{g.area} <span className="ml-1 rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-xs text-[var(--ejo-warning-text)]">{g.rows.length}</span></>} description={AREA_HINT[g.area]}>
              <ul className="divide-y divide-[var(--ejo-border)]" aria-label={`${g.area} approvals`}>
                {g.rows.map((n) => (
                  <li key={n.id}>
                    <LoadingLink href={n.url} className="group flex min-h-12 items-center gap-3 py-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[var(--ejo-text)] group-hover:text-[var(--ejo-primary)]">{n.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--ejo-text-muted)]">{n.detail}{n.detail ? ' · ' : ''}since {formatDateTimeCompact(n.createdAt)}</span>
                      </span>
                      <span className="shrink-0 text-[var(--ejo-primary)] transition-transform group-hover:translate-x-0.5"><Icon name="arrow-right" size={16} /></span>
                    </LoadingLink>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      )}
      <div className="mt-6">
        <WaitingOnOthers items={waiting} />
      </div>
    </div>
  );
}
