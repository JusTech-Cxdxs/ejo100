import { allows, guardAnyPage } from '@/lib/authz/server';
import { listAdjustments, listFinishedUnits } from '@/lib/actions/warehouse';
import { requireUser } from '@/lib/actions/workshop';
import { decideUnitAdjustmentFormAction, requestUnitAdjustmentFormAction } from '@/lib/actions/warehouse-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, RevealPanel, SectionCard } from '@/components/ui';
import { Banners, BTN, BTN_DANGER, BTN_LINE, INPUT, LABEL, LINK, day } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { adjustment_requested: 'Adjustment raised — the unit is in quarantine until the Warehouse Manager decides.', scrapped: 'Unit scrapped and written off.', returned_to_stock: 'Unit returned to stock.' };

/** Stock adjustments on finished units: raised by the floor (quarantine), decided by the Warehouse Manager (scrap or return to stock). Components adjustments are made in the Components store. */
export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/adjustments');
  const { status, error } = await searchParams;
  const [{ pending, scrapped }, viewer, canManage, canFg, canStore] = await Promise.all([listAdjustments(), requireUser(), allows('warehouse.manage'), allows('warehouse.fg.operate'), allows('store.view')]);
  const candidates = canFg ? (await listFinishedUnits({ status: 'IN_STOCK' })).units.slice(0, 200) : [];
  return (
    <div className="p-8">
      <PageHeader icon="sliders" back={{ href: '/warehouse', label: 'Back to Warehouses' }} title="Adjustments" description={<>Damage, variances and write-offs on finished units. Raised by the floor, approved by the Warehouse Manager. {canStore ? <>Component quantities are adjusted in the <LoadingLink href="/inventory/parts" className={LINK}>Components store</LoadingLink>.</> : null}</>} />
      <Banners status={status} error={error} map={BANNER} />

      {canFg ? (
        <div className="mb-6 max-w-3xl">
          <RevealPanel label="Raise an adjustment" open={Boolean(error)}>
            <form action={requestUnitAdjustmentFormAction} className="relative space-y-3 p-4">
              <FormPendingOverlay />
              <input type="hidden" name="back" value="/warehouse/adjustments" />
              <label className={LABEL}>Unit (in stock)
                <select name="unitId" required className={`${INPUT} mt-1`}>
                  {candidates.map((u) => <option key={u.id} value={u.id}>{u.serialNumber} — {u.product.name} · {u.location.name}</option>)}
                </select>
              </label>
              <label className={LABEL}>What is wrong<input name="reason" required minLength={3} maxLength={300} className={`${INPUT} mt-1`} placeholder="e.g. Cracked screen found during count; box empty" /></label>
              <SubmitButton label="Raise adjustment" pendingLabel="Saving…" className={BTN_LINE} />
            </form>
          </RevealPanel>
        </div>
      ) : null}

      <SectionCard icon="alert" title={`Awaiting the Warehouse Manager (${pending.length})`} description="Quarantined units: scrap them (variance, damage) or return them to stock." className="mb-6">
        {pending.length === 0 ? <EmptyState compact icon="check" title="Nothing in quarantine." /> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <LoadingLink href={`/warehouse/finished-goods/${u.id}`} className={`${LINK} font-mono`}>{u.serialNumber}</LoadingLink> <span className="text-[var(--ejo-text-muted)]">· {u.product.name} · {u.location.name}</span>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{u.reason ?? 'No reason recorded'} — {u.raisedBy ?? 'unknown'} · {day(u.raisedAt)}</p>
                </div>
                {canManage ? (
                  u.raisedById === viewer.id ? <span className="text-xs text-[var(--ejo-text-muted)]">You raised this one — another manager decides.</span> : (
                    <form action={decideUnitAdjustmentFormAction} className="relative flex flex-wrap items-end gap-2">
                      <FormPendingOverlay />
                      <input type="hidden" name="unitId" value={u.id} />
                      <label className={LABEL}>Note<input name="note" maxLength={300} className={`${INPUT} mt-1 min-w-[200px]`} placeholder="Reason for the decision" /></label>
                      <button type="submit" name="decision" value="RETURN_TO_STOCK" className={BTN}>Return to stock</button>
                      <button type="submit" name="decision" value="SCRAP" className={BTN_DANGER}>Scrap</button>
                    </form>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard icon="trash" title="Written off recently">
        {scrapped.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">Nothing scrapped yet.</p> : (
          <ul className="divide-y divide-[var(--ejo-border)] text-sm">
            {scrapped.map((u) => <li key={u.id} className="flex justify-between py-2"><span><LoadingLink href={`/warehouse/finished-goods/${u.id}`} className={`${LINK} font-mono`}>{u.serialNumber}</LoadingLink> <span className="text-[var(--ejo-text-muted)]">· {u.product.name} · {u.location.name}</span></span><span className="text-[var(--ejo-text-muted)]">{day(u.updatedAt)}</span></li>)}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
