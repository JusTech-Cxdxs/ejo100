'use client';

import { useState } from 'react';
import { setPartTargetMarginFormAction } from '@/lib/actions/store-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';

/**
 * The real margin Store wants to hold on this Part — what the Pricing
 * Command Center actually compares every new Goods Receipt cost
 * against, the moment it's recorded. Kept as its own real, separate
 * component from SellingPriceCalculator, matching how the two are
 * genuinely different decisions: what to charge a customer, versus
 * how much margin is acceptable to hold before it's worth a real
 * second look.
 */
export function TargetMarginEditor({
  partId,
  currentTargetMarginPercent,
}: {
  partId: string;
  currentTargetMarginPercent: number | null;
}) {
  const [marginInput, setMarginInput] = useState(currentTargetMarginPercent !== null ? String(currentTargetMarginPercent) : '');
  const [isEditing, setIsEditing] = useState(currentTargetMarginPercent === null);

  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Target Margin</h2>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
        The margin Store wants to hold on this Part. Every new delivery cost is checked against this
        automatically — a real Pricing Alert is raised the moment a delivery pushes the margin below this, above
        it, or into an outright loss.
      </p>

      {!isEditing && currentTargetMarginPercent !== null ? (
        <div className="mt-3 flex items-center justify-between rounded-[var(--ejo-radius-md)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 px-3 py-2.5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ejo-info)]">Current Target Margin</p>
            <p className="text-lg font-bold text-[var(--ejo-text)]">{currentTargetMarginPercent}%</p>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
          >
            Edit
          </button>
        </div>
      ) : (
        <form action={setPartTargetMarginFormAction} className="mt-3 flex items-center gap-2">
          <FormPendingOverlay />
          <input type="hidden" name="id" value={partId} />
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Target Margin (%)</label>
            <input
              name="targetMarginPercent"
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              required
              autoFocus={currentTargetMarginPercent !== null}
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              placeholder="e.g. 30"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <SubmitButton
            label={currentTargetMarginPercent !== null ? 'Save' : 'Set'}
            pendingLabel="Saving…"
            className="shrink-0 self-end rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
          {currentTargetMarginPercent !== null ? (
            <button
              type="button"
              onClick={() => {
                setMarginInput(String(currentTargetMarginPercent));
                setIsEditing(false);
              }}
              className="shrink-0 self-end rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]"
            >
              Cancel
            </button>
          ) : null}
        </form>
      )}

      {currentTargetMarginPercent === null ? (
        <p className="mt-2 text-[11px] text-[var(--ejo-warning)]">
          Not set yet — no Pricing Alert can be raised on this Part until this is set.
        </p>
      ) : null}
    </div>
  );
}
