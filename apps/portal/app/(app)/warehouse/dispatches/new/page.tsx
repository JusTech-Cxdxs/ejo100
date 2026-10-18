import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getRelease } from '@/lib/actions/warehouse';
import { createDispatchFormAction } from '@/lib/actions/warehouse-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState } from '@/components/ui';
import { Banners, BTN, CARD, INPUT, LABEL, LINK } from '@/components/warehouse/forms';

/** Record a dispatch for a released goods release note: vehicle, driver, carrier, waybill. */
export default async function NewDispatchPage({ searchParams }: { searchParams: Promise<{ release?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/dispatches/new');
  const { release, error } = await searchParams;
  if (!release) notFound();
  const r = await getRelease(release);
  if (!r) notFound();
  const canDispatch = await allows('warehouse.dispatch', { branchId: r.salesOrder.branchId, homeBranch: true });
  const units = r.lines.filter((l) => l.finishedUnit);
  return (
    <div className="p-8">
      <PageHeader icon="truck" back={{ href: `/warehouse/releases/${r.id}`, label: <>Back to {r.number}</> }} title="Record a dispatch" description={<>{r.number} · {r.salesOrder.number} · {r.salesOrder.customer.fullName} · {units.length} {units.length === 1 ? 'unit' : 'units'}{r.salesOrder.deliveryAddress ? ` · to ${r.salesOrder.deliveryAddress}` : ''}</>} />
      <Banners status={undefined} error={error} map={{}} />
      {!canDispatch ? <EmptyState icon="lock" title="The dispatch desk records dispatches." /> : r.dispatch ? (
        <EmptyState icon="truck" title="Already dispatched."><LoadingLink href={`/warehouse/dispatches/${r.dispatch.id}`} className={LINK}>{r.dispatch.number}</LoadingLink></EmptyState>
      ) : r.status !== 'RELEASED' ? (
        <EmptyState icon="clipboard" title="Not released yet.">Pick and release the goods on <LoadingLink href={`/warehouse/releases/${r.id}`} className={LINK}>{r.number}</LoadingLink> first.</EmptyState>
      ) : (
        <form action={createDispatchFormAction} className={`${CARD} relative max-w-3xl space-y-4`}>
          <FormPendingOverlay />
          <input type="hidden" name="releaseNoteId" value={r.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={LABEL}>Vehicle plate<input name="vehiclePlate" maxLength={20} className={`${INPUT} mt-1 uppercase`} placeholder="e.g. LSD-123-XY" /></label>
            <label className={LABEL}>Driver<input name="driverName" maxLength={120} className={`${INPUT} mt-1`} placeholder="Driver's name" /></label>
            <label className={LABEL}>Driver&apos;s phone<input name="driverPhone" maxLength={40} className={`${INPUT} mt-1`} inputMode="tel" /></label>
            <label className={LABEL}>Carrier (if a logistics company)<input name="carrier" maxLength={120} className={`${INPUT} mt-1`} placeholder="e.g. GIG Logistics, TD Africa fleet" /></label>
            <label className={LABEL}>Waybill / consignment number<input name="waybill" maxLength={120} className={`${INPUT} mt-1`} /></label>
          </div>
          <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3 text-sm">
            <p className="text-xs font-medium text-[var(--ejo-text-muted)]">Going out</p>
            <ul className="mt-1 grid gap-1 sm:grid-cols-2">{units.map((l) => <li key={l.id}><span className="font-mono">{l.finishedUnit!.serialNumber}</span> <span className="text-[var(--ejo-text-muted)]">· {l.salesOrderLine.product.name}</span></li>)}</ul>
          </div>
          <SubmitButton label="Record dispatch" pendingLabel="Recording…" className={BTN} />
          <p className="text-xs text-[var(--ejo-text-muted)]">The units become dispatched and the sales order moves on; the gate releases the vehicle under Security.</p>
        </form>
      )}
    </div>
  );
}
