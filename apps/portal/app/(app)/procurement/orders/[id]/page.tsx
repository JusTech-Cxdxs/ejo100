import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getPurchaseOrder, getPurchaseOrderAuditTrail } from '@/lib/actions/procurement';
import { requireUser } from '@/lib/actions/workshop';
import { approvePurchaseOrderFormAction, markPurchaseOrderSentFormAction, closePurchaseOrderFormAction, cancelPurchaseOrderFormAction, addShipmentFormAction } from '@/lib/actions/procurement-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { AuditTrail } from '@/components/AuditTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { BackLink, PageTitle, StatusChip, ResponsiveTable, RevealPanel, SectionCard } from '@/components/ui';
import { PO_STATUS_LABEL, PO_STATUS_TONE, SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_TONE, CLAIM_STATUS_LABEL, receivedVsOrdered, poTotalInNaira, RECEIVABLE_PO_STATUSES, type PurchaseOrderStatus, type ShipmentStatus, type SupplierClaimStatus } from '@/lib/procurement-core';
import { Banners, BTN, BTN_DANGER, BTN_LINE, CARD, Field, INPUT, LABEL, LINK, Steps, TABLE_WRAP, TD, TD_MUTED, TH, amount, day, when } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { created: 'Purchase order raised — it needs the Head of Procurement\'s approval.', approved: 'Approved — send it to the supplier.', sent: 'Marked as sent to the supplier.', closed: 'Order closed.', cancelled: 'Order cancelled.', booked: 'Shipment booked.', received: 'Units received into stock.' };
const ACTION_LABEL: Record<string, string> = { 'purchase_order.created': 'Raised', 'purchase_order.approved': 'Approved', 'purchase_order.sent': 'Sent to the supplier', 'purchase_order.closed': 'Closed', 'purchase_order.cancelled': 'Cancelled', 'purchase_order.shipment_booked': 'Shipment booked', 'purchase_order.goods_received': 'Goods received' };

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/orders');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [po, trail, viewer] = await Promise.all([getPurchaseOrder(id), getPurchaseOrderAuditTrail(id), requireUser()]);
  if (!po) notFound();
  const ctx = { branchId: po.branchId, homeBranch: true };
  const [canManage, canApprove, canWarehouse, canStore] = await Promise.all([allows('procurement.po.manage', ctx), allows('procurement.po.approve', ctx), allows('warehouse.fg.operate', { branchId: po.branchId }), allows('store.view', { branchId: po.branchId })]);
  const s = po.status as PurchaseOrderStatus;
  const mine = po.raisedBy.id === viewer.id;
  const lines = po.lines.map((l) => ({ ...l, quantity: Number(l.quantity), receivedQuantity: Number(l.receivedQuantity), unitCost: Number(l.unitCost) }));
  const progress = receivedVsOrdered(lines);
  const naira = poTotalInNaira(Number(po.total), po.currency, po.exchangeRate === null ? null : Number(po.exchangeRate));
  const hasProducts = lines.some((l) => l.product);
  return (
    <div className="p-8">
      <BackLink href="/procurement/orders" label="Back to Purchase orders" />
      <Banners status={status} error={error} map={BANNER} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="cart">{po.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]"><LoadingLink href={`/procurement/suppliers/${po.supplier.id}`} className={LINK}>{po.supplier.name}</LoadingLink>{po.supplier.country ? ` · ${po.supplier.country}` : ''} · {amount(po.total, po.currency)}{naira !== null && po.currency !== 'NGN' ? ` (≈ ${amount(naira)})` : ''}{po.requisition ? <> · from <LoadingLink href={`/procurement/requisitions/${po.requisition.id}`} className={LINK}>{po.requisition.number}</LoadingLink></> : null}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={s} label={PO_STATUS_LABEL[s]} tone={PO_STATUS_TONE[s]} className="px-3 py-1 text-sm" />
          <PrintMenu orgHref={`/print/purchase-order/${po.id}`} clientHref={`/print/purchase-order/${po.id}?variant=client`} clientLabel="Supplier copy" />
        </div>
      </div>
      <Steps steps={[{ label: 'Raised', done: true, who: po.raisedBy.fullName, at: po.createdAt }, { label: 'Approved', done: Boolean(po.approvedAt), who: po.approvedBy, at: po.approvedAt, hint: 'Head of Procurement' }, { label: 'Sent', done: Boolean(po.sentAt), at: po.sentAt }, { label: 'Received', done: progress.state === 'RECEIVED', hint: progress.state === 'PARTLY_RECEIVED' ? `${progress.received} of ${progress.ordered}` : undefined }, { label: 'Closed', done: Boolean(po.closedAt), at: po.closedAt }]} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <ResponsiveTable className={TABLE_WRAP}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Item</th><th className={TH}>Ordered</th><th className={TH}>Received</th><th className={TH}>Unit cost</th><th className={TH}>Line total</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className={TD}>{l.part ? (canStore ? <LoadingLink href={`/inventory/parts/${l.part.id}`} className={LINK}>{l.part.name}</LoadingLink> : l.part.name) : l.product ? l.product.name : l.description}<span className="block text-xs text-[var(--ejo-text-muted)]">{l.part ? `Component${l.part.partNumber ? ` · ${l.part.partNumber}` : ''} · received in the Components store` : l.product ? `Product · ${l.product.sku} · received by serial in the Warehouses` : 'Described item'}</span></td>
                    <td data-label="Ordered" className={TD}>{l.quantity}{l.part ? ` ${l.part.baseUnitOfMeasure}` : ''}</td>
                    <td data-label="Received" className={l.receivedQuantity >= l.quantity ? `${TD} text-[var(--ejo-success)]` : TD}>{l.receivedQuantity}</td>
                    <td data-label="Unit cost" className={TD_MUTED}>{amount(l.unitCost, po.currency)}</td>
                    <td data-label="Line total" className={TD}>{amount(l.quantity * l.unitCost, po.currency)}</td>
                  </tr>
                ))}
                <tr className="font-semibold"><td className={TD} colSpan={4}>Total</td><td className={TD}>{amount(po.total, po.currency)}</td></tr>
              </tbody>
            </table>
          </ResponsiveTable>

          <div className="grid gap-6 md:grid-cols-2">
            {s === 'DRAFT' && canApprove ? (
              mine ? <div className={CARD}><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Awaiting approval</h2><p className="mt-1 text-sm text-[var(--ejo-text-muted)]">You raised this order, so another approver decides it.</p></div> : (
                <form action={approvePurchaseOrderFormAction} className={`${CARD} relative border-[var(--ejo-success)]/40`}><FormPendingOverlay /><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Approve</h2><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{amount(po.total, po.currency)} to {po.supplier.name}{po.paymentTerms ? ` · ${po.paymentTerms}` : ''}</p><input type="hidden" name="purchaseOrderId" value={po.id} /><SubmitButton label="Approve purchase order" pendingLabel="Approving…" className={`${BTN} mt-3`} /></form>
              )
            ) : null}
            {s === 'APPROVED' && canManage ? (
              <form action={markPurchaseOrderSentFormAction} className={`${CARD} relative`}><FormPendingOverlay /><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Send to the supplier</h2><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Print the supplier copy, send it, then mark it sent.</p><input type="hidden" name="purchaseOrderId" value={po.id} /><SubmitButton label="Mark as sent" pendingLabel="Saving…" className={`${BTN} mt-3`} /></form>
            ) : null}
            {(RECEIVABLE_PO_STATUSES as string[]).includes(s) && hasProducts && canWarehouse ? (
              <div className={`${CARD} border-[var(--ejo-primary)]/40`}><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Receive finished products</h2><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Book the serials into a finished goods location.</p><LoadingLink href={`/warehouse/receive?order=${po.id}`} className={`${BTN} mt-3 inline-block`}>Receive units</LoadingLink></div>
            ) : null}
            {['SENT', 'PARTLY_RECEIVED', 'RECEIVED'].includes(s) && canManage ? (
              <details className={CARD}><summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">Close this order</summary><form action={closePurchaseOrderFormAction} className="relative mt-3 space-y-3"><FormPendingOverlay /><input type="hidden" name="purchaseOrderId" value={po.id} /><label className={LABEL}>Note<input name="reason" maxLength={500} className={`${INPUT} mt-1`} placeholder={progress.state !== 'RECEIVED' ? 'e.g. Balance cancelled by the supplier' : 'Optional'} /></label><SubmitButton label="Close order" pendingLabel="Closing…" className={BTN_LINE} /></form></details>
            ) : null}
            {['DRAFT', 'APPROVED', 'SENT'].includes(s) && canManage ? (
              <details className={CARD}><summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">Cancel this order</summary><form action={cancelPurchaseOrderFormAction} className="relative mt-3 space-y-3"><FormPendingOverlay /><input type="hidden" name="purchaseOrderId" value={po.id} /><label className={LABEL}>Why<input name="reason" required minLength={3} maxLength={500} className={`${INPUT} mt-1`} /></label><SubmitButton label="Cancel order" pendingLabel="Cancelling…" className={BTN_DANGER} /></form></details>
            ) : null}
          </div>

          <SectionCard icon="truck" title={`Shipments (${po.shipments.length})`} description="Containers and airfreight against this order.">
            {po.shipments.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">None booked yet.</p> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {po.shipments.map((sh) => <li key={sh.id} className="flex items-center justify-between gap-2 py-2"><span><LoadingLink href={`/procurement/shipments/${sh.id}`} className={LINK}>{sh.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{sh.mode.toLowerCase()}{sh.carrier ? ` · ${sh.carrier}` : ''}{sh.reference ? ` · ${sh.reference}` : ''}{sh.eta ? ` · ETA ${day(sh.eta)}` : ''}</span></span><StatusChip status={sh.status} label={SHIPMENT_STATUS_LABEL[sh.status as ShipmentStatus]} tone={SHIPMENT_STATUS_TONE[sh.status as ShipmentStatus]} /></li>)}
              </ul>
            )}
            {['APPROVED', 'SENT', 'PARTLY_RECEIVED'].includes(s) && canManage ? (
              <div className="mt-3">
                <RevealPanel label="Add a shipment">
                  <form action={addShipmentFormAction} className="relative grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FormPendingOverlay />
                    <input type="hidden" name="purchaseOrderId" value={po.id} />
                    <label className={LABEL}>Mode<select name="mode" className={`${INPUT} mt-1`} defaultValue="SEA"><option value="SEA">Sea</option><option value="AIR">Air</option><option value="ROAD">Road</option></select></label>
                    <label className={LABEL}>Carrier<input name="carrier" maxLength={120} className={`${INPUT} mt-1`} placeholder="Shipping line / airline / haulier" /></label>
                    <label className={LABEL}>Reference (BL / AWB)<input name="reference" maxLength={120} className={`${INPUT} mt-1`} /></label>
                    <label className={LABEL}>Container numbers<input name="containerNumbers" maxLength={300} className={`${INPUT} mt-1`} placeholder="Comma-separated" /></label>
                    <label className={LABEL}>ETD<input name="etd" type="date" className={`${INPUT} mt-1`} /></label>
                    <label className={LABEL}>ETA<input name="eta" type="date" className={`${INPUT} mt-1`} /></label>
                    <label className={`${LABEL} sm:col-span-2 lg:col-span-3`}>Notes<input name="notes" maxLength={1000} className={`${INPUT} mt-1`} /></label>
                    <div><SubmitButton label="Book shipment" pendingLabel="Booking…" className={BTN} /></div>
                  </form>
                </RevealPanel>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard icon="receipt" title={`Goods receipts (${po.goodsReceipts.length})`} description="Component deliveries counted against this order in the Components store.">
            {po.goodsReceipts.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">{hasProducts ? 'Finished products are booked by serial under Receive finished products; component receipts appear here.' : 'None yet.'}</p> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {po.goodsReceipts.map((g) => <li key={g.id} className="py-2">{canStore ? <LoadingLink href={`/inventory/goods-receipts/${g.id}`} className={LINK}>{g.referenceNumber}</LoadingLink> : g.referenceNumber} <span className="text-[var(--ejo-text-muted)]">· {day(g.receivedAt)} · {g.receivedBy.fullName} · {g.lines.map((l) => `${l.part.name} × ${Number(l.quantityInBaseUnit)}`).join(', ')}</span> {g.inspection ? <StatusChip status={g.inspection.passed ? 'PASSED' : 'FAILED'} label={g.inspection.passed ? 'QC passed' : 'QC failed'} /> : <StatusChip status="PENDING" label="QC due" />}</li>)}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon="alert" title={`Supplier claims (${po.claims.length})`} actions={canManage ? <LoadingLink href={`/procurement/claims/new?order=${po.id}`} className={LINK}>Raise a claim</LoadingLink> : null}>
            {po.claims.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">None.</p> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">{po.claims.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 py-2"><span><LoadingLink href={`/procurement/claims/${c.id}`} className={LINK}>{c.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{amount(c.amount, c.currency)} · {c.description.slice(0, 80)}</span></span><StatusChip status={c.status} label={CLAIM_STATUS_LABEL[c.status as SupplierClaimStatus]} /></li>)}</ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <div className={`${CARD} grid gap-3`}>
            <Field label="Currency · exchange rate">{po.currency}{po.exchangeRate !== null ? ` · ₦${Number(po.exchangeRate).toLocaleString('en-NG')} per ${po.currency}` : ''}</Field>
            <Field label="Incoterms">{po.incoterms ?? '—'}</Field>
            <Field label="Payment terms">{po.paymentTerms ?? po.supplier.paymentTerms ?? '—'}</Field>
            <Field label="Expected">{po.expectedDate ? day(po.expectedDate) : '—'}</Field>
            <Field label="Branch">{po.branch.name}</Field>
            <Field label="Supplier contact">{[po.supplier.contactName, po.supplier.email, po.supplier.phone].filter(Boolean).join(' · ') || '—'}</Field>
            {po.notes ? <Field label="Notes">{po.notes}</Field> : null}
            <Field label="Raised">{po.raisedBy.fullName} · {when(po.createdAt)}</Field>
          </div>
          <div className={CARD}>
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
            <AuditTrail entries={trail.map((e) => { const m = (e.metadata ?? {}) as Record<string, unknown>; return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: [typeof m.reason === 'string' ? `Reason: ${m.reason}` : null, typeof m.note === 'string' ? m.note : null, typeof m.shipment === 'string' ? m.shipment : null, typeof m.quantity === 'number' ? `${m.quantity} × ${String(m.product ?? '')} → ${String(m.location ?? '')}` : null].filter(Boolean).join(' · ') || null, dateLabel: when(e.createdAt) }; })} />
          </div>
        </div>
      </div>
    </div>
  );
}
