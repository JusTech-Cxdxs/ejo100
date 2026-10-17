import { LoadingLink } from '@/components/LoadingLink';
import { EmptyState, Icon, SectionCard } from '@/components/ui';
import type { PendingItem } from '@/lib/actions/pending';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

/**
 * "Waiting on others": what this person asked for that is still with someone
 * else, each naming who it waits on. Shown on the Approvals page (all of it)
 * and the dashboard (the oldest few).
 */
export function WaitingOnOthers({ items, limit, compact = false }: { items: PendingItem[]; limit?: number; compact?: boolean }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <SectionCard
      id="waiting"
      icon="clock"
      title={<>Waiting on others {items.length ? <span className="ml-1 rounded-full bg-[var(--ejo-info)]/12 px-2 py-0.5 text-xs text-[var(--ejo-info)]">{items.length}</span> : null}</>}
      description={compact ? 'What you asked for that is still with someone else, oldest first.' : 'Your requests that are with someone else — who has them and since when. You are told the moment each is decided.'}
      actions={compact && items.length > shown.length ? <LoadingLink href="/approvals#waiting" className="font-medium text-[var(--ejo-primary)] hover:underline">All {items.length} →</LoadingLink> : undefined}
      className="mb-6"
    >
      {shown.length === 0 ? (
        <EmptyState icon="check-circle" title="Nothing of yours is waiting on anyone.">Job Cards, estimates, parts requests, purchases, exit passes and help requests you send appear here until they are decided.</EmptyState>
      ) : (
        <ul className="divide-y divide-[var(--ejo-border)]" aria-label="Waiting on others">
          {shown.map((n) => (
            <li key={n.id}>
              <LoadingLink href={n.url} className="group flex min-h-12 items-center gap-3 py-3 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs text-[var(--ejo-text-muted)]">{n.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-[var(--ejo-text)] group-hover:text-[var(--ejo-primary)]">{n.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--ejo-text-muted)]">With {n.waitingOn} · since {formatDateTimeCompact(n.since)}</span>
                </span>
                <span className="hidden shrink-0 rounded-full bg-[var(--ejo-bg)] px-2 py-0.5 text-xs text-[var(--ejo-text-muted)] ring-1 ring-[var(--ejo-border)] sm:inline">{n.area}</span>
                <span className="shrink-0 text-[var(--ejo-primary)] transition-transform group-hover:translate-x-0.5"><Icon name="arrow-right" size={16} /></span>
              </LoadingLink>
            </li>
          ))}
        </ul>
      )}
      {compact && shown.length ? <p className="sr-only">{pluralize(items.length, 'request')} waiting on others.</p> : null}
    </SectionCard>
  );
}
