import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { getSupportInbox } from '@/lib/actions/support';
import { getMySupportAway } from '@/lib/actions/support-admin';
import { setMySupportAwayAction } from '@/lib/actions/support-form-handlers';
import { PageHeader, SectionCard, EmptyState, StatusChip, Icon, StatTile, HeaderAction, type Tone } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { formatDateTimeCompact, formatRelative } from '@/lib/utils/format-date';
import { SUPPORT_FILTER_LABEL, type SupportFilter, type SupportStatus } from '@/lib/support-rules';
import { CHANNEL_LABEL, PRIORITIES, PRIORITY_LABEL, type Priority } from '@/lib/support/core';

export const metadata = { title: 'Support centre' };
export const dynamic = 'force-dynamic';

const TONE: Record<SupportStatus, Tone> = { OPEN: 'info', WAITING_ON_CUSTOMER: 'warning', ON_HOLD: 'neutral', RESOLVED: 'success', CLOSED: 'neutral' };
const PRIORITY_TONE: Record<Priority, string> = {
  URGENT: 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)] ring-[var(--ejo-error)]/30',
  HIGH: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)] ring-[var(--ejo-warning)]/30',
  NORMAL: 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)] ring-[var(--ejo-border)]',
  LOW: 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)] ring-[var(--ejo-border)]',
};

const TABS: SupportFilter[] = ['open', 'unassigned', 'mine', 'late', 'waiting', 'on_hold', 'resolved', 'all'];

const EMPTY: Record<SupportFilter, string> = {
  open: 'Nobody is waiting for an answer. New emails to the support addresses and hand-overs from Enyo appear here.',
  unassigned: 'Every open request has someone looking after it.',
  mine: 'No open requests are assigned to you.',
  late: 'Nothing is late or due within the hour.',
  waiting: 'No requests are waiting for a customer’s reply.',
  on_hold: 'Nothing is on hold.',
  resolved: 'No resolved requests yet.',
  all: 'No support requests yet.',
};

/**
 * The Support centre: every support request in one place — emails to the
 * support addresses (support@, warranty@ …), hand-overs from Enyo in chat,
 * and requests colleagues open from a call. Late and urgent first. Fenced to
 * the organisation and the person's branch reach.
 */
