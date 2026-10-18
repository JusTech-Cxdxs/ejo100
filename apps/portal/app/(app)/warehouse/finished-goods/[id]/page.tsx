import { allows, guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getFinishedUnit, getFinishedUnitAuditTrail, listFgLocations } from '@/lib/actions/warehouse';
import { moveFinishedUnitFormAction, quarantineFinishedUnitFormAction, requestUnitAdjustmentFormAction } from '@/lib/actions/warehouse-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { AuditTrail } from '@/components/AuditTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { BackLink, PageTitle, StatusChip, SectionCard } from '@/components/ui';
import { UNIT_STATUS_LABEL, UNIT_STATUS_TONE, MOVABLE_STATUSES, type UnitStatus } from '@/lib/warehouse-core';
import { Banners, BTN, BTN_LINE, BTN_DANGER, CARD, Field, INPUT, LABEL, LINK, when, day, amount, humanise } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = {
  moved: 'Unit moved.', quarantined: 'Unit put in quarantine.', back_in_stock: 'Unit returned to stock.', adjustment_requested: 'Adjustment raised — the unit is in quarantine until the Warehouse Manager decides.',
};
const ACTION_LABEL: Record<string, string> = {
  'finished_unit.received': 'Received into stock', 'finished_unit.moved': 'Moved', 'finished_unit.quarantined': 'Quarantined', 'finished_unit.returned_to_stock': 'Returned to stock',
  'finished_unit.adjustment_requested': 'Adjustment raised', 'finished_unit.scrapped': 'Scrapped', 'finished_unit.reserved_for_transfer': 'Reserved for a transfer', 'finished_unit.picked': 'Picked for an order',
  'finished_unit.unpicked': 'Pick undone', 'finished_unit.released': 'Released', 'finished_unit.dispatched': 'Dispatched', 'finished_unit.sold': 'Sold — delivered to the customer',
};

