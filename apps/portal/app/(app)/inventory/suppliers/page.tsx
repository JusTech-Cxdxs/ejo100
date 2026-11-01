import { guardAnyPage } from '@/lib/authz/server';
import { listSuppliersPage } from '@/lib/actions/suppliers';
import { formatDateOnly } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { LoadingLink } from '@/components/LoadingLink';
import { OrgTrail } from '@/components/OrgTrail';
import { EmptyState, PageHeader, ResponsiveTable } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** The organisation's suppliers (SAP vendors), shared by every branch: who they are and how often the Store receives from them. */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await guardAnyPage(['store.view'], '/inventory/suppliers');
  const { q, page } = await searchParams;
  const data = await listSuppliersPage(q, Number(page) || 1);
  const href = (n: number) => `/inventory/suppliers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) }).toString()}`;
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="truck" back={{ href: '/inventory', label: 'Back to Inventory' }} title="Suppliers" description={<>Shared by every branch. Brought in from SAP through Data Exchange; goods receipts link to them by name. <OrgTrail area="Store" /></>} />
      <form className="mb-6 flex gap-2" action="/inventory/suppliers">
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by name, supplier number or email…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>
      {data.total === 0 ? (
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]">
          <EmptyState compact icon="truck" title={q ? 'No supplier matches.' : 'No suppliers yet.'}>Bring the supplier list in from SAP under <LoadingLink href="/data-exchange" className="font-medium text-[var(--ejo-primary)] hover:underline">Data Exchange</LoadingLink>.</EmptyState>
        </div>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2 text-right">Receipts</th>
                <th className="px-4 py-2">Last received</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((s) => (
                <tr key={s.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className="px-4 py-2"><span className="font-medium text-[var(--ejo-text)]">{s.name}</span>{!s.isActive ? <span className="ml-2 text-xs text-[var(--ejo-text-muted)]">(inactive)</span> : null}{s.address ? <p className="text-xs text-[var(--ejo-text-muted)]">{s.address}</p> : null}</td>
                  <td data-label="Number" className="px-4 py-2 text-[var(--ejo-text-muted)]">{s.externalId ? `${s.externalSource === 'SAP' ? 'SAP ' : ''}${s.externalId}` : '—'}</td>
                  <td data-label="Contact" className="px-4 py-2 text-[var(--ejo-text-muted)]">{[s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || '—'}</td>
                  <td data-label="Receipts" className="px-4 py-2 text-right tabular-nums text-[var(--ejo-text)]">{s.receipts.toLocaleString('en-NG')}</td>
                  <td data-label="Last received" className="px-4 py-2 text-[var(--ejo-text-muted)]">{s.lastReceivedAt ? formatDateOnly(s.lastReceivedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
      {data.total > 0 ? (
        <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--ejo-text-muted)]">
          <span>{data.total.toLocaleString('en-NG')} supplier{data.total === 1 ? '' : 's'}{q ? ` matching “${q}”` : ''}</span>
          {data.pages > 1 ? (
            <span className="flex items-center gap-2">
              {data.page > 1 ? <LoadingLink href={href(data.page - 1)} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 font-medium text-[var(--ejo-text)]">Previous</LoadingLink> : null}
              <span>Page {data.page} of {data.pages}</span>
              {data.page < data.pages ? <LoadingLink href={href(data.page + 1)} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 font-medium text-[var(--ejo-text)]">Next</LoadingLink> : null}
            </span>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
