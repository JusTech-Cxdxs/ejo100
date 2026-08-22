'use client';

import { useEffect, useRef, useState } from 'react';
import { LoadingLink } from './LoadingLink';
import { CustomerSearchField } from './CustomerSearchField';
import {
  listVehiclesForCustomer,
  listEligibleSupervisorsForVehicleType,
  type VehicleSearchResult,
  type EligibleSupervisor,
} from '@/lib/actions/workshop';

type AsyncState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Real, permanent server-backed Customer → Vehicle → Supervisor
 * selection for Job Card creation — three cascading levels now, not
 * two. The third level (Supervisor) exists specifically to enforce the
 * multi-department Workshop routing rule: the moment a vehicle is
 * chosen, its Passenger/Commercial type is already known (returned
 * alongside the vehicle itself, no extra round trip), and that's used
 * to fetch only the supervisors eligible for THAT vehicle's Workshop
 * department — never a flat list of every staff member. It's
 * structurally impossible to see a Commercial-side supervisor while a
 * Passenger vehicle is selected, or vice versa.
 *
 * Customer and Vehicle levels: unchanged from before, still real Server
 * Actions called directly, not a pre-loaded/capped list.
 */
export function CustomerVehiclePicker() {
  const [customerId, setCustomerId] = useState('');
  const [vehicles, setVehicles] = useState<VehicleSearchResult[]>([]);
  const [vehiclesState, setVehiclesState] = useState<AsyncState>('idle');
  const vehiclesRequestId = useRef(0);

  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [supervisors, setSupervisors] = useState<EligibleSupervisor[]>([]);
  const [usingFallbackSupervisors, setUsingFallbackSupervisors] = useState(false);
  const [supervisorsState, setSupervisorsState] = useState<AsyncState>('idle');
  const supervisorsRequestId = useRef(0);

  useEffect(() => {
    if (!customerId) {
      setVehicles([]);
      setVehiclesState('idle');
      setSelectedVehicleId('');
      return;
    }
    const requestId = ++vehiclesRequestId.current;
    setVehiclesState('loading');
    listVehiclesForCustomer(customerId)
      .then((found) => {
        if (requestId !== vehiclesRequestId.current) return;
        setVehicles(found);
        setVehiclesState('success');
        setSelectedVehicleId(found[0]?.id ?? ''); // matches the browser's own default of selecting the first <option>
      })
      .catch(() => {
        if (requestId !== vehiclesRequestId.current) return;
        setVehicles([]);
        setVehiclesState('error');
        setSelectedVehicleId('');
      });
  }, [customerId]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  useEffect(() => {
    if (!selectedVehicle || !selectedVehicle.vehicleType) {
      setSupervisors([]);
      setSupervisorsState('idle');
      return;
    }
    const requestId = ++supervisorsRequestId.current;
    setSupervisorsState('loading');
    listEligibleSupervisorsForVehicleType(selectedVehicle.vehicleType)
      .then((result) => {
        if (requestId !== supervisorsRequestId.current) return;
        setSupervisors(result.supervisors);
        setUsingFallbackSupervisors(result.usingFallback);
        setSupervisorsState('success');
      })
      .catch(() => {
        if (requestId !== supervisorsRequestId.current) return;
        setSupervisors([]);
        setSupervisorsState('error');
      });
  }, [selectedVehicle?.id, selectedVehicle?.vehicleType]);

  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Customer</label>
        <CustomerSearchField required onSelect={setCustomerId} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Vehicle</label>
        {!customerId ? (
          <p className="rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
            Select a customer above first.
          </p>
        ) : vehiclesState === 'loading' ? (
          <p className="flex items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading this customer&apos;s vehicles…
          </p>
        ) : vehiclesState === 'error' ? (
          <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-3 py-2 text-xs text-[var(--ejo-error)]">
            Could not load this customer&apos;s vehicles — try selecting them again.
          </p>
        ) : vehicles.length === 0 ? (
          <p className="rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
            This customer has no registered vehicles yet.{' '}
            <LoadingLink href="/workshop/vehicles" className="text-[var(--ejo-primary)] underline">
              Register one
            </LoadingLink>{' '}
            first.
          </p>
        ) : (
          <select
            name="vehicleId"
            required
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plateNumber || v.chassisNumber} — {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
              </option>
            ))}
          </select>
        )}
        <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
          Only vehicles belonging to the selected customer are shown — fetched fresh each time, not a filtered
          local list.
        </p>
      </div>

      {selectedVehicle ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
            Assign to supervisor <span className="text-[var(--ejo-error)]">*</span>
          </label>
          {!selectedVehicle.vehicleType ? (
            <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 px-3 py-2 text-xs text-[var(--ejo-warning)]">
              This vehicle has no Passenger/Commercial type on file — set it on the{' '}
              <LoadingLink href="/workshop/vehicles" className="underline">Vehicles page</LoadingLink> before opening a Job Card
              for it.
            </p>
          ) : supervisorsState === 'loading' ? (
            <p className="flex items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Loading eligible supervisors…
            </p>
          ) : supervisorsState === 'error' ? (
            <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-3 py-2 text-xs text-[var(--ejo-error)]">
              Could not load eligible supervisors — try selecting the vehicle again.
            </p>
          ) : supervisors.length === 0 ? (
            <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-3 py-2 text-xs text-[var(--ejo-error)]">
              No eligible supervisor or Master Administrator is currently active — a Job Card cannot be opened
              until at least one exists.
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
          {supervisorsState === 'success' && usingFallbackSupervisors ? (
            <p className="mt-1 text-[11px] text-[var(--ejo-warning)]">
              No one is placed in this vehicle&apos;s Workshop department as a Supervisor yet — showing Master
              Administrators as a stand-in until that&apos;s set up.
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
              They&apos;ll be emailed to come inspect the vehicle and begin the assessment.
            </p>
          )}
        </div>
      ) : null}
    </>
  );
}
