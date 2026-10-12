'use client';

import { useState } from 'react';
import { updateJobCardStatusFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { LoadingLink } from '@/components/LoadingLink';
import { isReworkTransition as isReworkMove } from '@/lib/job-card-status-rules';

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
  // Start on the first selectable status when the current one isn't
  // selectable (e.g. Cancelled, where only Checked Out is offered), so the
  // "Collected by" field shows.
  const [selected, setSelected] = useState(selectableStatuses.includes(currentStatus) ? currentStatus : selectableStatuses[0]);
  // Rework is the only backward move allowed and needs a reason for the audit trail.
  const isReworkTransition = isReworkMove(currentStatus, selected ?? '');

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
      {isReworkTransition ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Reason for rework</label>
          <textarea
            name="reworkReason"
            required
            rows={2}
            placeholder="What needs to be fixed before this can pass quality check?"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
            The Job Card goes back to In Progress, and the rework and its reason are recorded in the audit trail.
          </p>
        </div>
      ) : null}
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
            The full name of the person collecting the vehicle. It is printed on the Vehicle Collection Receipt.
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
