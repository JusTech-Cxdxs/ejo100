import { guardAnyPage } from '@/lib/authz/server';
import { getServiceLedgerSummary } from '@/lib/actions/service';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, StatTile, SectionCard, ResponsiveTable, EmptyState } from '@/components/ui';
import { COST_CENTRES, COST_CENTRE_LABEL, costCentreCarriedByZinox, type WarrantyCostCentre } from '@/lib/service-core';
import { formatDateOnly } from '@/lib/utils/format-date';
import { formatCurrency } from '@ejo/utils';

/** The warranty ledger: what warranty cases cost, by cost centre, this month and this year. */
export default async function ServiceLedgerPage() {
  await guardAnyPage(['warranty.claim.approve', 'service.manage'], '/service');
  const ledger = await getServiceLedgerSummary();
  const year = ledger.yearStart.getFullYear();
  const monthName = ledger.monthStart.toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
  const carried = (t: typeof ledger.month) => COST_CENTRES.filter(costCentreCarriedByZinox).reduce((s, c) => s + t.byCostCentre[c], 0);
  return (
    <div className="p-8">
      <PageHeader
        icon="money"
        back={{ href: '/service', label: 'Back to Service Centre' }}
        title="Warranty ledger"
        description="Every warranty case charged to the department that carries it: production defects, component failures (recovered from the supplier), transit damage, user damage (the customer pays) and goodwill. Entries are recorded on each service job."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="money" label={`${monthName}`} value={formatCurrency(ledger.month.total, 'NGN')} hint={`${ledger.month.count} ${ledger.month.count === 1 ? 'entry' : 'entries'}`} tone="brand" />
        <StatTile icon="money" label={`Year to date ${year}`} value={formatCurrency(ledger.year.total, 'NGN')} hint={`${ledger.year.count} ${ledger.year.count === 1 ? 'entry' : 'entries'}`} tone="info" />
        <StatTile icon="building" label="Carried by Zinox this year" value={formatCurrency(carried(ledger.year), 'NGN')} hint="all cost centres except user damage" tone="warning" />
        <StatTile icon="truck" label="To recover from suppliers" value={formatCurrency(ledger.year.byCostCentre.COMPONENT_SUPPLIER, 'NGN')} hint="component failures this year — raise supplier claims" tone={ledger.year.byCostCentre.COMPONENT_SUPPLIER ? 'error' : 'neutral'} />
      </div>

      <SectionCard icon="pie" title="By cost centre" description="This month and the year so far." className="mb-6">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-[var(--ejo-text-muted)]"><th className="py-1">Cost centre</th><th className="py-1 text-right">{monthName}</th><th className="py-1 text-right">{year}</th></tr></thead>
          <tbody>
            {COST_CENTRES.map((c: WarrantyCostCentre) => (
              <tr key={c} className="border-t border-[var(--ejo-border)]"><td className="py-1.5 text-[var(--ejo-text)]">{COST_CENTRE_LABEL[c]}</td><td className="py-1.5 text-right text-[var(--ejo-text)]">{formatCurrency(ledger.month.byCostCentre[c], 'NGN')}</td><td className="py-1.5 text-right text-[var(--ejo-text)]">{formatCurrency(ledger.year.byCostCentre[c], 'NGN')}</td></tr>
            ))}
            <tr className="border-t border-[var(--ejo-border)] font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{formatCurrency(ledger.month.total, 'NGN')}</td><td className="py-1.5 text-right">{formatCurrency(ledger.year.total, 'NGN')}</td></tr>
          </tbody>
        </table>
      </SectionCard>

      <SectionCard icon="list" title="Latest entries" flush>
        {ledger.entries.length === 0 ? (
          <div className="p-4"><EmptyState icon="money" title="No ledger entries this year" compact>Entries are recorded on a service job once its cost centre is decided.</EmptyState></div>
        ) : (
          <ResponsiveTable>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Service job</th><th className="px-3 py-2">Cost centre</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Note</th><th className="px-3 py-2">By</th></tr></thead>
              <tbody>
                {ledger.entries.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(e.recordedAt)}</td>
                    <td data-label="Service job" className="px-3 py-2"><LoadingLink href={`/service/jobs/${e.serviceJob.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{e.serviceJob.number}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{e.serviceJob.productName} · {e.serviceJob.serialNumber}</div></td>
                    <td data-label="Cost centre" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{COST_CENTRE_LABEL[e.costCentre as WarrantyCostCentre]}</td>
                    <td data-label="Amount" className="px-3 py-2 text-right text-[var(--ejo-text)]">{formatCurrency(e.amount, 'NGN')}</td>
                    <td data-label="Note" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{e.note ?? '—'}</td>
                    <td data-label="By" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{e.recordedByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </SectionCard>
    </div>
  );
}
