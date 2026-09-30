import { notFound } from 'next/navigation';
import { getDelivery, getSecurityRoles, getSecurityHistory, canActForStore, listRecentGoodsReceipts } from '@/lib/actions/security';
import { deliveryActionFormAction, securityFollowUpFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityHistory } from '@/components/SecurityHistory';
import { DeliveryArrivalFields } from '@/components/DeliveryForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { DELIVERY_STATUS_LABEL, STATUS_CHIP, VEHICLE_TYPE_LABEL, durationText, minutesBetween } from '@/lib/security-rules';
import { formatDateTime, formatDateOnly } from '@/lib/utils/format-date';

const DONE: Record<string, string> = { expected: 'Delivery announced — Security has been emailed.', arrived: 'Arrival recorded — the Store has been emailed.', arrive: 'Arrival recorded — the Store has been emailed.', receive: 'Received by the Store.', left: 'Delivery vehicle recorded leaving.', cancel: 'Delivery cancelled — Security has been emailed.', follow_up: 'Follow-up saved.' };

export default async function DeliveryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const { status, error } = await searchParams;
  const [d, roles, history, store, grns] = await Promise.all([getDelivery(id), getSecurityRoles(), getSecurityHistory('GateDelivery', id), canActForStore(), listRecentGoodsReceipts()]);
  if (!d) notFound();
  const onSite = minutesBetween(d.arrivedAt, d.leftAt);
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
  const line = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
  const Hidden = ({ action }: { action: string }) => (<><FormPendingOverlay /><input type="hidden" name="deliveryId" value={d.id} /><input type="hidden" name="action" value={action} /></>);
  const Row = ({ k, val }: { k: string; val: string | null | undefined }) => (val ? <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd className="text-right text-[var(--ejo-text)]">{val}</dd></div> : null);
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/security/deliveries" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Deliveries</LoadingLink>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{d.deliveryNumber} — {d.supplierName}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{d.items}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_CHIP[d.status] ?? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>{DELIVERY_STATUS_LABEL[d.status]}</span>
      </div>
      <SecurityNav active="/security/deliveries" />
      {status && DONE[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={DONE[status]!} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <dl className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <Row k="Reference" val={d.reference} />
          <Row k="Expected" val={d.expectedAt ? formatDateTime(d.expectedAt) : null} />
          <Row k="Driver" val={[d.driverName, d.driverPhone].filter(Boolean).join(' · ') || null} />
          <Row k="Came by" val={d.vehicleType ? (d.vehicleType === 'ON_FOOT' ? 'On foot' : `${VEHICLE_TYPE_LABEL[d.vehicleType] ?? 'Vehicle'} — ${d.vehiclePlate ?? ''}`) : null} />
          <Row k="Announced by" val={`${d.registeredBy.fullName} · ${formatDateTime(d.createdAt)}`} />
          <Row k="Arrived" val={d.arrivedAt ? `${formatDateTime(d.arrivedAt)}${d.arrivedBy ? ` · ${d.arrivedBy.fullName}` : ''}` : null} />
          <Row k="Received by the Store" val={d.receivedAt ? `${formatDateTime(d.receivedAt)}${d.receivedBy ? ` · ${d.receivedBy.fullName}` : ''}` : null} />
          <Row k="Store note" val={d.receiptNote} />
          <Row k="Left" val={d.leftAt ? `${formatDateTime(d.leftAt)}${d.leftBy ? ` · ${d.leftBy.fullName}` : ''}` : null} />
          <Row k="On site for" val={onSite !== null ? durationText(onSite) : null} />
          <Row k="Notes" val={d.notes} />
          <Row k="Cancelled because" val={d.cancelReason} />
          {d.goodsReceipt ? <p className="mt-2 text-xs"><LoadingLink href={`/inventory/goods-receipts/${d.goodsReceipt.id}`} className="text-[var(--ejo-primary)] hover:underline">Goods receipt {d.goodsReceipt.referenceNumber} ({d.goodsReceipt.supplierName}, {formatDateOnly(d.goodsReceipt.receivedAt)}) →</LoadingLink></p> : null}
        </dl>
        <div className="h-fit space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Actions</h2>
          {d.status === 'EXPECTED' && roles.isGate ? (
            <form action={deliveryActionFormAction} className="space-y-3"><Hidden action="arrive" /><p className="text-sm font-medium text-[var(--ejo-text)]">It has arrived — record the driver and vehicle</p><DeliveryArrivalFields /><SubmitButton label="Record arrival — tell the Store" pendingLabel="Saving…" className={btn} /></form>
          ) : null}
          {d.status === 'AT_GATE' && store ? (
            <form action={deliveryActionFormAction} className="space-y-2">
              <Hidden action="receive" />
              <select name="goodsReceiptId" defaultValue="" className={`${input} w-full`}>
                <option value="">Link a goods receipt (optional)…</option>
                {grns.map((g) => <option key={g.id} value={g.id}>{g.referenceNumber} — {g.supplierName} ({formatDateOnly(g.receivedAt)})</option>)}
              </select>
              <input name="note" placeholder="Note (optional) — e.g. 1 carton short" className={`${input} w-full`} />
              <SubmitButton label="Confirm received by the Store" pendingLabel="Saving…" className={btn} />
            </form>
          ) : null}
          {d.status === 'AT_GATE' && !store ? <p className="text-sm text-[var(--ejo-text-muted)]">Waiting for the Store to receive it.</p> : null}
          {(d.status === 'AT_GATE' || d.status === 'RECEIVED') && roles.isGate ? (
            <form action={deliveryActionFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><Hidden action="left" />{d.status === 'AT_GATE' ? <input name="reason" required placeholder="Not received — why is it leaving?" className={`${input} min-w-0 flex-1`} /> : null}<SubmitButton label="Record vehicle leaving" pendingLabel="Saving…" className={line} /></form>
          ) : null}
          {d.status === 'EXPECTED' && (roles.isFrontDesk || store) ? (
            <form action={deliveryActionFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><Hidden action="cancel" /><input name="reason" required placeholder="Reason for cancelling" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Cancel delivery" pendingLabel="Saving…" className="text-sm font-medium text-[var(--ejo-error)] hover:underline" /></form>
          ) : null}
          {roles.isFrontDesk && ['EXPECTED', 'AT_GATE', 'RECEIVED'].includes(d.status) ? (
            <form action={securityFollowUpFormAction} className="flex flex-wrap gap-2 border-t border-[var(--ejo-border)] pt-3"><FormPendingOverlay /><input type="hidden" name="entityType" value="GateDelivery" /><input type="hidden" name="entityId" value={d.id} /><input name="note" required placeholder="Follow-up note" className={`${input} min-w-0 flex-1`} /><SubmitButton label="Add note" pendingLabel="Saving…" className={line} /></form>
          ) : null}
          {['LEFT', 'CANCELLED'].includes(d.status) ? <p className="text-sm text-[var(--ejo-text-muted)]">This delivery is closed.</p> : null}
          <LoadingLink href={`/security/incidents/new?related=${d.deliveryNumber}`} className="block text-xs text-[var(--ejo-primary)] hover:underline">Report an incident about this delivery →</LoadingLink>
        </div>
      </div>
      <SecurityHistory history={history} />
    </div>
  );
}
