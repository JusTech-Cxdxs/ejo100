'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CustomerSearchField } from './CustomerSearchField';
import { listVehiclesForCustomer, type VehicleSearchResult } from '@/lib/actions/workshop';

type VehiclesState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Real, permanent server-backed Customer → Vehicle selection for Job
 * Card creation.
 *
 * Customer: SearchableSelect, querying the full customers table on
 * every keystroke via searchCustomers() — not a pre-loaded, capped
 * list. Vehicle: once a customer is actually chosen, their vehicles are
 * fetched fresh via listVehiclesForCustomer(), scoped server-side to
 * just that one customer — never a client-side filter of a larger
 * pre-fetched array. Both are real Server Actions called directly (not
 * bound to a <form> submission) — a fully supported Next.js pattern,
 * the same mechanism SearchableSelect itself uses for its `search` prop.
 */
export function CustomerVehiclePicker() {
  const [customerId, setCustomerId] = useState('');
  const [vehicles, setVehicles] = useState<VehicleSearchResult[]>([]);
  const [vehiclesState, setVehiclesState] = useState<VehiclesState>('idle');
  const requestIdRef = useRef(0); // same out-of-order-response guard as SearchableSelect

  useEffect(() => {
    if (!customerId) {
      setVehicles([]);
      setVehiclesState('idle');
      return;
    }
    const requestId = ++requestIdRef.current;
    setVehiclesState('loading');
    listVehiclesForCustomer(customerId)
      .then((found) => {
        if (requestId !== requestIdRef.current) return;
        setVehicles(found);
        setVehiclesState('success');
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setVehicles([]);
        setVehiclesState('error');
      });
  }, [customerId]);

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
            <Link href="/workshop/vehicles" className="text-[var(--ejo-primary)] underline">
              Register one
            </Link>{' '}
            first.
          </p>
        ) : (
          <select
            name="vehicleId"
            required
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
    </>
  );
}
