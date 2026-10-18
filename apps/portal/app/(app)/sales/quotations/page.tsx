import { allows, guardAnyPage } from '@/lib/authz/server';
import { listQuotations } from '@/lib/actions/sales';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { CustomerLink } from '@/components/CustomerLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { PageHeader, HeaderAction, StatusChip, ResponsiveTable, EmptyState } from '@/components/ui';
import { formatDateOnly } from '@/lib/utils/format-date';
import { naira, QUOTATION_STATUS_LABEL, CHANNEL_LABEL, type QuotationStatus } from '@/lib/sales-core';
import { CHIP, INPUT } from '@/components/sales/ui';

const GROUPS: Record<string, QuotationStatus[]> = {
  open: ['DRAFT', 'PENDING_DISCOUNT_APPROVAL', 'SENT'],
  approval: ['PENDING_DISCOUNT_APPROVAL'],
  accepted: ['ACCEPTED'],
  converted: ['CONVERTED'],
  closed: ['DECLINED', 'EXPIRED', 'CANCELLED'],
};
const GROUP_LABEL: Record<string, string> = { open: 'Open', approval: 'Discount approval', accepted: 'Accepted', converted: 'Converted', closed: 'Declined / expired' };

/** Every quotation in reach, its stage and money. */
export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string; error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { q, group: rawGroup, error } = await searchParams;
  const group = rawGroup && GROUPS[rawGroup] ? rawGroup : null;
  const [quotes, canQuote, canSeeCustomers] = await Promise.all([listQuotations({ q }), allows('sales.quote.manage'), allows('crm.view')]);
  const shown = group ? quotes.filter((x: (typeof quotes)[number]) => GROUPS[group]!.includes(x.status as QuotationStatus)) : quotes;
  const count = (g: string) => quotes.filter((x: (typeof quotes)[number]) => GROUPS[g]!.includes(x.status as QuotationStatus)).length;
  return (
    <div className="p-8">
      <PageHeader icon="file" back={{ href: '/sales', label: 'Back to Sales' }} title="Quotations" description="A quotation prices a configuration for a customer from the price list of their channel. Discounts beyond the officer's 5% go to the Sales Manager (up to 15%) or the Commercial Director." actions={canQuote ? <HeaderAction href="/sales/quotations/new">New quotation</HeaderAction> : null} />
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingLink href={`/sales/quotations${q ? `?q=${encodeURIComponent(q)}` : ''}`} className={CHIP(!group)}>All ({quotes.length})</LoadingLink>
        {Object.keys(GROUPS).map((g) => <LoadingLink key={g} href={`/sales/quotations?group=${g}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={CHIP(group === g)}>{GROUP_LABEL[g]} ({count(g)})</LoadingLink>)}
      </div>
      <form className="mb-4 flex gap-2" action="/sales/quotations">
        {group ? <input type="hidden" name="group" value={group} /> : null}
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by number, customer or product…" className={`${INPUT} max-w-md`} />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>
      {shown.length === 0 ? (
        <EmptyState icon="file" title={quotes.length === 0 ? 'No quotations yet' : 'No quotations in this view'}>{canQuote && quotes.length === 0 ? 'Start with "New quotation".' : null}</EmptyState>
      ) : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-3 py-2">Quotation</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Valid until</th><th className="px-3 py-2">Prepared by</th><th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x: (typeof quotes)[number]) => (
                <tr key={x.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2"><LoadingLink href={`/sales/quotations/${x.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{x.number}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{x._count.lines} {x._count.lines === 1 ? 'line' : 'lines'}{x.salesOrder ? <> · <LoadingLink href={`/sales/orders/${x.salesOrder.id}`} className="hover:underline">{x.salesOrder.number}</LoadingLink></> : null}</div></td>
                  <td data-label="Customer" className="px-3 py-2 text-[var(--ejo-text)]"><CustomerLink id={x.customerId} name={x.customer.fullName} canView={canSeeCustomers} /></td>
                  <td data-label="Channel" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{CHANNEL_LABEL[x.channel] ?? x.channel}</td>
                  <td data-label="Total" className="px-3 py-2 text-right text-[var(--ejo-text)]">{naira(Number(x.total))}</td>
                  <td data-label="Valid until" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{x.validUntil ? formatDateOnly(x.validUntil) : '—'}</td>
                  <td data-label="Prepared by" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{x.preparedBy.fullName}</td>
                  <td data-label="Status" className="px-3 py-2"><StatusChip status={x.status} label={QUOTATION_STATUS_LABEL[x.status as QuotationStatus]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
