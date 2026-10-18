import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getSupplierClaim, getSupplierClaimAuditTrail } from '@/lib/actions/procurement';
import { sendSupplierClaimFormAction, decideSupplierClaimFormAction, settleSupplierClaimFormAction, closeSupplierClaimFormAction } from '@/lib/actions/procurement-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { AuditTrail } from '@/components/AuditTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { BackLink, PageTitle, StatusChip } from '@/components/ui';
import { CLAIM_STATUS_LABEL, type SupplierClaimStatus } from '@/lib/procurement-core';
import { Banners, BTN, BTN_DANGER, BTN_LINE, CARD, Field, INPUT, LABEL, LINK, Steps, amount, when } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { created: 'Claim raised — send it to the supplier when ready.', sent: 'Sent to the supplier.', accepted: 'Supplier accepted the claim — record the settlement when it lands.', rejected: 'Supplier rejected the claim.', settled: 'Settlement recorded.', closed: 'Claim closed.' };
const ACTION_LABEL: Record<string, string> = { 'supplier_claim.created': 'Raised', 'supplier_claim.sent': 'Sent to the supplier', 'supplier_claim.accepted': 'Accepted by the supplier', 'supplier_claim.rejected': 'Rejected by the supplier', 'supplier_claim.settled': 'Settled', 'supplier_claim.closed': 'Closed' };

