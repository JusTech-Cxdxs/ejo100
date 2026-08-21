'use client';

import { useState } from 'react';
import Link from 'next/link';

export type PickerCustomer = { id: string; fullName: string };
export type PickerVehicle = {
  id: string;
  customerId: string;
  plateNumber: string | null;
  chassisNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
};

/**
 * Real cascading Customer → Vehicle selection for Job Card creation.
 * Previously the vehicle dropdown listed every vehicle in the system
 * regardless of which customer was selected — the exact complaint this
 * fixes. Client Component because filtering the vehicle list as the
 * customer selection changes needs interactivity a Server Component
 * can't provide; the two <select> elements are still plain, real,
 * native form fields with their original `name` attributes, so the
 * enclosing <form action={createJobCardFormAction}> submits exactly
 * the same FormData it always did — nothing about the Server Action
 * side needed to change for this fix.
 */
export function CustomerVehiclePicker({
  customers,
  vehicles,
}: {
  customers: PickerCustomer[];
  vehicles: PickerVehicle[];
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const vehiclesForCustomer = vehicles.filter((v) => v.customerId === customerId);

  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Customer</label>
        <select
          name="customerId"
          required
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.fullName}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Vehicle</label>
        {vehiclesForCustomer.length === 0 ? (
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
            {vehiclesForCustomer.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plateNumber || v.chassisNumber} — {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
              </option>
            ))}
          </select>
        )}
        <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
          Only vehicles belonging to the selected customer are shown.
        </p>
      </div>
    </>
  );
}
