import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getTransfer, getTransferAuditTrail } from '@/lib/actions/warehouse';
import { requireUser } from '@/lib/actions/workshop';
import { approveTransferFormAction, dispatchTransferFormAction, receiveTransferFormAction, cancelTransferFormAction } from '@/lib/actions/warehouse-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { AuditTrail } from '@/components/AuditTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { BackLink, PageTitle, StatusChip, ResponsiveTable } from '@/components/ui';
import { TRANSFER_STATUS_LABEL, UNIT_STATUS_LABEL, UNIT_STATUS_TONE, canDispatchTransfer, type TransferStatus, type UnitStatus } from '@/lib/warehouse-core';
import { Banners, BTN, BTN_DANGER, CARD, Field, INPUT, LABEL, LINK, Steps, TABLE_WRAP, TD, TD_MUTED, TH, when, humanise } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { created: 'Transfer raised — the units are reserved for it.', approved: 'Transfer approved — it can leave now.', dispatched: 'Transfer dispatched.', received: 'Transfer received — the units are in their new location.', cancelled: 'Transfer cancelled — the units are back in stock.' };
const ACTION_LABEL: Record<string, string> = { 'stock_transfer.created': 'Raised', 'stock_transfer.approved': 'Approved', 'stock_transfer.dispatched': 'Dispatched', 'stock_transfer.received': 'Received', 'stock_transfer.cancelled': 'Cancelled' };

