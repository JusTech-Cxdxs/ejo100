import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getRequisition, getRequisitionAuditTrail } from '@/lib/actions/procurement';
import { requireUser } from '@/lib/actions/workshop';
import { submitRequisitionFormAction, approveRequisitionFormAction, rejectRequisitionFormAction, reopenRequisitionFormAction, cancelRequisitionFormAction } from '@/lib/actions/procurement-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { AuditTrail } from '@/components/AuditTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { BackLink, PageTitle, StatusChip, ResponsiveTable } from '@/components/ui';
import { REQUISITION_STATUS_LABEL, requisitionEstimate, PO_STATUS_LABEL, PO_STATUS_TONE, type RequisitionStatus, type PurchaseOrderStatus } from '@/lib/procurement-core';
import { Banners, BTN, BTN_DANGER, BTN_LINE, CARD, Field, INPUT, LABEL, LINK, Steps, TABLE_WRAP, TD, TD_MUTED, TH, amount, day, when } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { created: 'Draft saved.', submitted: 'Submitted — the Head of Procurement has it.', approved: 'Approved — a purchase order can be raised from it.', rejected: 'Rejected and sent back.', reopened: 'Back in draft.', cancelled: 'Requisition cancelled.' };
const ACTION_LABEL: Record<string, string> = { 'requisition.created': 'Raised', 'requisition.submitted': 'Submitted for approval', 'requisition.approved': 'Approved', 'requisition.rejected': 'Rejected', 'requisition.reopened': 'Reopened as a draft', 'requisition.cancelled': 'Cancelled', 'requisition.ordered': 'Purchase order raised' };

