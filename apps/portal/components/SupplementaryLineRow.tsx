'use client';

import { useState } from 'react';
import { editExternalProcurementSupplementaryLineFormAction, removeExternalProcurementSupplementaryLineFormAction } from '@/lib/actions/sourcing-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SupplementaryLineRow({
  requestId,
  lineId,
  description,
  amount,
  addedByName,
  canEdit,
}: {
  requestId: string;
  lineId: string;
  description: string;
  amount: number;
  addedByName: string;
  canEdit: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--ejo-text)]">
          {description} <span className="text-[var(--ejo-text-muted)]">— added by {addedByName}</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--ejo-text)]">{formatNaira(amount)}</span>
          {canEdit ? (
            <>
              <button type="button" onClick={() => setIsEditing(true)} className="text-[var(--ejo-text-muted)] hover:underline">
                Edit
              </button>
              <form action={removeExternalProcurementSupplementaryLineFormAction}>
                <input type="hidden" name="requestId" value={requestId} />
                <input type="hidden" name="lineId" value={lineId} />
                <button type="submit" className="text-[var(--ejo-error)] hover:underline">
                  Remove
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form action={editExternalProcurementSupplementaryLineFormAction} className="flex flex-wrap items-center gap-2 text-xs">
      <FormPendingOverlay />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="lineId" value={lineId} />
      <input
        name="description"
        defaultValue={description}
        required
        autoFocus
        className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]"
        style={{ minWidth: '120px' }}
      />
      <input
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        defaultValue={amount}
        required
        className="w-24 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]"
      />
      <SubmitButton label="Save" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-2 py-1 text-xs font-medium text-white hover:opacity-90" />
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]"
      >
        Cancel
      </button>
    </form>
  );
}