export default async function TransferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/transfers');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [t, trail, viewer] = await Promise.all([getTransfer(id), getTransferAuditTrail(id), requireUser()]);
  if (!t) notFound();
  const [canSend, canReceive, canManage] = await Promise.all([allows('warehouse.fg.operate', { branchId: t.fromLocation.branchId, homeBranch: true }), allows('warehouse.fg.operate', { branchId: t.toLocation.branchId, homeBranch: true }), allows('warehouse.manage', { branchId: t.fromLocation.branchId, homeBranch: true })]);
  const s = t.status as TransferStatus;
  const dispatchCheck = canDispatchTransfer({ status: s, needsApproval: t.needsApproval, approved: t.approved });
  const steps = [
    { label: 'Raised', done: true, who: t.requestedBy.fullName, at: t.createdAt },
    ...(t.needsApproval ? [{ label: 'Approved (other branch)', done: t.approved, who: t.approvedBy, at: t.approvedAt, hint: 'Warehouse Manager' }] : []),
    { label: 'Dispatched', done: Boolean(t.dispatchedAt), who: t.dispatchedBy, at: t.dispatchedAt },
    { label: 'Received', done: Boolean(t.receivedAt), who: t.receivedBy, at: t.receivedAt },
  ];
  return (
    <div className="p-8">
      <BackLink href="/warehouse/transfers" label="Back to Transfers" />
      <Banners status={status} error={error} map={BANNER} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="road">{t.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{t.fromLocation.name} ({t.fromLocation.branch.name}) → {t.toLocation.name} ({t.toLocation.branch.name}) · {t.lines.length} {t.lines.length === 1 ? 'unit' : 'units'}{t.reason ? ` · ${t.reason}` : ''}</p>
        </div>
        <StatusChip status={s} label={TRANSFER_STATUS_LABEL[s]} className="px-3 py-1 text-sm" />
      </div>
      <Steps steps={steps} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <ResponsiveTable className={TABLE_WRAP}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Serial</th><th className={TH}>Product</th><th className={TH}>Unit status</th><th className={TH}>Now at</th></tr></thead>
              <tbody>
                {t.lines.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className={`${TD} font-mono`}>{l.finishedUnit ? <LoadingLink href={`/warehouse/finished-goods/${l.finishedUnit.id}`} className={LINK}>{l.finishedUnit.serialNumber}</LoadingLink> : `× ${l.quantity}`}</td>
                    <td data-label="Product" className={TD}>{l.product.name}{l.finishedUnit?.configuration ? <span className="block text-xs text-[var(--ejo-text-muted)]">{l.finishedUnit.configuration.name}</span> : null}</td>
                    <td data-label="Unit status" className={TD}>{l.finishedUnit ? <StatusChip status={l.finishedUnit.status} label={UNIT_STATUS_LABEL[l.finishedUnit.status as UnitStatus]} tone={UNIT_STATUS_TONE[l.finishedUnit.status as UnitStatus]} /> : '—'}</td>
                    <td data-label="Now at" className={TD_MUTED}>{l.finishedUnit ? (l.finishedUnit.locationId === t.toLocation.id ? t.toLocation.name : t.fromLocation.name) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>

          {s === 'DRAFT' && t.needsApproval && !t.approved ? (
            <div className={`${CARD} border-[var(--ejo-warning)]/40`}>
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Waiting for the Warehouse Manager</h2>
              <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">A transfer to another branch leaves only once it is approved.</p>
              {canManage && (t.requestedBy.id !== viewer.id) ? (
                <form action={approveTransferFormAction} className="relative mt-3"><FormPendingOverlay /><input type="hidden" name="transferId" value={t.id} /><SubmitButton label="Approve transfer" pendingLabel="Approving…" className={BTN} /></form>
              ) : canManage ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">You raised this transfer, so another Warehouse Manager approves it.</p> : null}
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            {s === 'DRAFT' && canSend ? (
              <form action={dispatchTransferFormAction} className={`${CARD} relative space-y-3`}>
                <FormPendingOverlay />
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Dispatch</h2>
                <p className="text-xs text-[var(--ejo-text-muted)]">{dispatchCheck.ok ? 'The units leave the sending location now.' : dispatchCheck.why}</p>
                <input type="hidden" name="transferId" value={t.id} />
                {dispatchCheck.ok ? <SubmitButton label="Dispatch transfer" pendingLabel="Dispatching…" className={BTN} /> : null}
              </form>
            ) : null}
            {s === 'DISPATCHED' && canReceive ? (
              <form action={receiveTransferFormAction} className={`${CARD} relative space-y-3`}>
                <FormPendingOverlay />
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Receive at {t.toLocation.name}</h2>
                <p className="text-xs text-[var(--ejo-text-muted)]">Confirms every unit arrived; they go into stock at the destination.</p>
                <input type="hidden" name="transferId" value={t.id} />
                <SubmitButton label="Receive transfer" pendingLabel="Receiving…" className={BTN} />
              </form>
            ) : null}
            {(s === 'DRAFT' && canSend) || (s === 'DISPATCHED' && canManage) ? (
              <details className={CARD}>
                <summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">Cancel this transfer</summary>
                <form action={cancelTransferFormAction} className="relative mt-3 space-y-3">
                  <FormPendingOverlay />
                  <input type="hidden" name="transferId" value={t.id} />
                  <label className={LABEL}>Reason<input name="reason" maxLength={300} className={`${INPUT} mt-1`} /></label>
                  <SubmitButton label="Cancel transfer" pendingLabel="Cancelling…" className={BTN_DANGER} />
                </form>
              </details>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className={`${CARD} grid gap-3`}>
            <Field label="From">{t.fromLocation.name}<span className="block text-xs text-[var(--ejo-text-muted)]">{humanise(t.fromLocation.kind)} · {t.fromLocation.branch.name}</span></Field>
            <Field label="To">{t.toLocation.name}<span className="block text-xs text-[var(--ejo-text-muted)]">{humanise(t.toLocation.kind)} · {t.toLocation.branch.name}</span></Field>
            <Field label="Raised by">{t.requestedBy.fullName} · {when(t.createdAt)}</Field>
          </div>
          <div className={CARD}>
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
            <AuditTrail entries={trail.map((e) => { const m = (e.metadata ?? {}) as Record<string, unknown>; return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: typeof m.reason === 'string' ? `Reason: ${m.reason}` : typeof m.units === 'number' ? `${m.units} units` : null, dateLabel: when(e.createdAt) }; })} />
          </div>
        </div>
      </div>
    </div>
  );
}
