import { allows, guardAnyPage } from '@/lib/authz/server';
import { getPurchaseOrder, getSupplier, searchSuppliersForSelect } from '@/lib/actions/procurement';
import { createSupplierClaimFormAction } from '@/lib/actions/procurement-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableSelect } from '@/components/SearchableSelect';
import { PageHeader, EmptyState } from '@/components/ui';
import { CURRENCIES } from '@/lib/procurement-core';
import { Banners, BTN, CARD, INPUT, LABEL } from '@/components/warehouse/forms';

/** Raise a claim against a supplier, optionally from a purchase order (its supplier and currency come along). */
export default async function NewSupplierClaimPage({ searchParams }: { searchParams: Promise<{ order?: string; supplier?: string; receipt?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/claims/new');
  const { order, supplier, receipt, error } = await searchParams;
  const [canManage, po, sup] = await Promise.all([allows('procurement.po.manage'), order ? getPurchaseOrder(order) : Promise.resolve(null), supplier ? getSupplier(supplier) : Promise.resolve(null)]);
  const chosen = po ? { id: po.supplier.id, name: po.supplier.name, currency: po.currency } : sup ? { id: sup.id, name: sup.name, currency: sup.currency } : null;
  const currency = chosen?.currency ?? 'USD';
  return (
    <div className="p-8">
      <PageHeader icon="alert" back={po ? { href: `/procurement/orders/${po.id}`, label: <>Back to {po.number}</> } : { href: '/procurement/claims', label: 'Back to Supplier claims' }} title="New supplier claim" description={po ? <>Against {po.supplier.name} on {po.number}.</> : 'A shortage, damage or a component failure to charge back to the supplier.'} />
      <Banners status={undefined} error={error} map={{}} />
      {!canManage ? <EmptyState icon="lock" title="Only Procurement raises supplier claims." /> : (
        <form action={createSupplierClaimFormAction} className={`${CARD} relative max-w-3xl space-y-4`}>
          <FormPendingOverlay />
          {po ? <input type="hidden" name="purchaseOrderId" value={po.id} /> : null}
          {receipt ? <input type="hidden" name="goodsReceiptId" value={receipt} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="claim-supplier" className={LABEL}>Supplier</label>
              <div className="mt-1"><SearchableSelect id="claim-supplier" name="supplierId" search={searchSuppliersForSelect} loadDefaultOptions={searchSuppliersForSelect.bind(null, '')} defaultOptionsLabel="Suppliers" placeholder="Search suppliers…" required defaultValue={chosen?.id} defaultLabel={chosen?.name} /></div>
            </div>
            <label className={LABEL}>Amount claimed<input name="amount" type="number" min="0" step="0.01" required className={`${INPUT} mt-1`} /></label>
            <label className={LABEL}>Currency<select name="currency" defaultValue={currency} className={`${INPUT} mt-1`}>{[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <label className={`${LABEL} sm:col-span-2`}>What happened<textarea name="description" required minLength={5} maxLength={2000} rows={4} className={`${INPUT} mt-1`} placeholder="e.g. 12 of 200 motherboards failed incoming QC (no POST); GRN-2026-000031, sample 30, 2 defects" /></label>
            <label className={LABEL}>Warranty claim reference (optional)<input name="warrantyClaimId" maxLength={64} className={`${INPUT} mt-1`} placeholder="Warranty claim id, if a component failed in the field" /></label>
          </div>
          <SubmitButton label="Raise claim" pendingLabel="Raising…" className={BTN} />
        </form>
      )}
    </div>
  );
}