export default async function SupplierClaimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/claims');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [c, trail] = await Promise.all([getSupplierClaim(id), getSupplierClaimAuditTrail(id)]);
  if (!c) notFound();
  const ctx = c.purchaseOrder ? { branchId: c.purchaseOrder.branchId, homeBranch: true } : undefined;
  const [canManage, canDecide, canStore] = await Promise.all([allows('procurement.po.manage', ctx), allows('procurement.po.approve', ctx), allows('store.view')]);
  const s = c.status as SupplierClaimStatus;
  return (
    <div className="p-8">
      <BackLink href="/procurement/claims" label="Back to Supplier claims" />
      <Banners status={status} error={error} map={BANNER} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="alert">{c.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]"><LoadingLink href={`/procurement/suppliers/${c.supplier.id}`} className={LINK}>{c.supplier.name}</LoadingLink> · {amount(c.amount, c.currency)}{c.purchaseOrder ? <> · <LoadingLink href={`/procurement/orders/${c.purchaseOrder.id}`} className={LINK}>{c.purchaseOrder.number}</LoadingLink></> : null}{c.goodsReceipt ? <> · {canStore ? <LoadingLink href={`/inventory/goods-receipts/${c.goodsReceipt.id}`} className={LINK}>{c.goodsReceipt.referenceNumber}</LoadingLink> : c.goodsReceipt.referenceNumber}</> : null}</p>
        </div>
        <StatusChip status={s} label={CLAIM_STATUS_LABEL[s]} className="px-3 py-1 text-sm" />
      </div>
      <Steps steps={[{ label: 'Raised', done: true, who: c.raisedBy, at: c.createdAt }, { label: 'Sent', done: ['SENT', 'ACCEPTED', 'REJECTED', 'SETTLED'].includes(s) || (s === 'CLOSED' && Boolean(c.settledAt)) }, { label: s === 'REJECTED' ? 'Rejected' : 'Accepted', done: ['ACCEPTED', 'REJECTED', 'SETTLED'].includes(s) || Boolean(c.settledAt), hint: 'Head of Procurement records the answer' }, { label: 'Settled', done: Boolean(c.settledAt), at: c.settledAt, who: c.reference }]} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className={CARD}>
            <p className="text-xs font-medium text-[var(--ejo-text-muted)]">What happened</p>
            <p className="mt-1 whitespace-pre-line text-sm text-[var(--ejo-text)]">{c.description}</p>
            {c.warrantyClaimId ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Warranty claim: {c.warrantyClaimId}</p> : null}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {(s === 'OPEN' || s === 'REJECTED') && canManage ? (
              <form action={sendSupplierClaimFormAction} className={`${CARD} relative`}><FormPendingOverlay /><h2 className="text-sm font-semibold text-[var(--ejo-text)]">{s === 'REJECTED' ? 'Send again' : 'Send to the supplier'}</h2><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Email the claim to {c.supplier.contactName ?? c.supplier.name}{c.supplier.email ? ` (${c.supplier.email})` : ''}, then mark it sent.</p><input type="hidden" name="claimId" value={c.id} /><SubmitButton label="Mark as sent" pendingLabel="Saving…" className={`${BTN} mt-3`} /></form>
            ) : null}
            {s === 'SENT' && canDecide ? (
              <form action={decideSupplierClaimFormAction} className={`${CARD} relative space-y-3`}>
                <FormPendingOverlay />
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">The supplier&apos;s answer</h2>
                <input type="hidden" name="claimId" value={c.id} />
                <label className={LABEL}>What they said<input name="note" maxLength={500} className={`${INPUT} mt-1`} placeholder="Required when rejected" /></label>
                <div className="flex gap-2"><button type="submit" name="decision" value="ACCEPTED" className={BTN}>Accepted</button><button type="submit" name="decision" value="REJECTED" className={BTN_DANGER}>Rejected</button></div>
              </form>
            ) : s === 'SENT' ? <div className={CARD}><h2 className="text-sm font-semibold text-[var(--ejo-text)]">With the supplier</h2><p className="mt-1 text-sm text-[var(--ejo-text-muted)]">The Head of Procurement records their answer.</p></div> : null}
            {s === 'ACCEPTED' && canManage ? (
              <form action={settleSupplierClaimFormAction} className={`${CARD} relative space-y-3 border-[var(--ejo-success)]/40`}>
                <FormPendingOverlay />
                <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Record the settlement</h2>
                <input type="hidden" name="claimId" value={c.id} />
                <label className={LABEL}>Reference (credit note, refund, replacement shipment)<input name="reference" required minLength={2} maxLength={120} className={`${INPUT} mt-1`} /></label>
                <label className={LABEL}>Amount settled ({c.currency})<input name="amount" type="number" min="0" step="0.01" defaultValue={Number(c.amount)} className={`${INPUT} mt-1`} /></label>
                <SubmitButton label="Mark settled" pendingLabel="Saving…" className={BTN} />
              </form>
            ) : null}
            {s !== 'CLOSED' && canManage ? (
              <details className={CARD}><summary className="cursor-pointer text-sm font-semibold text-[var(--ejo-text)]">Close this claim</summary><form action={closeSupplierClaimFormAction} className="relative mt-3 space-y-3"><FormPendingOverlay /><input type="hidden" name="claimId" value={c.id} /><label className={LABEL}>Note<input name="note" maxLength={500} className={`${INPUT} mt-1`} /></label><SubmitButton label="Close claim" pendingLabel="Closing…" className={BTN_LINE} /></form></details>
            ) : null}
          </div>
        </div>
        <div className="space-y-6">
          <div className={`${CARD} grid gap-3`}>
            <Field label="Supplier contact">{[c.supplier.contactName, c.supplier.email].filter(Boolean).join(' · ') || '—'}</Field>
            <Field label="Raised">{c.raisedBy ?? '—'} · {when(c.createdAt)}</Field>
            {c.settledAt ? <Field label="Settled">{when(c.settledAt)} · {c.reference}</Field> : null}
          </div>
          <div className={CARD}>
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
            <AuditTrail entries={trail.map((e) => { const m = (e.metadata ?? {}) as Record<string, unknown>; return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: [typeof m.note === 'string' ? m.note : null, typeof m.reference === 'string' ? `Ref ${m.reference}` : null, typeof m.amount === 'number' ? amount(m.amount, typeof m.currency === 'string' ? m.currency : c.currency) : null].filter(Boolean).join(' · ') || null, dateLabel: when(e.createdAt) }; })} />
          </div>
        </div>
      </div>
    </div>
  );
}
