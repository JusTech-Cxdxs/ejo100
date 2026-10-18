import { allows, guardAnyPage } from '@/lib/authz/server';
import { getRequisition, getSupplier, searchPartsForSelect, searchProductsForPurchase, searchSuppliersForSelect } from '@/lib/actions/procurement';
import { createPurchaseOrderFormAction } from '@/lib/actions/procurement-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableSelect } from '@/components/SearchableSelect';
import { LineItemsEditor, type LineDraft } from '@/components/procurement/LineItemsEditor';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState } from '@/components/ui';
import { CURRENCIES, INCOTERMS } from '@/lib/procurement-core';
import { Banners, BTN, CARD, INPUT, LABEL, LINK } from '@/components/warehouse/forms';

/** Raise a purchase order, from an approved requisition or from scratch. */
export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ requisition?: string; supplier?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/orders/new');
  const { requisition, supplier, error } = await searchParams;
  const [canManage, req, sup] = await Promise.all([allows('procurement.po.manage'), requisition ? getRequisition(requisition) : Promise.resolve(null), supplier ? getSupplier(supplier) : Promise.resolve(null)]);
  // Plain objects only: the editor is a client component, so its helpers cannot run here.
  const initial: LineDraft[] | undefined = req
    ? req.lines.map((l, i) => ({ key: `req-${i}`, kind: l.part ? 'part' : l.product ? 'product' : 'text', partId: l.part?.id, partLabel: l.part?.name, productId: l.product?.id, productLabel: l.product?.name, description: l.description, quantity: String(Number(l.quantity)), unitCost: l.estimatedUnitCost !== null ? String(Number(l.estimatedUnitCost)) : '' }))
    : undefined;
  const currency = sup?.currency ?? 'USD';
  return (
    <div className="p-8">
      <PageHeader icon="cart" back={req ? { href: `/procurement/requisitions/${req.id}`, label: <>Back to {req.number}</> } : { href: '/procurement/orders', label: 'Back to Purchase orders' }} title="New purchase order" description={req ? <>From requisition {req.number} — {req.reason}</> : 'Choose the supplier, the currency and terms, then the lines.'} />
      <Banners status={undefined} error={error} map={{}} />
      {!canManage ? <EmptyState icon="lock" title="Only Procurement raises purchase orders." /> : req && req.status !== 'APPROVED' ? (
        <EmptyState icon="clipboard" title={`Requisition ${req.number} is ${req.status.toLowerCase()}.`}>Only an approved requisition can be ordered. <LoadingLink href={`/procurement/requisitions/${req.id}`} className={LINK}>Open it</LoadingLink></EmptyState>
      ) : (
        <form action={createPurchaseOrderFormAction} className={`${CARD} relative max-w-5xl space-y-5`}>
          <FormPendingOverlay />
          {req ? <input type="hidden" name="requisitionId" value={req.id} /> : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="po-supplier" className={LABEL}>Supplier</label>
              <div className="mt-1"><SearchableSelect id="po-supplier" name="supplierId" search={searchSuppliersForSelect} loadDefaultOptions={searchSuppliersForSelect.bind(null, '')} defaultOptionsLabel="Suppliers" placeholder="Search suppliers…" required defaultValue={sup?.id} defaultLabel={sup?.name} /></div>
            </div>
            <label className={LABEL}>Currency
              <select name="currency" defaultValue={currency} className={`${INPUT} mt-1`}>{[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </label>
            <label className={LABEL}>Exchange rate (₦ per unit, if not naira)<input name="exchangeRate" type="number" min="0" step="0.0001" className={`${INPUT} mt-1`} placeholder="e.g. 1550" /></label>
            <label className={LABEL}>Incoterms
              <select name="incoterms" defaultValue="" className={`${INPUT} mt-1`}><option value="">—</option>{INCOTERMS.map((i) => <option key={i} value={i}>{i}</option>)}</select>
            </label>
            <label className={LABEL}>Payment terms<input name="paymentTerms" maxLength={200} defaultValue={sup?.paymentTerms ?? ''} className={`${INPUT} mt-1`} placeholder="e.g. 30% deposit, balance before shipment" /></label>
            <label className={LABEL}>Expected date<input name="expectedDate" type="date" className={`${INPUT} mt-1`} /></label>
            <label className={`${LABEL} sm:col-span-2 lg:col-span-4`}>Notes to the supplier<input name="notes" maxLength={1000} className={`${INPUT} mt-1`} placeholder="Packing, labelling, documents required…" /></label>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Lines</p>
            <LineItemsEditor initial={initial} searchParts={searchPartsForSelect} searchProducts={searchProductsForPurchase} costLabel="Unit cost" costRequired currency={currency} />
            <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Costs are in the order&apos;s currency; the total is computed on save. Product lines (finished imports) are received by serial in the Warehouses; part lines in the Components store.</p>
          </div>
          <SubmitButton label="Create purchase order" pendingLabel="Creating…" className={BTN} />
        </form>
      )}
    </div>
  );
}
