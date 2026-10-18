import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getDispatch, getDispatchAuditTrail } from '@/lib/actions/warehouse';
import { recordDeliveryFormAction, markDispatchFailedFormAction } from '@/lib/actions/warehouse-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { AuditTrail } from '@/components/AuditTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { BackLink, PageTitle, StatusChip, ResponsiveTable } from '@/components/ui';
import { DISPATCH_STATUS_LABEL, UNIT_STATUS_LABEL, UNIT_STATUS_TONE, type DispatchStatus, type UnitStatus } from '@/lib/warehouse-core';
import { Banners, BTN, BTN_DANGER, CARD, Field, INPUT, LABEL, LINK, Steps, TABLE_WRAP, TD, TD_MUTED, TH, when } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { dispatched: 'Dispatch recorded — print the delivery note for the driver.', delivered: 'Delivery recorded — the serials are now sold and their warranty starts.', failed: 'Recorded as not delivered — the units are back at the warehouse, released for another dispatch.' };
const ACTION_LABEL: Record<string, string> = { 'dispatch.created': 'Dispatched', 'dispatch.delivered': 'Delivered', 'dispatch.failed': 'Not delivered' };

export default async function DispatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/dispatches');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [d, trail] = await Promise.all([getDispatch(id), getDispatchAuditTrail(id)]);
  if (!d) notFound();
  const [canDispatch, canSales] = await Promise.all([allows('warehouse.dispatch', { branchId: d.salesOrder.branchId, homeBranch: true }), allows('sales.view', { branchId: d.salesOrder.branchId })]);
  const s = d.status as DispatchStatus;
  const nowLocal = new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 16);
  return (
    <div className="p-8">
      <BackLink href="/warehouse/dispatches" label="Back to Dispatches" />
      <Banners status={status} error={error} map={BANNER} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="truck">{d.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            <LoadingLink href={`/warehouse/releases/${d.releaseNote.id}`} className={LINK}>{d.releaseNote.number}</LoadingLink> · {canSales ? <LoadingLink href={`/sales/orders/${d.salesOrder.id}`} className={LINK}>{d.salesOrder.number}</LoadingLink> : d.salesOrder.number} · {d.salesOrder.customer.fullName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={s} label={DISPATCH_STATUS_LABEL[s]} tone={s === 'DISPATCHED' ? 'info' : s === 'DELIVERED' ? 'success' : 'error'} className="px-3 py-1 text-sm" />
          <PrintMenu orgHref={`/print/dispatch/${d.id}`} clientHref={`/print/dispatch/${d.id}?variant=client`} clientLabel="Customer copy" />
        </div>
      </div>
      <Steps steps={[{ label: 'Released', done: true, who: d.releaseNote.number }, { label: 'Dispatched', done: true, who: d.dispatchedBy, at: d.dispatchedAt }, { label: s === 'FAILED' ? 'Not delivered' : 'Delivered', done: s !== 'DISPATCHED', who: d.receivedByName, at: d.deliveredAt }]} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className={`${CARD} grid gap-4 sm:grid-cols-3`}>
            <Field label="Vehicle">{d.vehiclePlate ?? '—'}</Field>
            <Field label="Driver">{d.driverName ?? '—'}{d.driverPhone ? <span className="block text-xs text-[var(--ejo-text-muted)]">{d.driverPhone}</span> : null}</Field>
            <Field label="Carrier">{d.carrier ?? '—'}</Field>
            <Field label="Waybill">{d.waybill ?? '—'}</Field>
            <Field label="Deliver to">{d.salesOrder.deliveryAddress ?? 'As per the order'}</Field>
            <Field label="Customer contact">{[d.salesOrder.customer.phone, d.salesOrder.customer.email].filter(Boolean).join(' · ') || '—'}</Field>
            {d.deliveredAt ? <Field label="Delivered">{when(d.deliveredAt)} · signed by {d.receivedByName}</Field> : null}
            {d.deliveryNotes ? <Field label="Notes" className="sm:col-span-2">{d.deliveryNotes}</Field> : null}
          </div>

          <ResponsiveTable className={TABLE_WRAP}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Serial</th><th className={TH}>Product</th><th className={TH}>Status</th></tr></thead>
              <tbody>
                {d.units.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className={`${TD} font-mono`}><LoadingLink href={`/warehouse/finished-goods/${u.id}`} className={LINK}>{u.serialNumber}</LoadingLink></td>
                    <td data-label="Product" className={TD_MUTED}>{u.product.name}{u.configuration ? ` · ${u.configuration.name}` : ''}</td>
                    <td data-label="Status" className={TD}><StatusChip status={u.status} label={UNIT_STATUS_LABEL[u.status as UnitStatus]} tone={UNIT_STATUS_TONE[u.status as UnitStatus]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>

          {canDispatch && s === 'DISPATCHED' ? (
            <div className="grid gap-6 md:grid-cols-2">
              <form action={recordDeliveryFormAction} className={`${CARD} relative space-y-3`}>
                <FormPendingOverlay />
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Record the delivery</h2>
                <input type="hidden" name="dispatchId" value={d.id} />
                <label className={LABEL}>Signed for by<input name="receivedByName" required minLength={2} maxLength={120} className={`${INPUT} mt-1`} placeholder="Name on the delivery note" /></label>
                <label className={LABEL}>Delivered at<input name="deliveredAt" type="datetime-local" defaultValue={nowLocal} max={nowLocal} className={`${INPUT} mt-1`} /></label>
                <label className={LABEL}>Notes<input name="notes" maxLength={500} className={`${INPUT} mt-1`} placeholder="Optional" /></label>
                <SubmitButton label="Record delivery" pendingLabel="Saving…" className={BTN} />
                <p className="text-xs text-[var(--ejo-text-muted)]">The serials become sold from this date; their warranty starts.</p>
              </form>
              <details className={CARD}>
                <summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">Goods came back undelivered</summary>
                <form action={markDispatchFailedFormAction} className="relative mt-3 space-y-3">
                  <FormPendingOverlay />
                  <input type="hidden" name="dispatchId" value={d.id} />
                  <label className={LABEL}>Why<input name="reason" required minLength={3} maxLength={300} className={`${INPUT} mt-1`} placeholder="e.g. Customer not available, address wrong" /></label>
                  <SubmitButton label="Record as not delivered" pendingLabel="Saving…" className={BTN_DANGER} />
                </form>
              </details>
            </div>
          ) : null}
        </div>
        <div className={CARD}>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
          <AuditTrail entries={trail.map((e) => { const m = (e.metadata ?? {}) as Record<string, unknown>; return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: [typeof m.receivedByName === 'string' ? `Signed by ${m.receivedByName}` : null, typeof m.reason === 'string' ? `Reason: ${m.reason}` : null, typeof m.vehiclePlate === 'string' ? m.vehiclePlate : null].filter(Boolean).join(' · ') || null, dateLabel: when(e.createdAt) }; })} />
        </div>
      </div>
    </div>
  );
}
