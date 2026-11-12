import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { listDataRequests } from '@/lib/actions/data-requests';
import { KIND_LABEL, STATUS_LABEL, VIA_LABEL, type Via } from '@/lib/privacy/requests';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { EmptyState, PageHeader, SectionCard, StatusChip } from '@/components/ui';

export const dynamic = 'force-dynamic';

const FILTERS = { open: 'Open', closed: 'Closed', all: 'All' } as const;

/** A4c1 — customers' data requests (NDPA 2023): open ones oldest first, with how long each has waited. */
export default async function DataRequestsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await guardPage('privacy.requests.manage', '/data-requests');
  const { show } = await searchParams;
  const filter = (show && show in FILTERS ? show : 'open') as keyof typeof FILTERS;
  const rows = await listDataRequests(filter);
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="lock" title="Data requests"
        description="A customer may ask what the business holds about them — a copy they can take elsewhere — or for it to be corrected, erased, or no longer used (Nigeria Data Protection Act 2023). Record each request the day it arrives; a colleague confirms who is asking; then answer it and close it with what was done."
        actions={<Link href="/data-requests/new" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90">Record a request</Link>} />
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Show">
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
          <Link key={f} href={f === 'open' ? '/data-requests' : `/data-requests?show=${f}`} aria-current={f === filter ? 'page' : undefined}
            className={`rounded-full px-3 py-1 ${f === filter ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]'}`}>{FILTERS[f]}</Link>
        ))}
      </nav>
      <SectionCard icon="inbox" title={`${FILTERS[filter]} requests`} description={filter === 'open' ? 'Oldest first: answer each without undue delay, within the time your organisation’s data protection policy sets.' : undefined}>
        {rows.length === 0 ? <EmptyState compact icon="inbox" title={filter === 'open' ? 'No open requests.' : 'No requests here.'} /> : (
          <ul className="divide-y divide-[var(--ejo-border)]" data-testid="data-requests">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="data-request-row">
                <div className="min-w-0">
                  <Link href={`/data-requests/${r.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</Link>
                  <span className="ml-2 text-sm text-[var(--ejo-text)]">{r.customer?.name ?? 'A customer no longer in the records'}</span>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">{KIND_LABEL[r.kind]?.label ?? r.kind} · {VIA_LABEL[r.receivedVia as Via] ?? r.receivedVia} · received {formatDateTimeCompact(r.receivedAt).split(',')[0]}{(r.status === 'RECEIVED' || r.status === 'VERIFIED') ? ` · waiting ${r.days} ${r.days === 1 ? 'day' : 'days'}` : ''}</span>
                </div>
                <StatusChip label={STATUS_LABEL[r.status]?.label ?? r.status} tone={STATUS_LABEL[r.status]?.tone ?? 'neutral'} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