export default async function RequisitionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/requisitions');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [r, trail, viewer] = await Promise.all([getRequisition(id), getRequisitionAuditTrail(id), requireUser()]);
  if (!r) notFound();
  const ctx = { branchId: r.branchId, homeBranch: true };
  const [canRaise, canApprove, canManage, canProduction, canStore] = await Promise.all([allows('procurement.requisition.raise', ctx), allows('procurement.requisition.approve', ctx), allows('procurement.po.manage', ctx), allows('production.view', { branchId: r.branchId }), allows('store.view', { branchId: r.branchId })]);
  const s = r.status as RequisitionStatus;
  const mine = r.raisedBy.id === viewer.id;
  const estimate = requisitionEstimate(r.lines.map((l) => ({ quantity: Number(l.quantity), estimatedUnitCost: l.estimatedUnitCost === null ? null : Number(l.estimatedUnitCost) })));
  return (
    <div className="p-8">
      <BackLink href="/procurement/requisitions" label="Back to Requisitions" />
      <Banners status={status} error={error} map={BANNER} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="clipboard">{r.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{r.reason}{r.buildOrder ? <> · for {canProduction ? <LoadingLink href={`/production/build-orders/${r.buildOrder.id}`} className={LINK}>{r.buildOrder.number}</LoadingLink> : r.buildOrder.number}</> : null} · {r.branch.name}</p>
        </div>
        <StatusChip status={s} label={REQUISITION_STATUS_LABEL[s]} className="px-3 py-1 text-sm" />
      </div>
      <Steps steps={[{ label: 'Raised', done: true, who: r.raisedBy.fullName, at: r.createdAt }, { label: 'Submitted', done: Boolean(r.submittedAt), at: r.submittedAt }, { label: s === 'REJECTED' ? 'Rejected' : 'Approved', done: Boolean(r.approvedAt) || s === 'REJECTED', who: r.approvedBy, at: r.approvedAt }, { label: 'Ordered', done: s === 'ORDERED', who: r.purchaseOrders[0]?.number ?? null }]} />
      {s === 'REJECTED' && r.rejectedReason ? <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-4 text-sm text-[var(--ejo-text)]"><span className="font-medium">Rejected:</span> {r.rejectedReason}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <ResponsiveTable className={TABLE_WRAP}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Item</th><th className={TH}>Quantity</th><th className={TH}>Estimated unit cost</th><th className={TH}>Estimate</th></tr></thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className={TD}>{l.part ? (canStore ? <LoadingLink href={`/inventory/parts/${l.part.id}`} className={LINK}>{l.part.name}</LoadingLink> : l.part.name) : l.product ? l.product.name : l.description}<span className="block text-xs text-[var(--ejo-text-muted)]">{l.part ? `Component${l.part.partNumber ? ` · ${l.part.partNumber}` : ''}` : l.product ? `Product · ${l.product.sku}` : 'Described item'}</span></td>
                    <td data-label="Quantity" className={TD}>{Number(l.quantity)}{l.part ? ` ${l.part.baseUnitOfMeasure}` : ''}</td>
                    <td data-label="Estimated unit cost" className={TD_MUTED}>{l.estimatedUnitCost !== null ? amount(l.estimatedUnitCost, l.currency) : '—'}</td>
                    <td data-label="Estimate" className={TD_MUTED}>{l.estimatedUnitCost !== null ? amount(Number(l.quantity) * Number(l.estimatedUnitCost), l.currency) : '—'}</td>
                  </tr>
                ))}
                <tr className="font-semibold"><td className={TD} colSpan={3}>Estimated total</td><td className={TD}>{amount(estimate)}</td></tr>
              </tbody>
            </table>
          </ResponsiveTable>

          <div className="grid gap-6 md:grid-cols-2">
            {s === 'DRAFT' && canRaise ? (
              <form action={submitRequisitionFormAction} className={`${CARD} relative`}><FormPendingOverlay /><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Submit for approval</h2><input type="hidden" name="requisitionId" value={r.id} /><SubmitButton label="Submit" pendingLabel="Submitting…" className={`${BTN} mt-3`} /></form>
            ) : null}
            {s === 'SUBMITTED' && canApprove ? (
              mine ? <div className={CARD}><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Awaiting approval</h2><p className="mt-1 text-sm text-[var(--ejo-text-muted)]">You raised this requisition, so another approver decides it.</p></div> : (
                <>
                  <form action={approveRequisitionFormAction} className={`${CARD} relative border-[var(--ejo-success)]/40`}><FormPendingOverlay /><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Approve</h2><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Procurement can then raise the purchase order.</p><input type="hidden" name="requisitionId" value={r.id} /><SubmitButton label="Approve requisition" pendingLabel="Approving…" className={`${BTN} mt-3`} /></form>
                  <form action={rejectRequisitionFormAction} className={`${CARD} relative space-y-3`}><FormPendingOverlay /><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Reject</h2><input type="hidden" name="requisitionId" value={r.id} /><label className={LABEL}>Why<input name="reason" required minLength={3} maxLength={500} className={`${INPUT} mt-1`} /></label><SubmitButton label="Reject requisition" pendingLabel="Rejecting…" className={BTN_DANGER} /></form>
                </>
              )
            ) : null}
            {s === 'APPROVED' && canManage ? (
              <div className={`${CARD} border-[var(--ejo-primary)]/40`}><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Order it</h2><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Starts a purchase order with these lines.</p><LoadingLink href={`/procurement/orders/new?requisition=${r.id}`} className={`${BTN} mt-3 inline-block`}>Create purchase order</LoadingLink></div>
            ) : null}
            {s === 'REJECTED' && canRaise ? (
              <form action={reopenRequisitionFormAction} className={`${CARD} relative`}><FormPendingOverlay /><h2 className="text-sm font-semibold text-[var(--ejo-text)]">Reopen as a draft</h2><input type="hidden" name="requisitionId" value={r.id} /><SubmitButton label="Reopen" pendingLabel="Reopening…" className={`${BTN_LINE} mt-3`} /></form>
            ) : null}
            {['DRAFT', 'SUBMITTED', 'APPROVED'].includes(s) && (mine || canManage) ? (
              <details className={CARD}><summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">Cancel this requisition</summary><form action={cancelRequisitionFormAction} className="relative mt-3 space-y-3"><FormPendingOverlay /><input type="hidden" name="requisitionId" value={r.id} /><label className={LABEL}>Reason<input name="reason" maxLength={500} className={`${INPUT} mt-1`} /></label><SubmitButton label="Cancel requisition" pendingLabel="Cancelling…" className={BTN_DANGER} /></form></details>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className={`${CARD} grid gap-3`}>
            <Field label="Raised by">{r.raisedBy.fullName} · {when(r.createdAt)}</Field>
            <Field label="Needed by">{r.neededBy ? day(r.neededBy) : 'Not set'}</Field>
            <Field label="Purchase orders">{r.purchaseOrders.length ? r.purchaseOrders.map((o) => <span key={o.id} className="block"><LoadingLink href={`/procurement/orders/${o.id}`} className={LINK}>{o.number}</LoadingLink> <StatusChip status={o.status} label={PO_STATUS_LABEL[o.status as PurchaseOrderStatus]} tone={PO_STATUS_TONE[o.status as PurchaseOrderStatus]} /></span>) : 'None yet'}</Field>
          </div>
          <div className={CARD}>
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
            <AuditTrail entries={trail.map((e) => { const m = (e.metadata ?? {}) as Record<string, unknown>; return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: typeof m.reason === 'string' ? `Reason: ${m.reason}` : typeof m.purchaseOrder === 'string' ? m.purchaseOrder : null, dateLabel: when(e.createdAt) }; })} />
          </div>
        </div>
      </div>
    </div>
  );
}
