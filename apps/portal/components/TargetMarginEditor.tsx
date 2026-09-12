'use client';

import { useState } from 'react';
import { setPartTargetMarginFormAction } from '@/lib/actions/store-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { marginToMarkup, markupToMargin } from '@/lib/pricing-math';

/**
 * The real margin (or, if the business prefers, markup) Store wants
 * to hold on this Part — what the Pricing Command Center actually
 * compares every new Goods Receipt cost against, the moment it's
 * recorded. Kept as its own real, separate component from
 * SellingPriceCalculator, matching how the two are genuinely
 * different decisions: what to charge a customer, versus how much
 * profitability is acceptable to hold before it's worth a real
 * second look.
 */
export function TargetMarginEditor({
  partId,
  currentTargetMarginPercent,
  currentPricingMethod,
}: {
  partId: string;
  currentTargetMarginPercent: number | null;
  currentPricingMethod: 'MARGIN' | 'MARKUP';
}) {
  const [pricingMethod, setPricingMethod] = useState<'MARGIN' | 'MARKUP'>(currentPricingMethod);
  const currentDisplayValue =
    currentTargetMarginPercent === null
      ? null
      : currentPricingMethod === pricingMethod
        ? currentTargetMarginPercent
        : pricingMethod === 'MARKUP'
          ? marginToMarkup(currentTargetMarginPercent)
          : markupToMargin(currentTargetMarginPercent);
  const [valueInput, setValueInput] = useState(currentDisplayValue !== null ? String(Math.round(currentDisplayValue * 10) / 10) : '');
  const [isEditing, setIsEditing] = useState(currentTargetMarginPercent === null);

  const parsedValue = Number(valueInput);
  const hasValidInput = Number.isFinite(parsedValue) && parsedValue > 0;
  // Live, as-you-type — the exact real reassurance that was missing
  // before: seeing both real numbers together, right where the
  // decision is actually being made, not after the fact on a
  // different screen.
  const equivalentValue = !hasValidInput
    ? null
    : pricingMethod === 'MARGIN'
      ? marginToMarkup(parsedValue)
      : markupToMargin(parsedValue);

  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Target Pricing</h2>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
        The profitability Store wants to hold on this Part. Every new delivery cost is checked against this
        automatically — a real Pricing Alert is raised the moment a delivery pushes it below this, above it, or
        into an outright loss.
      </p>
      <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">
        <span className="font-medium text-[var(--ejo-text)]">Margin</span> is profit as a share of the selling
        price; <span className="font-medium text-[var(--ejo-text)]">Markup</span> is profit as a share of cost.
        Same real profit, two real ways to measure it — pick whichever this Part&apos;s own pricing decisions are
        usually made in.
      </p>

      {!isEditing && currentTargetMarginPercent !== null ? (
        <div className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ejo-info)]">
                Current Target {currentPricingMethod === 'MARGIN' ? 'Margin' : 'Markup'}
              </p>
              <p className="text-lg font-bold text-[var(--ejo-text)]">{currentTargetMarginPercent.toFixed(1)}%</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPricingMethod(currentPricingMethod);
                setIsEditing(true);
              }}
              className="shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
            >
              Edit
            </button>
          </div>
          <p className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">
            Equivalent {currentPricingMethod === 'MARGIN' ? 'Markup' : 'Margin'}:{' '}
            <span className="font-medium text-[var(--ejo-text)]">
              {(currentPricingMethod === 'MARGIN' ? marginToMarkup(currentTargetMarginPercent) : markupToMargin(currentTargetMarginPercent))?.toFixed(1) ?? '—'}%
            </span>
          </p>
        </div>
      ) : (
        <form action={setPartTargetMarginFormAction} className="mt-3 space-y-2">
          <FormPendingOverlay />
          <input type="hidden" name="id" value={partId} />
          <input type="hidden" name="pricingMethod" value={pricingMethod} />
          <div className="flex gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-1">
            {(['MARGIN', 'MARKUP'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPricingMethod(m)}
                className={`flex-1 rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-xs font-medium ${
                  pricingMethod === m ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'
                }`}
              >
                {m === 'MARGIN' ? 'Target Margin' : 'Target Markup'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">
                Target {pricingMethod === 'MARGIN' ? 'Margin' : 'Markup'} (%)
              </label>
              <input
                name="targetValue"
                type="number"
                step="0.1"
                min="0.1"
                max={pricingMethod === 'MARGIN' ? '100' : undefined}
                required
                autoFocus
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
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
                  setPricingMethod(currentPricingMethod);
                  setValueInput(currentDisplayValue !== null ? String(Math.round(currentDisplayValue * 10) / 10) : '');
                  setIsEditing(false);
                }}
                className="shrink-0 self-end rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]"
              >
                Cancel
              </button>
            ) : null}
          </div>
          {hasValidInput && equivalentValue !== null ? (
            <p className="text-xs text-[var(--ejo-text-muted)]">
              Equivalent {pricingMethod === 'MARGIN' ? 'Markup' : 'Margin'}:{' '}
              <span className="font-medium text-[var(--ejo-text)]">{equivalentValue.toFixed(1)}%</span> — this is
              the real number that actually gets stored and compared, regardless of which one is typed here.
            </p>
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
