'use client';

import { useRef } from 'react';
import { stopTrackingVehicleFormAction } from '@/lib/actions/vehicle-service-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';

/**
 * "Stop tracking" opens a proper dialog — centred on screen over a dimmed
 * page, nothing covered, nothing to scroll; Esc or Cancel closes it.
 */
export function StopTrackingDialog({ vehicleId, vehicleLabel, returnTo }: { vehicleId: string; vehicleLabel: string; returnTo: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="self-start whitespace-nowrap rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]">
        Stop tracking
      </button>
      <dialog ref={ref} className="w-[min(92vw,26rem)] rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-0 text-left text-[var(--ejo-text)] shadow-xl backdrop:bg-black/40">
        <form action={stopTrackingVehicleFormAction} className="space-y-3 p-5">
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div>
            <h2 className="text-base font-semibold">Stop tracking this vehicle?</h2>
            <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{vehicleLabel} will no longer get service reminders. You can start tracking it again at any time.</p>
          </div>
          <label className="block text-xs font-medium text-[var(--ejo-text-muted)]" htmlFor={`reason-${vehicleId}`}>Reason</label>
          <input id={`reason-${vehicleId}`} name="reason" required autoFocus placeholder="e.g. customer asked, vehicle sold" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--ejo-bg)]">Cancel</button>
            <SubmitButton label="Stop tracking" pendingLabel="Stopping…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
          </div>
        </form>
      </dialog>
    </>
  );
}
