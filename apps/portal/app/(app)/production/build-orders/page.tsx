import { allows, guardAnyPage } from '@/lib/authz/server';
import { listBuildOrders } from '@/lib/actions/production';
import { BUILD_STATUS_LABEL, type BuildOrderStatusCode } from '@/lib/production-core';
import { formatDateOnly } from '@/lib/utils/format-date';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { EmptyState, HeaderAction, PageHeader, ResponsiveTable, StatusChip } from '@/components/ui';
import { chipLink, tableHead, tableRow, tableWrap, td, th } from '@/components/production/styles';

const FILTERS: { key: string; label: string }[] = [
  { key: 'open', label: 'Open' }, { key: 'PLANNED', label: 'Planned' }, { key: 'MATERIALS_CHECKED', label: 'Materials checked' }, { key: 'RELEASED', label: 'Released' },
  { key: 'IN_PROGRESS', label: 'In progress' }, { key: 'ON_HOLD', label: 'On hold' }, { key: 'COMPLETED', label: 'Completed' }, { key: 'CLOSED', label: 'Closed' }, { key: 'CANCELLED', label: 'Cancelled' }, { key: 'all', label: 'All' },
];

export default async function BuildOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; purpose?: string; error?: string }> }) {
  await guardAnyPage(['production.view'], '/production/build-orders');
  const { q, status: rawStatus, purpose, error } = await searchParams;
  const status = rawStatus && FILTERS.some((f) => f.key === rawStatus) ? rawStatus : 'open';
  const [rows, canPlan] = await Promise.all([listBuildOrders({ q, status: status === 'all' ? undefined : status, purpose }), allows('production.build_order.manage')]);
  const link = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, purpose, ...patch })) if (v) params.set(k, v);
    return `/production/build-orders?${params.toString()}`;
  };
  const chip = (active: boolean) => `${chipLink} ${active ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]'}`;
  const today = new Date();
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="clipboard" title="Build orders" back={{ href: '/production', label: 'Back to Production' }} description="What the line has been asked to build, and how far each order has come." actions={canPlan ? <HeaderAction href="/production/build-orders/new">New build order</HeaderAction> : undefined} />
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => <LoadingLink key={f.key} href={link({ status: f.key })} className={chip(status === f.key)} aria-current={status === f.key ? 'true' : undefined}>{f.label}</LoadingLink>)}
        <span className="mx-1 self-center text-[var(--ejo-border)]">|</span>
        <LoadingLink href={link({ purpose: purpose === 'TO_STOCK' ? undefined : 'TO_STOCK' })} className={chip(purpose === 'TO_STOCK')}>To stock</LoadingLink>
        <LoadingLink href={link({ purpose: purpose === 'FOR_ORDER' ? undefined : 'FOR_ORDER' })} className={chip(purpose === 'FOR_ORDER')}>For an order</LoadingLink>
      </div>
      <form className="mb-4 flex gap-2" action="/production/build-orders">
        <input type="hidden" name="status" value={status} />
        {purpose ? <input type="hidden" name="purpose" value={purpose} /> : null}
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by number, product or configuration…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>

      {rows.length === 0 ? (
        <div className={`${tableWrap} border-dashed`}><EmptyState icon="clipboard" title="No build orders in this view">{canPlan ? 'Plan one from a configuration in the catalogue.' : 'Nothing here yet.'}</EmptyState></div>
      ) : (
        <ResponsiveTable className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHead}>
                <th className={th}>Build order</th><th className={th}>Configuration</th><th className={`${th} text-right`}>Quantity</th><th className={th}>Purpose</th><th className={th}>Due</th><th className={th}>Planned by</th><th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b: (typeof rows)[number]) => {
                const overdue = b.dueDate && b.dueDate < today && !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(b.status);
                return (
                  <tr key={b.id} className={tableRow}>
                    <td className={td}>
                      <LoadingLink href={`/production/build-orders/${b.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{b.number}</LoadingLink>
                      <div className="text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(b.createdAt)} · priority {b.priority}</div>
                    </td>
                    <td data-label="Configuration" className={td}>{b.configuration.product.name} — {b.configuration.name}<div className="font-mono text-xs text-[var(--ejo-text-muted)]">{b.configuration.product.sku}-{b.configuration.code}</div></td>
                    <td data-label="Quantity" className={`${td} text-right tabular-nums`}>{b.quantity}<div className="text-xs text-[var(--ejo-text-muted)]">{b._count.units} started</div></td>
                    <td data-label="Purpose" className={td}>{b.purpose === 'TO_STOCK' ? 'To stock' : 'For an order'}</td>
                    <td data-label="Due" className={`${td} ${overdue ? 'text-[var(--ejo-error)]' : ''}`}>{b.dueDate ? formatDateOnly(b.dueDate) : '—'}</td>
                    <td data-label="Planned by" className={td}>{b.plannedBy.fullName}</td>
                    <td data-label="Status" className={td}><StatusChip status={b.status} label={BUILD_STATUS_LABEL[b.status as BuildOrderStatusCode]} />{b.shortageNote ? <div className="mt-1 text-xs text-[var(--ejo-warning-text)]">shortages noted</div> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