export default async function SupportCentrePage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string; queue?: string; priority?: string; status?: string; error?: string }> }) {
  await guardPage('support.tickets.manage', '/crm/support');
  const sp = await searchParams;
  const [inbox, away] = await Promise.all([getSupportInbox({ filter: sp.filter, q: sp.q, queue: sp.queue, priority: sp.priority }), getMySupportAway()]);
  const q = (sp.q ?? '').slice(0, 60);
  const params = (o: Record<string, string | null | undefined>) => {
    const u = new URLSearchParams();
    const merged = { filter: inbox.filter, q: q || null, queue: inbox.queueId, priority: sp.priority ?? null, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/crm/support?${u.toString()}`;
  };
  const now = new Date();

  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <PageHeader
        hero
        icon="inbox"
        eyebrow="Customers"
        title="Support centre"
        back={{ href: '/crm', label: 'Customers' }}
        description="Every support request in one place: emails to your support addresses, hand-overs from Enyo, and calls colleagues log. Late and urgent first. Replies go out from the team’s own address and show in the customer’s portal."
        actions={<>
          <HeaderAction href="/crm/support/new" icon="plus">New request</HeaderAction>
          <HeaderAction href="/crm/support/analytics" icon="chart" variant="secondary">Numbers</HeaderAction>
          <HeaderAction href="/crm/support/enyo" icon="sparkles" variant="secondary">Enyo’s replies</HeaderAction>
          {inbox.canManage ? <HeaderAction href="/settings/support" icon="settings" variant="secondary">Set up</HeaderAction> : null}
        </>}
      />

      {sp.error ? <p role="alert" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/10 px-4 py-3 text-sm text-[var(--ejo-error)]">{sp.error.slice(0, 300)}</p> : null}
      {sp.status === 'away' || sp.status === 'back' ? <p role="status" className="mb-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/10 px-4 py-3 text-sm text-[var(--ejo-success)]">{sp.status === 'away' ? 'You are marked away: no new requests come to you until you are back.' : 'Welcome back: new requests come to you again.'}</p> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile icon="inbox" label="Open" value={inbox.counts.open} href={params({ filter: 'open' })} />
        <StatTile icon="user-plus" label="Unassigned" value={inbox.counts.unassigned} href={params({ filter: 'unassigned' })} tone={inbox.counts.unassigned ? 'warning' : 'brand'} />
        <StatTile icon="clock" label="Late or due within the hour" value={inbox.counts.late} href={params({ filter: 'late' })} tone={inbox.counts.late ? 'error' : 'brand'} emphasis={inbox.counts.late > 0} />
        <StatTile icon="mail" label="Waiting on customers" value={inbox.counts.waiting} href={params({ filter: 'waiting' })} />
        <StatTile icon="user" label="Mine" value={inbox.counts.mine} href={params({ filter: 'mine' })} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <nav aria-label="Teams" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-2">
            <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Teams</p>
            <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
              {[{ id: '', name: 'All teams', open: inbox.queues.reduce((n, x) => n + x.open, 0) }, ...inbox.queues].map((x) => {
                const on = (inbox.queueId ?? '') === x.id;
                return (
                  <li key={x.id || 'all'} className="shrink-0">
                    <Link href={params({ queue: x.id || null })} prefetch={false} aria-current={on ? 'page' : undefined}
                      className={`flex min-h-10 items-center justify-between gap-3 rounded-[var(--ejo-radius-md)] px-3 text-sm ${on ? 'bg-[var(--ejo-primary)]/10 font-semibold text-[var(--ejo-primary)]' : 'text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]'}`}>
                      <span className="truncate">{x.name}</span>
                      <span className="rounded-full bg-[var(--ejo-bg)] px-1.5 text-xs tabular-nums text-[var(--ejo-text-muted)]">{x.open}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {away.member ? (
            <form action={setMySupportAwayAction} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3">
              <input type="hidden" name="away" value={away.away ? '0' : '1'} />
              <p className="text-sm font-medium text-[var(--ejo-text)]">{away.away ? 'You are away' : 'You are taking requests'}</p>
              <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">{away.away ? 'New requests go to colleagues who are in.' : 'New requests are shared among the team, the least busy first.'}</p>
              <SubmitButton label={away.away ? 'I am back' : 'Mark me away'} pendingLabel="Saving…" className="mt-2 min-h-10 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50" />
            </form>
          ) : null}
        </aside>

        <div className="min-w-0">
          <nav aria-label="Support views" className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1">
            {TABS.map((key) => {
              const active = inbox.filter === key;
              const n = key in inbox.counts ? inbox.counts[key as keyof typeof inbox.counts] : null;
              return (
                <Link key={key} href={params({ filter: key })} prefetch={false} aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors ${active ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`}>
                  {SUPPORT_FILTER_LABEL[key]}
                  {n !== null ? <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-[var(--ejo-primary)] text-white' : 'bg-[var(--ejo-bg)]'}`}>{n}</span> : null}
                </Link>
              );
            })}
          </nav>

          <form action="/crm/support" method="get" role="search" className="mb-4 flex flex-wrap gap-2">
            <input type="hidden" name="filter" value={inbox.filter} />
            {inbox.queueId ? <input type="hidden" name="queue" value={inbox.queueId} /> : null}
            <label htmlFor="support-q" className="sr-only">Search requests</label>
            <input id="support-q" name="q" defaultValue={q} maxLength={60} placeholder="Search by SUP number, name, phone, email or topic" className="min-h-11 min-w-0 flex-1 basis-60 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]" />
            <label htmlFor="support-priority" className="sr-only">Priority</label>
            <select id="support-priority" name="priority" defaultValue={sp.priority ?? ''} className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]">
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
            <button type="submit" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 text-sm font-medium text-[var(--ejo-text)]"><Icon name="search" size={16} /> Search</button>
          </form>

          <SectionCard icon="inbox" title={SUPPORT_FILTER_LABEL[inbox.filter]} description={`${inbox.rows.length === 1 ? '1 request' : `${inbox.rows.length} requests`}${inbox.filter === 'resolved' ? ', most recent first' : ', urgent and late first'}`} flush>
            {inbox.rows.length ? (
              <ul className="divide-y divide-[var(--ejo-border)]" data-testid="support-inbox">
                {inbox.rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/crm/support/${r.id}`} prefetch={false} className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-[var(--ejo-bg)] sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          {r.priority !== 'NORMAL' ? <span className={`rounded-full px-2 py-px text-[11px] font-semibold ring-1 ring-inset ${PRIORITY_TONE[r.priority]}`}>{PRIORITY_LABEL[r.priority]}</span> : null}
                          <span className="whitespace-nowrap font-semibold text-[var(--ejo-text)]">{r.number}</span>
                          <span className="text-[var(--ejo-text-muted)]">·</span>
                          <span className="break-words font-medium text-[var(--ejo-text)]">{r.contactName}</span>
                          {r.status === 'OPEN' && r.lastFromCustomer ? <span className="rounded-full bg-[var(--ejo-warning)]/15 px-2 py-px text-[11px] font-semibold text-[var(--ejo-warning-text)]">Needs a reply</span> : null}
                          {r.due ? <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${r.sla === 'breached' ? 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)]' : r.sla === 'due_soon' ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]' : 'bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)]'}`}>{r.due}</span> : null}
                          {r.aiOutcome === 'ANSWERED' || r.aiOutcome === 'CONFIRMED' || r.aiOutcome === 'ASSUMED' ? <span className="rounded-full bg-[var(--ejo-primary)]/10 px-2 py-px text-[11px] font-semibold text-[var(--ejo-primary)]">Answered by Enyo</span> : null}
                          {r.sentiment === 'negative' ? <span className="rounded-full bg-[var(--ejo-error)]/10 px-2 py-px text-[11px] font-medium text-[var(--ejo-error)]">Upset</span> : null}
                        </p>
                        <p className="mt-0.5 break-words text-sm text-[var(--ejo-text-muted)]">{r.subject}</p>
                        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                          {CHANNEL_LABEL[r.channel] ?? r.channel}
                          {r.queueName ? ` · ${r.queueName}` : ''}
                          {r.topic ? ` · ${r.topic}` : ''}
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
              <EmptyState icon="inbox" title={q ? 'No requests match your search' : 'Nothing here'} compact>{q ? 'Try a SUP number, a name, a phone number or an email address.' : EMPTY[inbox.filter]}</EmptyState>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
