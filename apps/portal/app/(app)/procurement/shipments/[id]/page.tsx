import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getShipment, getShipmentAuditTrail } from '@/lib/actions/procurement';
import { advanceShipmentFormAction } from '@/lib/actions/procurement-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { AuditTrail } from '@/components/AuditTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { BackLink, PageTitle, StatusChip } from '@/components/ui';
import { SHIPMENT_STEPS, SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_TONE, nextShipmentStatus, shipmentOverdue, type ShipmentStatus } from '@/lib/procurement-core';
import { Banners, BTN, CARD, Field, INPUT, LABEL, LINK, amount, day, todayValue, when } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { booked: 'Shipment booked.', in_transit: 'Marked in transit.', arrived_port: 'Arrived at port.', customs: 'At customs.', cleared: 'Cleared customs.', delivered: 'Delivered to the warehouse — receive the goods against the order.' };
const STEP_HINT: Record<ShipmentStatus, string> = { BOOKED: 'Booked with the carrier', IN_TRANSIT: 'Left the supplier', ARRIVED_PORT: 'At Apapa / Tin Can / the airport', CUSTOMS: 'With customs and the clearing agent', CLEARED: 'Duty paid, released', DELIVERED: 'At the Gbagada gate' };

export default async function ShipmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/shipments');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [sh, trail] = await Promise.all([getShipment(id), getShipmentAuditTrail(id)]);
  if (!sh) notFound();
  const [canManage, canStore] = await Promise.all([allows('procurement.po.manage', { branchId: sh.purchaseOrder.branchId, homeBranch: true }), allows('store.view', { branchId: sh.purchaseOrder.branchId })]);
  const s = sh.status as ShipmentStatus;
  const next = nextShipmentStatus(s);
  const idx = SHIPMENT_STEPS.indexOf(s);
  const late = shipmentOverdue({ status: s, eta: sh.eta });
  return (
    <div className="p-8">
      <BackLink href="/procurement/shipments" label="Back to Shipments" />
      <Banners status={status} error={error} map={BANNER} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="truck">{sh.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]"><LoadingLink href={`/procurement/orders/${sh.purchaseOrder.id}`} className={LINK}>{sh.purchaseOrder.number}</LoadingLink> · {sh.purchaseOrder.supplier.name}{sh.purchaseOrder.supplier.country ? ` (${sh.purchaseOrder.supplier.country})` : ''} · {sh.mode.toLowerCase()}{sh.carrier ? ` · ${sh.carrier}` : ''}{sh.reference ? ` · ${sh.reference}` : ''}</p>
        </div>
        <StatusChip status={s} label={SHIPMENT_STATUS_LABEL[s]} tone={SHIPMENT_STATUS_TONE[s]} className="px-3 py-1 text-sm" />
      </div>
      {late ? <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-4 text-sm text-[var(--ejo-text)]">Past its ETA of {day(sh.eta)} and not yet delivered.</div> : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {SHIPMENT_STEPS.map((step, i) => (
          <div key={step} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2 text-xs ${i <= idx ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
            <p className="font-medium text-[var(--ejo-text)]">{i <= idx ? '✓' : `${i + 1}.`} {SHIPMENT_STATUS_LABEL[step]}</p>
            <p className="text-[var(--ejo-text-muted)]">{step === 'ARRIVED_PORT' && sh.arrivedAt ? day(sh.arrivedAt) : step === 'CLEARED' && sh.clearedAt ? day(sh.clearedAt) : step === 'IN_TRANSIT' && sh.etd ? `ETD ${day(sh.etd)}` : step === 'DELIVERED' && sh.eta && i > idx ? `ETA ${day(sh.eta)}` : STEP_HINT[step]}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className={`${CARD} grid gap-4 sm:grid-cols-3`}>
            <Field label="Containers">{sh.containerNumbers ?? '—'}</Field>
            <Field label="ETD → ETA">{sh.etd ? day(sh.etd) : '—'} → {sh.eta ? day(sh.eta) : '—'}</Field>
            <Field label="Arrived at port">{sh.arrivedAt ? day(sh.arrivedAt) : '—'}</Field>
            <Field label="Cleared">{sh.clearedAt ? day(sh.clearedAt) : '—'}</Field>
            <Field label="Duty paid">{sh.dutyPaid !== null ? amount(sh.dutyPaid) : '—'}</Field>
            <Field label="Booked by">{sh.createdBy ?? '—'} · {day(sh.createdAt)}</Field>
            {sh.notes ? <Field label="Notes" className="sm:col-span-3">{sh.notes}</Field> : null}
          </div>

          {next && canManage ? (
            <form action={advanceShipmentFormAction} className={`${CARD} relative space-y-3 border-[var(--ejo-primary)]/40`}>
              <FormPendingOverlay />
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next: {SHIPMENT_STATUS_LABEL[next]}</h2>
              <p className="text-xs text-[var(--ejo-text-muted)]">{STEP_HINT[next]}.</p>
              <input type="hidden" name="shipmentId" value={sh.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={LABEL}>Date<input name="at" type="date" defaultValue={todayValue()} max={todayValue()} className={`${INPUT} mt-1`} /></label>
                {next === 'CLEARED' || next === 'CUSTOMS' ? <label className={LABEL}>Duty paid (₦)<input name="dutyPaid" type="number" min="0" step="0.01" defaultValue={sh.dutyPaid !== null ? Number(sh.dutyPaid) : ''} className={`${INPUT} mt-1`} /></label> : null}
                <label className={`${LABEL} ${next === 'CLEARED' || next === 'CUSTOMS' ? '' : 'sm:col-span-2'}`}>Notes<input name="notes" maxLength={1000} className={`${INPUT} mt-1`} placeholder="Optional" /></label>
              </div>
              <SubmitButton label={`Mark ${SHIPMENT_STATUS_LABEL[next].toLowerCase()}`} pendingLabel="Saving…" className={BTN} />
            </form>
          ) : s === 'DELIVERED' ? (
            <div className={CARD}><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Delivered</h2><p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Count the goods against <LoadingLink href={`/procurement/orders/${sh.purchaseOrder.id}`} className={LINK}>{sh.purchaseOrder.number}</LoadingLink>: components in the {canStore ? <LoadingLink href="/inventory/goods-receipts/new" className={LINK}>Components store</LoadingLink> : 'Components store'}, finished products under <LoadingLink href={`/warehouse/receive?order=${sh.purchaseOrder.id}`} className={LINK}>Receive finished products</LoadingLink>.</p></div>
          ) : null}

          <div className={CARD}>
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">On the order</h2>
            <ul className="mt-2 divide-y divide-[var(--ejo-border)] text-sm">{sh.purchaseOrder.lines.map((l) => <li key={l.id} className="flex justify-between py-1"><span>{l.description}</span><span className="text-[var(--ejo-text-muted)]">{Number(l.receivedQuantity)} / {Number(l.quantity)} received</span></li>)}</ul>
            {sh.goodsReceipts.length ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Receipts on this shipment: {sh.goodsReceipts.map((g) => g.referenceNumber).join(', ')}</p> : null}
          </div>
        </div>
        <div className={CARD}>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
          <AuditTrail entries={trail.map((e) => { const m = (e.metadata ?? {}) as Record<string, unknown>; return { id: e.id, actionLabel: humanizeAction(e.action), userName: e.userName, detail: [typeof m.at === 'string' ? day(m.at) : null, typeof m.dutyPaid === 'number' ? `Duty ${amount(m.dutyPaid)}` : null, typeof m.notes === 'string' ? m.notes : null].filter(Boolean).join(' · ') || null, dateLabel: when(e.createdAt) }; })} />
        </div>
      </div>
    </div>
  );
}
