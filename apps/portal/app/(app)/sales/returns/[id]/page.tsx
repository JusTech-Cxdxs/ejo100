import { guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getSalesReturn, getSalesReturnAuditTrail, getSalesRights } from '@/lib/actions/sales';
import { requireUser } from '@/lib/actions/workshop';
import { humanizeAction } from '@/lib/humanize-action';
import { approveSalesReturnFormAction, rejectSalesReturnFormAction, receiveSalesReturnFormAction, resolveSalesReturnFormAction } from '@/lib/actions/sales-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { AuditTrail } from '@/components/AuditTrail';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { BackLink, PageTitle, StatusChip, SectionCard } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/format-date';
import { RETURN_STATUS_LABEL, RETURN_RESOLUTION_LABEL, type ReturnStatus } from '@/lib/sales-core';
import { INPUT, LABEL, BTN, BTN_LINE } from '@/components/sales/ui';

const BANNER: Record<string, string> = {
  requested: 'Return requested — the Sales Manager has been notified.',
  approved: 'Return approved. Receive the unit into quarantine when it arrives.',
  rejected: 'Return rejected.',
  received: 'Received into quarantine.',
  resolved: 'Return resolved.',
};
const ACTION_LABEL: Record<string, string> = {
  'sales_return.requested': 'Return requested', 'sales_return.approved': 'Approved', 'sales_return.rejected': 'Rejected', 'sales_return.received': 'Received into quarantine', 'sales_return.resolved': 'Resolved',
};

export default async function SalesReturnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { id } = await params;
  const { status, error } = await searchParams;
  const r = await getSalesReturn(id);
  if (!r) notFound();
  const [trail, rights, viewer] = await Promise.all([getSalesReturnAuditTrail(id), getSalesRights(r.salesOrder.branchId), requireUser()]);
  const own = r.requestedById === viewer.id;
  const mayDecide = rights.approve && r.status === 'REQUESTED' && !own;
  const mayReceive = (rights.quote || rights.fg) && r.status === 'APPROVED';
  const mayResolve = (rights.quote || rights.approve) && ['APPROVED', 'RECEIVED'].includes(r.status);
  return (
    <div className="p-8">
      <BackLink href="/sales/returns" label="Back to Returns" />
      {status && BANNER[status] ? <div className="max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="refund">{r.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Order <LoadingLink href={`/sales/orders/${r.salesOrder.id}`} className="text-[var(--ejo-primary)] hover:underline">{r.salesOrder.number}</LoadingLink> · {r.salesOrder.customer.fullName}</p>
        </div>
        <StatusChip status={r.status} label={RETURN_STATUS_LABEL[r.status as ReturnStatus]} className="px-3 py-1 text-sm" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SectionCard icon="info" title="The return">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Reason</dt><dd className="whitespace-pre-line text-[var(--ejo-text)]">{r.reason}</dd></div>
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Serial</dt><dd className="text-[var(--ejo-text)]">{r.finishedUnit ? `${r.finishedUnit.serialNumber} · ${r.finishedUnit.product.name} · ${r.finishedUnit.status.toLowerCase().replace('_', ' ')}${r.finishedUnit.location ? ` at ${r.finishedUnit.location.name}` : ''}` : 'Not a specific serial'}</dd></div>
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Requested by</dt><dd className="text-[var(--ejo-text)]">{r.requestedById ? r.names.get(r.requestedById) ?? '—' : 'Customer portal'} · {formatDateTime(r.createdAt)}</dd></div>
              {r.approvedById ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">{r.status === 'REJECTED' ? 'Rejected by' : 'Approved by'}</dt><dd className="text-[var(--ejo-text)]">{r.names.get(r.approvedById) ?? '—'}{r.approvedAt ? ` · ${formatDateTime(r.approvedAt)}` : ''}</dd></div> : null}
              {r.receivedById ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Received by</dt><dd className="text-[var(--ejo-text)]">{r.names.get(r.receivedById) ?? '—'}{r.receivedAt ? ` · ${formatDateTime(r.receivedAt)}` : ''}</dd></div> : null}
              {r.resolution ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Resolution</dt><dd className="text-[var(--ejo-text)]">{RETURN_RESOLUTION_LABEL[r.resolution]}{r.resolvedAt ? ` · ${formatDateTime(r.resolvedAt)}` : ''}</dd></div> : null}
              {r.notes ? <div className="sm:col-span-2"><dt className="text-xs text-[var(--ejo-text-muted)]">Notes</dt><dd className="whitespace-pre-line text-[var(--ejo-text)]">{r.notes}</dd></div> : null}
            </dl>
          </SectionCard>
          <SectionCard icon="history" title="Audit trail">
            <AuditTrail entries={trail.map((e: (typeof trail)[number]) => { const meta = (e.metadata ?? {}) as Record<string, unknown>; const parts = [typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null, typeof meta.quarantine === 'string' ? `Quarantine: ${meta.quarantine}` : null, typeof meta.resolution === 'string' ? RETURN_RESOLUTION_LABEL[meta.resolution] ?? meta.resolution : null].filter(Boolean); return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: parts.join(' · ') || null, dateLabel: formatDateTime(e.createdAt) }; })} />
          </SectionCard>
        </div>
        <div className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next step</h2>
          {r.status === 'REQUESTED' && !mayDecide ? <p className="text-xs text-[var(--ejo-text-muted)]">Waiting on the Sales Manager.{own ? ' You requested this return, so someone else approves it.' : ''}</p> : null}
          {mayDecide ? (
            <>
              <form action={approveSalesReturnFormAction}><FormPendingOverlay /><input type="hidden" name="salesReturnId" value={r.id} /><SubmitButton label="Approve return" pendingLabel="Approving…" className={BTN} /></form>
              <form action={rejectSalesReturnFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="salesReturnId" value={r.id} /><input name="reason" required className={INPUT} placeholder="Why not?" /><SubmitButton label="Reject" pendingLabel="Rejecting…" className={BTN_LINE} /></form>
            </>
          ) : null}
          {mayReceive ? <form action={receiveSalesReturnFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="salesReturnId" value={r.id} /><input name="notes" className={INPUT} placeholder="Condition on arrival (optional)" /><SubmitButton label="Receive into quarantine" pendingLabel="Receiving…" className={BTN} /><p className="text-xs text-[var(--ejo-text-muted)]">{r.finishedUnit ? 'The serial is marked returned and moved to the quarantine location of its branch.' : 'No serial was named; only the return is marked received.'}</p></form> : null}
          {mayResolve ? (
            <form action={resolveSalesReturnFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="salesReturnId" value={r.id} />
              <div><label htmlFor="resolution" className={LABEL}>Outcome</label><select id="resolution" name="resolution" required className={INPUT} defaultValue="">
                <option value="" disabled>Choose…</option>{Object.entries(RETURN_RESOLUTION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <input name="notes" className={INPUT} placeholder="Replacement serial, credit note number…" />
              <SubmitButton label="Resolve return" pendingLabel="Saving…" className={BTN_LINE} />
            </form>
          ) : null}
          {['REJECTED', 'RESOLVED'].includes(r.status) ? <p className="text-xs text-[var(--ejo-text-muted)]">This return is closed.</p> : null}
        </div>
      </div>
    </div>
  );
}