/** One unit for life: product, configuration, where it is, its history, and the production, sales, dispatch and warranty records it is on. */
export default async function FinishedUnitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/finished-goods');
  const { id } = await params;
  const { status, error } = await searchParams;
  const [u, trail] = await Promise.all([getFinishedUnit(id), getFinishedUnitAuditTrail(id)]);
  if (!u) notFound();
  const branchId = u.location.branchId;
  const [canFg, canManage, canProduction, canSales, canWarranty, canService, canCrm] = await Promise.all([
    allows('warehouse.fg.operate', { branchId, homeBranch: true }), allows('warehouse.manage', { branchId, homeBranch: true }), allows('production.view', { branchId }), allows('sales.view', { branchId }), allows('warranty.view'), allows('service.view', { branchId }), allows('crm.view'),
  ]);
  const locations = canFg || canManage ? (await listFgLocations()).filter((l) => l.branchId === branchId && l.id !== u.locationId) : [];
  const s = u.status as UnitStatus;
  const movable = (MOVABLE_STATUSES as string[]).includes(s);
  return (
    <div className="p-8">
      <BackLink href="/warehouse/finished-goods" label="Back to Finished goods" />
      <Banners status={status} error={error} map={BANNER} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="package"><span className="font-mono">{u.serialNumber}</span></PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{u.product.name}{u.configuration ? ` · ${u.configuration.name}` : ''} · {u.product.sku}</p>
        </div>
        <StatusChip status={s} label={UNIT_STATUS_LABEL[s]} tone={UNIT_STATUS_TONE[s]} className="px-3 py-1 text-sm" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className={`${CARD} grid gap-4 sm:grid-cols-3`}>
            <Field label="Product">{u.product.name}<span className="block text-xs text-[var(--ejo-text-muted)]">{humanise(u.product.family)} · {u.product.subBrand}</span></Field>
            <Field label="Configuration">{u.configuration ? `${u.configuration.name} (${u.configuration.code})` : 'Standard'}</Field>
            <Field label="Location">{u.location.name}<span className="block text-xs text-[var(--ejo-text-muted)]">{humanise(u.location.kind)} · {u.location.branch.name}</span></Field>
            <Field label="Received into stock">{when(u.receivedAt)}</Field>
            <Field label="Sold">{u.soldAt ? day(u.soldAt) : 'Not yet'}</Field>
            {canManage && u.costPrice !== null ? <Field label="Cost">{amount(u.costPrice)}</Field> : null}
            <Field label="Built on the line">{u.productionUnit ? (canProduction ? <LoadingLink href={`/production/units/${u.productionUnit.id}`} className={LINK}>{u.productionUnit.number}</LoadingLink> : u.productionUnit.number) : 'Bought finished'}</Field>
            <Field label="Sales order">{u.salesOrder ? <>{canSales ? <LoadingLink href={`/sales/orders/${u.salesOrder.id}`} className={LINK}>{u.salesOrder.number}</LoadingLink> : u.salesOrder.number}<span className="block text-xs text-[var(--ejo-text-muted)]">{u.salesOrder.customer.fullName} · {humanise(u.salesOrder.status)}</span></> : '—'}</Field>
            <Field label="Dispatch">{u.dispatch ? <LoadingLink href={`/warehouse/dispatches/${u.dispatch.id}`} className={LINK}>{u.dispatch.number}</LoadingLink> : '—'}</Field>
            <Field label="Customer">{u.customer ? (canCrm ? <LoadingLink href={`/crm/customers/${u.customer.id}`} className={LINK}>{u.customer.fullName}</LoadingLink> : u.customer.fullName) : '—'}</Field>
            <Field label="Warranty">{u.warranties.length ? u.warranties.map((w) => <span key={w.id} className="block">{canWarranty ? <LoadingLink href={`/warranty/${w.id}`} className={LINK}>{w.warrantyNumber}</LoadingLink> : w.warrantyNumber} · {humanise(w.status)} · to {day(w.endsAt)}</span>) : `None yet (${u.product.defaultWarrantyMonths} months from sale)`}</Field>
            <Field label="Service jobs">{u.serviceJobs.length ? u.serviceJobs.map((j) => <span key={j.id} className="block">{canService ? <LoadingLink href={`/service/jobs/${j.id}`} className={LINK}>{j.number}</LoadingLink> : j.number} · {humanise(j.status)}</span>) : '—'}</Field>
          </div>

          {u.transferLines.length ? (
            <SectionCard icon="road" title="Transfers">
              <ul className="text-sm">{u.transferLines.map((t) => <li key={t.transfer.id}><LoadingLink href={`/warehouse/transfers/${t.transfer.id}`} className={LINK}>{t.transfer.number}</LoadingLink> · {humanise(t.transfer.status)} · {day(t.transfer.createdAt)}</li>)}</ul>
            </SectionCard>
          ) : null}

          {(canFg || canManage) && (movable || s === 'QUARANTINE' || s === 'RESERVED') ? (
            <div className="grid gap-6 md:grid-cols-2">
              {canFg && movable && locations.length ? (
                <form action={moveFinishedUnitFormAction} className={`${CARD} relative space-y-3`}>
                  <FormPendingOverlay />
                  <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Move to another location</h2>
                  <input type="hidden" name="unitId" value={u.id} />
                  <label className={LABEL}>Location<select name="locationId" required className={`${INPUT} mt-1`}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                  <label className={LABEL}>Note<input name="note" maxLength={200} className={`${INPUT} mt-1`} placeholder="Optional" /></label>
                  <SubmitButton label="Move unit" pendingLabel="Moving…" className={BTN} />
                  <p className="text-xs text-[var(--ejo-text-muted)]">To another branch, use a stock transfer.</p>
                </form>
              ) : null}
              {canManage ? (
                <form action={quarantineFinishedUnitFormAction} className={`${CARD} relative space-y-3`}>
                  <FormPendingOverlay />
                  <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{s === 'QUARANTINE' ? 'Return to stock' : 'Quarantine'}</h2>
                  <input type="hidden" name="unitId" value={u.id} />
                  <input type="hidden" name="quarantine" value={s === 'QUARANTINE' ? '0' : '1'} />
                  <label className={LABEL}>Reason<input name="reason" required minLength={3} maxLength={300} className={`${INPUT} mt-1`} placeholder={s === 'QUARANTINE' ? 'e.g. Rechecked, works' : 'e.g. Screen damage found'} /></label>
                  <SubmitButton label={s === 'QUARANTINE' ? 'Return to stock' : 'Quarantine unit'} pendingLabel="Saving…" className={s === 'QUARANTINE' ? BTN : BTN_DANGER} />
                  {s === 'QUARANTINE' ? <p className="text-xs text-[var(--ejo-text-muted)]">To write it off instead, decide it under <LoadingLink href="/warehouse/adjustments" className={LINK}>Adjustments</LoadingLink>.</p> : null}
                </form>
              ) : canFg && s !== 'QUARANTINE' ? (
                <form action={requestUnitAdjustmentFormAction} className={`${CARD} relative space-y-3`}>
                  <FormPendingOverlay />
                  <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Raise an adjustment</h2>
                  <p className="text-xs text-[var(--ejo-text-muted)]">Damage, a count variance or a missing unit: it goes to quarantine until the Warehouse Manager decides.</p>
                  <input type="hidden" name="unitId" value={u.id} />
                  <label className={LABEL}>What is wrong<input name="reason" required minLength={3} maxLength={300} className={`${INPUT} mt-1`} /></label>
                  <SubmitButton label="Raise adjustment" pendingLabel="Saving…" className={BTN_LINE} />
                </form>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={CARD}>
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">History</h2>
          <AuditTrail entries={trail.map((e) => {
            const m = (e.metadata ?? {}) as Record<string, unknown>;
            const parts = [
              typeof m.referenceNumber === 'string' ? m.referenceNumber : null,
              typeof m.from === 'string' && typeof m.to === 'string' ? `${m.from} → ${m.to}` : typeof m.to === 'string' ? `to ${m.to}` : null,
              typeof m.location === 'string' ? m.location : null,
              typeof m.salesOrder === 'string' ? m.salesOrder : null,
              typeof m.reason === 'string' ? `Reason: ${m.reason}` : null,
              typeof m.note === 'string' ? m.note : null,
            ].filter(Boolean);
            return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: parts.join(' · ') || null, dateLabel: when(e.createdAt) };
          })} />
        </div>
      </div>
    </div>
  );
}
