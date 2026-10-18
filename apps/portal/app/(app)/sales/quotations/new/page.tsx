import { allows, guardAnyPage } from '@/lib/authz/server';
import { searchSalesCustomerOptions, listRecentSalesCustomerOptions } from '@/lib/actions/sales';
import { searchQuotationProductOptions } from '@/lib/actions/pricing';
import { createQuotationFormAction } from '@/lib/actions/sales-form-handlers';
import { QuotationEditor } from '@/components/sales/QuotationEditor';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { PageHeader } from '@/components/ui';
import { QUOTATION_VALID_DAYS } from '@/lib/sales-core';
import { INPUT, LABEL, BTN } from '@/components/sales/ui';

/** A new quotation: the customer, then lines priced from the active list of their channel. Saved as a draft. */
export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { error } = await searchParams;
  const canQuote = await allows('sales.quote.manage');
  const validUntil = new Date(Date.now() + QUOTATION_VALID_DAYS * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return (
    <div className="p-8">
      <PageHeader icon="file" back={{ href: '/sales/quotations', label: 'Back to Quotations' }} title="New quotation" description={`Choose the customer, then the products: the unit price comes from the active price list of their channel (dealer tier). Totals include 7.5% VAT. Valid for ${QUOTATION_VALID_DAYS} days unless you say otherwise.`} />
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {!canQuote ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">Only sales staff (sales officers, showroom officers, key account managers and the Sales Manager) prepare quotations.</p>
      ) : (
        <form action={createQuotationFormAction} className="max-w-4xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <QuotationEditor searchCustomers={searchSalesCustomerOptions} loadRecentCustomers={listRecentSalesCustomerOptions} searchProducts={searchQuotationProductOptions} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="validUntil" className={LABEL}>Valid until</label><input id="validUntil" name="validUntil" type="date" defaultValue={validUntil} className={INPUT} /></div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between"><label htmlFor="quotation-notes" className={LABEL}>Notes for the customer (delivery, software, warranty)</label><RefineTextButton targetId="quotation-notes" /></div>
              <textarea id="quotation-notes" name="notes" rows={3} className={INPUT} placeholder="Delivery within 5 working days of payment; Windows 11 Pro pre-installed; 12-month warranty." />
            </div>
          </div>
          <SubmitButton label="Save draft quotation" pendingLabel="Saving…" className={BTN} />
        </form>
      )}
    </div>
  );
}
