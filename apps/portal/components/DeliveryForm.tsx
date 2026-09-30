'use client';

import { useState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { VEHICLES } from '@/components/VisitArrivalFields';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/** Driver, phone and how it came — the plate box only for a vehicle. */
export function DeliveryArrivalFields() {
  const [vehicle, setVehicle] = useState('');
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label}>Driver&apos;s name</label><input name="driverName" required className={input} /></div>
        <div><label className={label}>Driver&apos;s phone</label><input name="driverPhone" type="tel" inputMode="tel" placeholder="e.g. 0803 123 4567" className={input} /></div>
      </div>
      <div>
        <label className={label}>How did the delivery come?</label>
        <select name="vehicleType" required value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={input}>
          <option value="" disabled>Tap to choose…</option>
          {VEHICLES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
        </select>
      </div>
      {vehicle && vehicle !== 'ON_FOOT' ? <div><label className={label}>Plate number</label><input name="vehiclePlate" required placeholder="e.g. KJA 453 GX" className={`${input} uppercase`} /></div> : null}
    </div>
  );
}

/** Record a delivery — at the gate now, or expected later. Nothing pre-filled. */
export function DeliveryForm({ canGate, action }: { canGate: boolean; action: (f: FormData) => Promise<void> }) {
  const [mode, setMode] = useState(canGate ? '' : 'EXPECTED');
  return (
    <form action={action} className="space-y-4">
      <FormPendingOverlay />
      {canGate ? (
        <div>
          <label className={label}>Type</label>
          <select name="mode" required value={mode} onChange={(e) => setMode(e.target.value)} className={input}>
            <option value="" disabled>Choose…</option>
            <option value="ARRIVED">At the gate now</option>
            <option value="EXPECTED">Expected later</option>
          </select>
        </div>
      ) : (
        <input type="hidden" name="mode" value="EXPECTED" />
      )}
      {mode ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label}>Supplier</label><input name="supplierName" required placeholder="e.g. ABC Auto Parts Ltd" className={input} /></div>
            <div><label className={label}>Reference (PO / waybill / invoice)</label><input name="reference" placeholder="e.g. PO-2026-0031" className={input} /></div>
          </div>
          <div><label className={label}>What is being delivered</label><textarea name="items" required rows={2} placeholder="e.g. 5 cartons of brake pads, 2 drums of engine oil" className={input} /></div>
          {mode === 'ARRIVED' ? <DeliveryArrivalFields /> : <div><label className={label}>Expected</label><input name="expectedAt" type="datetime-local" required className={input} /></div>}
          <div><label className={label}>Notes (optional)</label><input name="notes" className={input} /></div>
          <SubmitButton label={mode === 'ARRIVED' ? 'Record arrival — tell the Store' : 'Announce the delivery'} pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto" />
        </>
      ) : null}
    </form>
  );
}
