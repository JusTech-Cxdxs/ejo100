import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { getSupportInbox } from '@/lib/actions/support';
import { PageHeader, SectionCard, EmptyState, StatusChip, Icon, type Tone } from '@/components/ui';
import { formatDateTimeCompact, formatRelative } from '@/lib/utils/format-date';
import type { SupportStatus } from '@/lib/support-rules';

export const metadata = { title: 'Support inbox' };
export const dynamic = 'force-dynamic';

const TONE: Record<SupportStatus, Tone> = { OPEN: 'info', WAITING_ON_CUSTOMER: 'warning', RESOLVED: 'success', CLOSED: 'neutral' };

const TABS: { key: 'open' | 'waiting' | 'mine' | 'resolved' | 'all'; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'waiting', label: 'Waiting on customer' },
  { key: 'mine', label: 'Mine' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const EMPTY: Record<string, string> = {
  open: 'Nobody is waiting for an answer. New hand-overs from Enyo appear here.',
  waiting: 'No tickets are waiting for a customer’s reply.',
  mine: 'No open tickets are assigned to you.',
  resolved: 'No resolved tickets yet.',
  all: 'No support tickets yet.',
};

/**
 * Customers and website visitors handed over by Enyo, oldest waiting first.
 * Fenced to the organisation and the person's branch reach (website enquiries
 * without a branch are the whole organisation's).
 */
export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  await guardPage('support.tickets.manage', '/crm/support');
  const sp = await searchParams;
  const inbox = await getSupportInbox({ filter: sp.filter, q: sp.q });
  const q = (sp.q ?? '').slice(0, 60);
  const href = (filter: string) => `/crm/support?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const count = (k: string) => (k in inbox.counts ? inbox.counts[k as keyof typeof inbox.counts] : null);
  const now = new Date();

  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader
        icon="inbox"
        title="Support inbox"
        back={{ href: '/crm', label: 'Customers' }}
        description="Customers and website visitors who asked Enyo for a person. Reply here: the answer is emailed to them and shows in their customer portal."
      />

      <nav aria-label="Support tickets" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const active = inbox.filter === t.key;
          const n = count(t.key);
          return (
            <Link
              key={t.key}
              href={href(t.key)}
              prefetch={false}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${active ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`}
            >
              {t.label}
              {n !== null ? <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-[var(--ejo-primary)] text-white' : 'bg-[var(--ejo-bg)]'}`}>{n}</span> : null}
            </Link>
          );
        })}
      </nav>

      <form action="/crm/support" method="get" role="search" className="mb-4 flex gap-2">
        <input type="hidden" name="filter" value={inbox.filter} />
        <label htmlFor="support-q" className="sr-only">Search tickets</label>
        <input id="support-q" name="q" defaultValue={q} maxLength={60} placeholder="Search by SUP number, name, phone or topic" className="min-h-11 w-full min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 text-sm font-medium text-[var(--ejo-text)]"><Icon name="search" size={16} /> Search</button>
      </form>

      <SectionCard icon="inbox" title={TABS.find((t) => t.key === inbox.filter)?.label ?? 'Tickets'} description={`${inbox.rows.length === 1 ? '1 ticket' : `${inbox.rows.length} tickets`}${inbox.filter === 'resolved' ? ', most recent first' : ', oldest waiting first'}`} flush>
        {inbox.rows.length ? (
          <ul className="divide-y divide-[var(--ejo-border)]" data-testid="support-inbox">
            {inbox.rows.map((r) => (
              <li key={r.id}>
                <Link href={`/crm/support/${r.id}`} prefetch={false} className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-[var(--ejo-bg)] sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="whitespace-nowrap font-semibold text-[var(--ejo-text)]">{r.number}</span>
                      <span className="text-[var(--ejo-text-muted)]">·</span>
                      <span className="break-words font-medium text-[var(--ejo-text)]">{r.contactName}</span>
                      {r.status === 'OPEN' && r.lastFromCustomer ? <span className="rounded-full bg-[var(--ejo-warning)]/15 px-2 py-px text-[11px] font-semibold text-[var(--ejo-warning-text,var(--ejo-warning))]">Needs a reply</span> : null}
                    </p>
                    <p className="mt-0.5 break-words text-sm text-[var(--ejo-text-muted)]">{r.subject}</p>
                    <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                      {r.channel === 'WEBSITE' ? 'Website' : 'Customer portal'}
                      {r.branchName ? ` · ${r.branchName}` : ''}
                      {' · '}opened <time dateTime={r.createdAt.toISOString()} title={formatDateTimeCompact(r.createdAt)}>{formatRelative(r.createdAt, now)}</time>
                      {r.firstResponse ? ` · first reply after ${r.firstResponse}` : ''}
                      {' · '}{r.assignedTo ? (r.mine ? 'assigned to you' : `assigned to ${r.assignedTo}`) : 'not assigned'}
                    </p>
                  </div>
                  <StatusChip tone={TONE[r.status]} label={r.statusLabel} className="self-start sm:self-center" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="inbox" title={q ? 'No tickets match your search' : 'Nothing here'} compact>{q ? 'Try a SUP number, a name or a phone number.' : EMPTY[inbox.filter]}</EmptyState>
        )}
      </SectionCard>
    </div>
  );
}
