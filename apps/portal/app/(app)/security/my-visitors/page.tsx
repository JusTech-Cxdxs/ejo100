import { listMyVisits } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { VISIT_STATUS_LABEL, durationText, minutesBetween } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { EmptyState, Icon, PageHeader, SectionCard, StatusChip, type IconName } from '@/components/ui';

type Visit = Awaited<ReturnType<typeof listMyVisits>>['expected'][number];

function VisitList({ visits, when }: { visits: Visit[]; when: (v: Visit) => string }) {
  return (
    <ul className="divide-y divide-[var(--ejo-border)]">
      {visits.map((v) => (
        <li key={v.id}>
          <LoadingLink href={`/security/visitors/${v.id}`} className="flex min-h-14 items-start justify-between gap-3 py-3 text-sm">
            <span className="min-w-0">
              <span className="block font-medium text-[var(--ejo-primary)]">
                {v.visitorName}
                {v.partySize > 1 ? <span className="ml-2 whitespace-nowrap text-xs font-normal text-[var(--ejo-text-muted)]">+ {pluralize(v.partySize - 1, 'other')}</span> : null}
              </span>
              <span className="block break-words text-xs text-[var(--ejo-text-muted)]">{v.company ? `${v.company} · ` : ''}{v.purpose}</span>
              <span className="block text-xs text-[var(--ejo-text-muted)]">{when(v)}</span>
            </span>
            <StatusChip status={v.status} label={v.status === 'CHECKED_IN' && v.receivedAt ? 'At reception' : VISIT_STATUS_LABEL[v.status]} className="shrink-0" />
          </LoadingLink>
        </li>
      ))}
    </ul>
  );
}

function Section({ icon, title, description, count, empty, children }: { icon: IconName; title: string; description: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <SectionCard icon={icon} title={<>{title} <span className="ml-1 rounded-full bg-[var(--ejo-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--ejo-text-muted)] ring-1 ring-[var(--ejo-border)]">{count}</span></>} description={description}>
      {count === 0 ? <p className="flex items-center gap-2 py-1 text-sm text-[var(--ejo-text-muted)]"><Icon name="check" size={14} />{empty}</p> : children}
    </SectionCard>
  );
}

/**
 * The visitors who came, or are coming, to see the signed-in person.
 * Read-only: bookings are made by the front desk or Security.
 */
export default async function MyVisitorsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ expected, onSite, recent }, { status }] = await Promise.all([listMyVisits(), searchParams]);
  const none = expected.length + onSite.length + recent.length === 0;
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="badge" title="My visitors" description="People who are coming to see you, are on site now, or came in the last 90 days." />
      <SecurityNav active="/security/my-visitors" />
      {status === 'booking_cancelled' ? <div className="mb-6 max-w-3xl"><FormFeedbackBanner kind="success" message="Visit cancelled. Security and the front desk have been told." /></div> : null}
      <div className="mb-6 flex max-w-3xl items-start gap-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-4 text-sm text-[var(--ejo-text)]" role="note">
        <span className="mt-0.5 shrink-0 text-[var(--ejo-info)]"><Icon name="info" size={18} /></span>
        <p><span className="font-semibold">Expecting someone?</span> Ask the front desk or Security to register them. You will be told when they arrive.</p>
      </div>
      {none ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <EmptyState icon="badge" title="No visitors yet">When the front desk or Security registers someone to see you, they appear here.</EmptyState>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section icon="walk" title="On site now" description="Signed in at the gate and not yet gone." count={onSite.length} empty="Nobody is here to see you right now.">
            <VisitList visits={onSite} when={(v) => `Arrived ${formatDateTimeCompact(v.checkedInAt!)} · expected stay ${durationText(v.expectedDurationMinutes + v.extendedMinutes)}`} />
          </Section>
          <Section icon="calendar" title="Expected" description="Booked by the front desk or Security." count={expected.length} empty="No visitors booked for you.">
            <VisitList visits={expected} when={(v) => (v.expectedAt ? `Expected ${formatDateTimeCompact(v.expectedAt)}` : 'Expected')} />
          </Section>
          <div className="lg:col-span-2">
            <Section icon="history" title="Recent" description="The last 90 days." count={recent.length} empty="No visitors in the last 90 days.">
              <VisitList
                visits={recent}
                when={(v) => {
                  const stayed = minutesBetween(v.checkedInAt, v.checkedOutAt);
                  return `${v.checkedInAt ? formatDateTimeCompact(v.checkedInAt) : ''}${stayed !== null ? ` · stayed ${durationText(stayed)}` : ''}`;
                }}
              />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
