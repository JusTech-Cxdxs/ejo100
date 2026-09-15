'use client';

import { useEffect, useRef, useState } from 'react';
import { LoadingLink } from './LoadingLink';
import { listEligibleSupervisorsForVehicleType, type EligibleSupervisor } from '@/lib/actions/workshop';

type AsyncState = 'idle' | 'loading' | 'success' | 'error';

/**
 * The same real logic CustomerVehiclePicker already proved — fetch
 * eligible supervisors for a real vehicle's own Passenger/Commercial
 * type, Master Admin standing in only when nobody's genuinely placed
 * into that department yet. Deliberately its own standalone
 * component rather than reused inline: this one takes vehicleType as
 * a fixed, already-known prop (the vehicle itself was chosen
 * somewhere else entirely), not something cascading from a Customer
 * selection the way CustomerVehiclePicker's own version is.
 */
export function SupervisorPicker({ vehicleType }: { vehicleType: 'PASSENGER' | 'COMMERCIAL' | null }) {
  const [supervisors, setSupervisors] = useState<EligibleSupervisor[]>([]);
  const [usingFallback, setUsingFallback] = useState(false);
  const [state, setState] = useState<AsyncState>('idle');
  const requestId = useRef(0);

  useEffect(() => {
    if (!vehicleType) {
      setSupervisors([]);
      setState('idle');
      return;
    }
    const id = ++requestId.current;
    setState('loading');
    listEligibleSupervisorsForVehicleType(vehicleType)
      .then((result) => {
        if (id !== requestId.current) return;
        setSupervisors(result.supervisors);
        setUsingFallback(result.usingFallback);
        setState('success');
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setSupervisors([]);
        setState('error');
      });
  }, [vehicleType]);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
        Assign to supervisor <span className="text-[var(--ejo-error)]">*</span>
      </label>
      {!vehicleType ? (
        <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 px-3 py-2 text-xs text-[var(--ejo-warning)]">
          This vehicle has no Passenger/Commercial type on file — set it on the{' '}
          <LoadingLink href="/workshop/vehicles" className="underline">Vehicles page</LoadingLink> first.
        </p>
      ) : state === 'loading' ? (
        <p className="flex items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading eligible supervisors…
        </p>
      ) : state === 'error' ? (
        <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-3 py-2 text-xs text-[var(--ejo-error)]">
          Could not load eligible supervisors — reload and try again.
        </p>
      ) : supervisors.length === 0 ? (
        <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-3 py-2 text-xs text-[var(--ejo-error)]">
          No eligible supervisor or Master Administrator is currently active.
        </p>
      ) : (
        <select
          name="supervisorId"
          required
          defaultValue=""
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        >
          <option value="" disabled>Select a supervisor…</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>{s.fullName}</option>
          ))}
        </select>
      )}
      {state === 'success' && usingFallback ? (
        <p className="mt-1 text-[11px] text-[var(--ejo-warning)]">
          No one is placed in this vehicle&apos;s Workshop department as a Supervisor yet — showing Master
          Administrators as a stand-in until that&apos;s set up.
        </p>
      ) : null}
    </div>
  );
}
