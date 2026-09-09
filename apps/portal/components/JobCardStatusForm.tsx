'use client';

import { useState } from 'react';
import { updateJobCardStatusFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { LoadingLink } from '@/components/LoadingLink';

export function JobCardStatusForm({
  jobCardId,
  currentStatus,
  selectableStatuses,
  statusLabels,
}: {
  jobCardId: string;
  currentStatus: string;
  selectableStatuses: readonly string[];
  statusLabels: Record<string, string>;
}) {
  // Real bug this fixes: when the only selectable status is different
  // from the Job Card's own current one (a cancelled Job Card, where
  // the dropdown's only real option is CHECKED_OUT but currentStatus
  // is still CANCELLED), initializing state to currentStatus left the
  // form silently believing CANCELLED was still selected even though
  // the dropdown visually showed CHECKED_OUT as the only choice — so
  // the Collected By field never appeared. Default to the real
  // selectable option whenever currentStatus itself isn't one.
  const [selected, setSelected] = useState(selectableStatuses.includes(currentStatus) ? currentStatus : selectableStatuses[0]);

  return (
    <form action={updateJobCardStatusFormAction} className="mt-4 space-y-3">
      <FormPendingOverlay />
      <input type="hidden" name="jobCardId" value={jobCardId} />
      <select
        name="status"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
      >
        {selectableStatuses.map((s) => (
          <option key={s} value={s} style={s === 'CANCELLED' ? { color: 'var(--ejo-error)' } : undefined}>
            {statusLabels[s]}
          </option>
        ))}
      </select>
      {selected === 'CHECKED_OUT' ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Collected By (name)</label>
          <input
            name="collectedByName"
            required
            placeholder="e.g. the customer's own name, or whoever they sent"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
            The real name of whoever is physically collecting the vehicle right now — this is what prints on the
            Vehicle Collection Receipt.
          </p>
        </div>
      ) : null}
      <div className="flex gap-2">
        <SubmitButton
          label="Update status"
          pendingLabel="Updating…"
          className="flex-1 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        />
        <LoadingLink
          href={`/workshop/job-cards/${jobCardId}`}
          className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
        >
          Cancel
        </LoadingLink>
      </div>
    </form>
  );
}
