import { allows, guardAnyPage } from '@/lib/authz/server';
import { listFgLocations, listAvailableUnitsForTransfer, searchProductsForSelect } from '@/lib/actions/warehouse';
import { createTransferFormAction } from '@/lib/actions/warehouse-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { UnitPicker } from '@/components/warehouse/UnitPicker';
import { PageHeader, EmptyState } from '@/components/ui';
import { Banners, BTN, CARD, INPUT, LABEL } from '@/components/warehouse/forms';

/** Start a transfer: from one location to another, with the serials it takes. */
export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/transfers/new');
  const { error } = await searchParams;
  const [locations, canFg] = await Promise.all([listFgLocations(), allows('warehouse.fg.operate')]);
  return (
    <div className="p-8">
      <PageHeader icon="road" back={{ href: '/warehouse/transfers', label: 'Back to Transfers' }} title="New stock transfer" description="The units are reserved as soon as the transfer is raised, dispatched by the sending side and received by the other." />
      <Banners status={undefined} error={error} map={{}} />
      {!canFg ? <EmptyState icon="lock" title="Finished goods staff raise transfers.">You can follow transfers from the list.</EmptyState> : locations.length < 2 ? (
        <EmptyState icon="pin" title="Two active locations are needed.">Ask the Warehouse Manager to add locations first.</EmptyState>
      ) : (
        <form action={createTransferFormAction} className={`${CARD} relative max-w-4xl space-y-4`}>
          <FormPendingOverlay />
          <UnitPicker locations={locations.map((l) => ({ id: l.id, name: l.name, branch: l.branch.name, kind: l.kind }))} searchProducts={searchProductsForSelect} loadUnits={listAvailableUnitsForTransfer} />
          <label className={LABEL}>Reason<input name="reason" maxLength={200} className={`${INPUT} mt-1`} placeholder="e.g. Showroom display stock, Abuja store replenishment" /></label>
          <SubmitButton label="Create transfer" pendingLabel="Creating…" className={BTN} />
        </form>
      )}
    </div>
  );
}
