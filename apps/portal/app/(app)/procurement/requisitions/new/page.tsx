import { allows, guardAnyPage } from '@/lib/authz/server';
import { searchPartsForSelect, searchProductsForPurchase } from '@/lib/actions/procurement';
import { createRequisitionFormAction } from '@/lib/actions/procurement-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { LineItemsEditor } from '@/components/procurement/LineItemsEditor';
import { PageHeader, EmptyState } from '@/components/ui';
import { Banners, BTN, BTN_LINE, CARD, INPUT, LABEL } from '@/components/warehouse/forms';

/** Raise a requisition: the parts or products needed, how many, the estimated cost, why and by when. */
export default async function NewRequisitionPage({ searchParams }: { searchParams: Promise<{ error?: string; buildOrder?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/requisitions/new');
  const { error, buildOrder } = await searchParams;
  const canRaise = await allows('procurement.requisition.raise');
  return (
    <div className="p-8">
      <PageHeader icon="clipboard" back={{ href: '/procurement/requisitions', label: 'Back to Requisitions' }} title="New purchase requisition" description="Save it as a draft to come back to, or submit it straight to the Head of Procurement." />
      <Banners status={undefined} error={error} map={{}} />
      {!canRaise ? <EmptyState icon="lock" title="Planning, the warehouses and Procurement raise requisitions." /> : (
        <form action={createRequisitionFormAction} className={`${CARD} relative max-w-5xl space-y-5`}>
          <FormPendingOverlay />
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={`${LABEL} sm:col-span-3`}>Why these are needed<input name="reason" required minLength={3} maxLength={1000} className={`${INPUT} mt-1`} placeholder="e.g. BOM shortage for Prestige Pro2 build; reorder level reached on 8 GB RAM" /></label>
            <label className={LABEL}>Needed by<input name="neededBy" type="date" className={`${INPUT} mt-1`} /></label>
            <label className={LABEL}>Build order (optional)<input name="buildOrderNumber" defaultValue={buildOrder ?? ''} maxLength={20} className={`${INPUT} mt-1 uppercase`} placeholder="BLD-2026-000012" /></label>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Lines</p>
            <LineItemsEditor searchParts={searchPartsForSelect} searchProducts={searchProductsForPurchase} costLabel="Estimated unit cost" currency="NGN" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="submitNow" value="1" className={BTN}>Submit for approval</button>
            <button type="submit" name="submitNow" value="0" className={BTN_LINE}>Save as draft</button>
          </div>
        </form>
      )}
    </div>
  );
}
