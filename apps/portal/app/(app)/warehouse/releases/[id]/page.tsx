import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getRelease, getReleaseAuditTrail, listPickableUnits } from '@/lib/actions/warehouse';
import { pickReleaseLineFormAction, unpickReleaseLineFormAction, releaseGoodsFormAction } from '@/lib/actions/warehouse-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { AuditTrail } from '@/components/AuditTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { BackLink, PageTitle, StatusChip } from '@/components/ui';
import { RELEASE_STATUS_LABEL, UNIT_STATUS_LABEL, UNIT_STATUS_TONE, linesLeftToPick, type ReleaseStatus, type UnitStatus } from '@/lib/warehouse-core';
import { Banners, BTN, BTN_LINE, CARD, Field, INPUT, LINK, Steps, when, humanise } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { picked: 'Unit picked.', unpicked: 'Pick undone — the unit is back in stock.', released: 'Goods released — hand them to dispatch.' };
const ACTION_LABEL: Record<string, string> = { 'release.line_picked': 'Unit picked', 'release.picked': 'Last unit picked — ready to release', 'release.line_unpicked': 'Pick undone', 'release.released': 'Released', 'release.issued': 'Issued by Finance' };

/** Pick the serials for each line of a release note, then release the goods. */
export default async function ReleasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/releases');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [r, trail] = await Promise.all([getRelease(id), getReleaseAuditTrail(id)]);
  if (!r) notFound();
  const branchId = r.salesOrder.branchId;
  const [canFg, canDispatch, canSales] = await Promise.all([allows('warehouse.fg.operate', { branchId, homeBranch: true }), allows('warehouse.dispatch', { branchId, homeBranch: true }), allows('sales.view', { branchId })]);
  const s = r.status as ReleaseStatus;
  const open = s === 'ISSUED' || s === 'PICKED';
  const pickLines = r.lines.map((l) => ({ id: l.id, productId: l.salesOrderLine.productId, configurationId: l.salesOrderLine.configurationId, serialised: l.salesOrderLine.product.serialised, finishedUnitId: l.finishedUnitId }));
  const left = linesLeftToPick(pickLines);
  const options = canFg && open ? await Promise.all(r.lines.map(async (l) => (l.salesOrderLine.product.serialised && !l.finishedUnitId ? listPickableUnits(l.id) : []))) : r.lines.map(() => []);
  const steps = [
    { label: 'Cleared by Finance', done: true, who: r.clearedBy, at: r.issuedAt },
    { label: 'Picked', done: Boolean(r.pickedAt), who: r.pickedBy, at: r.pickedAt, hint: left ? `${left} ${left === 1 ? 'line' : 'lines'} to pick` : undefined },
    { label: 'Released', done: Boolean(r.releasedAt), who: r.releasedBy, at: r.releasedAt },
    { label: 'Dispatched', done: Boolean(r.dispatch), at: r.dispatch?.dispatchedAt ?? null, who: r.dispatch?.number ?? null },
    { label: 'Delivered', done: Boolean(r.dispatch?.deliveredAt), at: r.dispatch?.deliveredAt ?? null },
  ];
  return (
    <div className="p-8">
      <BackLink href="/warehouse/releases" label="Back to Goods release notes" />
      <Banners status={status} error={error} map={BANNER} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="clipboard">{r.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            {canSales ? <LoadingLink href={`/sales/orders/${r.salesOrder.id}`} className={LINK}>{r.salesOrder.number}</LoadingLink> : r.salesOrder.number} · {r.salesOrder.customer.fullName} · {humanise(r.salesOrder.channel)} · {r.salesOrder.branch.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={s} label={RELEASE_STATUS_LABEL[s]} className="px-3 py-1 text-sm" />
          <PrintMenu orgHref={`/print/release-note/${r.id}`} clientHref={`/print/release-note/${r.id}?variant=client`} clientLabel="Customer copy" />
        </div>
      </div>
      <Steps steps={steps} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className={`${CARD} space-y-4`}>
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Lines</h2>
            {r.lines.map((l, i) => (
              <div key={l.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">
                    <p className="font-medium text-[var(--ejo-text)]">{l.salesOrderLine.product.name}{l.salesOrderLine.configuration ? ` · ${l.salesOrderLine.configuration.name}` : ''}</p>
                    <p className="text-xs text-[var(--ejo-text-muted)]">{l.salesOrderLine.description} · {l.salesOrderLine.product.sku}{!l.salesOrderLine.product.serialised ? ` · × ${l.quantity} by quantity` : ''}</p>
                  </div>
                  {l.finishedUnit ? (
                    <div className="flex items-center gap-2 text-sm">
                      <LoadingLink href={`/warehouse/finished-goods/${l.finishedUnit.id}`} className={`${LINK} font-mono`}>{l.finishedUnit.serialNumber}</LoadingLink>
                      <StatusChip status={l.finishedUnit.status} label={UNIT_STATUS_LABEL[l.finishedUnit.status as UnitStatus]} tone={UNIT_STATUS_TONE[l.finishedUnit.status as UnitStatus]} />
                      {canFg && open ? (
                        <form action={unpickReleaseLineFormAction} className="relative"><FormPendingOverlay /><input type="hidden" name="releaseId" value={r.id} /><input type="hidden" name="releaseLineId" value={l.id} /><SubmitButton label="Unpick" pendingLabel="…" className={`${BTN_LINE} px-2 py-1 text-xs`} ariaLabel={`Unpick line ${i + 1}`} /></form>
                      ) : null}
                    </div>
                  ) : !l.salesOrderLine.product.serialised ? <span className="text-xs text-[var(--ejo-text-muted)]">Nothing to pick by serial</span> : canFg && open ? (
                    options[i]!.length === 0 ? <span className="text-xs text-[var(--ejo-warning)]">No unit of this product in stock at {r.salesOrder.branch.name}.</span> : (
                      <form action={pickReleaseLineFormAction} className="relative flex items-end gap-2">
                        <FormPendingOverlay />
                        <input type="hidden" name="releaseId" value={r.id} />
                        <input type="hidden" name="releaseLineId" value={l.id} />
                        <label className="block text-xs font-medium text-[var(--ejo-text-muted)]">Serial
                          <select name="unitId" required className={`${INPUT} mt-1 min-w-[260px]`} aria-label={`Serial for line ${i + 1}`}>
                            {options[i]!.map((u) => <option key={u.id} value={u.id}>{u.serialNumber} — {u.location.name}{u.status === 'RESERVED' ? ' (reserved for this order)' : ''}{u.configuration ? ` · ${u.configuration.name}` : ''}</option>)}
                          </select>
                        </label>
                        <SubmitButton label="Pick" pendingLabel="Picking…" className={BTN} ariaLabel={`Pick line ${i + 1}`} />
                      </form>
                    )
                  ) : <span className="text-xs text-[var(--ejo-text-muted)]">Not picked yet</span>}
                </div>
              </div>
            ))}
          </div>

          {canFg && s === 'PICKED' ? (
            <form action={releaseGoodsFormAction} className={`${CARD} relative border-[var(--ejo-success)]/40`}>
              <FormPendingOverlay />
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Release the goods</h2>
              <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Every line has its serial. Releasing marks the units released and the sales order ready for dispatch.</p>
              <input type="hidden" name="releaseId" value={r.id} />
              <SubmitButton label="Mark released" pendingLabel="Releasing…" className={`${BTN} mt-3`} />
            </form>
          ) : null}
          {s === 'RELEASED' && !r.dispatch && canDispatch ? (
            <div className={`${CARD} border-[var(--ejo-primary)]/40`}>
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Ready for dispatch</h2>
              <LoadingLink href={`/warehouse/dispatches/new?release=${r.id}`} className={`${BTN} mt-3 inline-block`}>Record the dispatch</LoadingLink>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className={`${CARD} grid gap-3`}>
            <Field label="Deliver to">{r.salesOrder.deliveryAddress ?? 'Collection / as per the order'}</Field>
            <Field label="Customer reference">{r.salesOrder.customerReference ?? '—'}</Field>
            <Field label="Contact">{[r.salesOrder.customer.phone, r.salesOrder.customer.email].filter(Boolean).join(' · ') || '—'}</Field>
            <Field label="Notes from Finance / Sales">{r.notes ?? '—'}</Field>
            {r.dispatch ? <Field label="Dispatch"><LoadingLink href={`/warehouse/dispatches/${r.dispatch.id}`} className={LINK}>{r.dispatch.number}</LoadingLink> · {humanise(r.dispatch.status)}</Field> : null}
          </div>
          <div className={CARD}>
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit trail</h2>
            <AuditTrail entries={trail.map((e) => { const m = (e.metadata ?? {}) as Record<string, unknown>; return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: typeof m.serialNumber === 'string' ? m.serialNumber : null, dateLabel: when(e.createdAt) }; })} />
          </div>
        </div>
      </div>
    </div>
  );
}
