'use client';

import { useState } from 'react';
import { setPartSellingPriceFormAction } from '@/lib/actions/store-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { pluralizeWord } from '@/lib/utils/pluralize';
import { actualMargin, actualMarkup, marginToMarkup, priceForTargetMargin } from '@/lib/pricing-math';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null): string {
  return value !== null ? `${value.toFixed(1)}%` : '—';
}

/**
 * The real "how much did we pay, how much do we charge, what's the
 * real profitability" picture — kept genuinely separate the whole way
 * through: Total Bulk Cost is what was actually paid for the most
 * recent real delivery (a permanent Goods Receipt record, untouched
 * here), Selling Price is a deliberate, editable decision Store makes
 * on this Part specifically, and every figure in the insight panel
 * below is purely a live, client-side calculation — never stored
 * anywhere, recomputed fresh from whatever's currently typed.
 *
 * Confirmed directly, from a real, live case: showing only "Markup"
 * here, next to a Target Margin field that means something
 * genuinely different, was a real, live source of confusion — a real
 * 41.9% Markup was mistakenly entered as a 41.9% Target Margin,
 * quietly asking for a materially higher real profitability than
 * intended. This panel now shows Margin and Markup side by side,
 * always both, always clearly labeled, so neither number is ever the
 * only one on screen.
 */
export function SellingPriceCalculator({
  partId,
  partName,
  baseUnitOfMeasure,
  currentSellingPrice,
  targetMarginPercent,
  lastReceipt,
}: {
  partId: string;
  partName: string;
  baseUnitOfMeasure: string;
  currentSellingPrice: number | null;
  targetMarginPercent: number | null;
  lastReceipt: {
    referenceNumber: string;
    quantityReceivedInUnit: number;
    unitUsed: string;
    quantityInBaseUnit: number;
    unitCostInBaseUnit: number | null;
    totalCost: number | null;
  } | null;
}) {
  const [sellingPriceInput, setSellingPriceInput] = useState(currentSellingPrice !== null ? String(currentSellingPrice) : '');
  const sellingPrice = Number(sellingPriceInput) || 0;
  // Starts already editing only when there's genuinely nothing set
  // yet — once a real price is on record, the default view is the
  // clear, styled status, not an input box sitting open by default.
  const [isEditingPrice, setIsEditingPrice] = useState(currentSellingPrice === null);

  // The real, exact amount actually paid — read directly from the
  // Goods Receipt's own stored totalCost, never recomputed by
  // multiplying the (necessarily imprecise) per-base-unit cost back
  // out. That round-trip is exactly what produced a real bug before:
  // a genuine ₦650,000 payment for 205 Liters showing as ₦649,999.65,
  // since 650,000 ÷ 205 has no exact 2-decimal answer.
  const totalBulkCost = lastReceipt?.totalCost ?? null;
  const unitCost = lastReceipt?.unitCostInBaseUnit ?? null;
  const expectedRevenue = lastReceipt ? sellingPrice * lastReceipt.quantityInBaseUnit : null;
  const grossProfit = totalBulkCost !== null && expectedRevenue !== null ? expectedRevenue - totalBulkCost : null;

  // Real, current profitability at whatever price is currently
  // showing (typed or saved) against the most recent real cost —
  // Margin and Markup always shown together, on purpose, never one
  // without the other.
  const currentMarginPercent = unitCost !== null && sellingPrice > 0 ? actualMargin(unitCost, sellingPrice) : null;
  const currentMarkupPercent = unitCost !== null && sellingPrice > 0 ? actualMarkup(unitCost, sellingPrice) : null;

  // The real target this Part is actually held to, and what it would
  // recommend right now against the most recent real cost — shown
  // even while just viewing, not only when a Pricing Alert has
  // already been raised, so the real gap is always visible, not just
  // after the fact.
  const equivalentTargetMarkup = targetMarginPercent !== null ? marginToMarkup(targetMarginPercent) : null;
  const marginGap = currentMarginPercent !== null && targetMarginPercent !== null ? currentMarginPercent - targetMarginPercent : null;
  const recommendedPrice = unitCost !== null && targetMarginPercent !== null ? priceForTargetMargin(unitCost, targetMarginPercent) : null;
  const recommendedMarkup = recommendedPrice !== null && unitCost !== null ? actualMarkup(unitCost, recommendedPrice) : null;

  return (
    <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
      <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Purchase &amp; Selling</h2>

      {lastReceipt ? (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">Purchase Details</p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Part</dt>
              <dd className="text-[var(--ejo-text)]">{partName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Quantity Received</dt>
              <dd className="text-[var(--ejo-text)]">
                {lastReceipt.quantityReceivedInUnit.toLocaleString('en-NG')} {pluralizeWord(lastReceipt.quantityReceivedInUnit, lastReceipt.unitUsed)}
                {lastReceipt.unitUsed !== baseUnitOfMeasure
                  ? ` (= ${lastReceipt.quantityInBaseUnit.toLocaleString('en-NG')} ${pluralizeWord(lastReceipt.quantityInBaseUnit, baseUnitOfMeasure)})`
                  : ''}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Total Purchase Cost</dt>
              <dd className="font-medium text-[var(--ejo-text)]">{totalBulkCost !== null ? formatNaira(totalBulkCost) : '—'}</dd>
            </div>
          </dl>
          {unitCost !== null ? (
            <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
              System notes: cost is {formatNaira(unitCost)}/{baseUnitOfMeasure} — from {lastReceipt.referenceNumber}.
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
            This is the most recent delivery, shown here purely as pricing reference — the real, permanent record for
            {' '}{lastReceipt.referenceNumber} itself lives on its own Goods Receipt page. If another batch arrives
            later, this section updates to reflect that new delivery instead.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No Goods Receipt recorded yet — record one to see the real purchase cost here.</p>
      )}

      <div className="mt-4 border-t border-[var(--ejo-border)] pt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">Selling Details</p>
        <p className="mt-1.5 text-sm text-[var(--ejo-text)]">
          Selling Unit: <span className="font-medium">{baseUnitOfMeasure}</span>
        </p>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {unitCost !== null ? (
            <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">Unit Cost</p>
              <p className="text-lg font-bold text-[var(--ejo-text)]">
                {formatNaira(unitCost)}
                <span className="text-xs font-normal text-[var(--ejo-text-muted)]"> /{baseUnitOfMeasure}</span>
              </p>
            </div>
          ) : null}

          {!isEditingPrice && currentSellingPrice !== null ? (
            <div className="flex items-center justify-between rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 px-3 py-2.5">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ejo-success)]">Selling Price</p>
                <p className="text-lg font-bold text-[var(--ejo-text)]">
                  {formatNaira(currentSellingPrice)}
                  <span className="text-xs font-normal text-[var(--ejo-text-muted)]"> /{baseUnitOfMeasure}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingPrice(true)}
                className="shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
              >
                Edit
              </button>
            </div>
          ) : null}
        </div>

        {isEditingPrice || currentSellingPrice === null ? (
          <form action={setPartSellingPriceFormAction} className="mt-2 flex items-center gap-2">
            <FormPendingOverlay />
            <input type="hidden" name="id" value={partId} />
            <div className="flex-1">
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Selling Price per {baseUnitOfMeasure}</label>
              <input
                name="sellingPrice"
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus={currentSellingPrice !== null}
                value={sellingPriceInput}
                onChange={(e) => setSellingPriceInput(e.target.value)}
                placeholder={`e.g. 4500 per ${baseUnitOfMeasure}`}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <SubmitButton
              label={currentSellingPrice !== null ? 'Save' : 'Set'}
              pendingLabel="Saving…"
              className="shrink-0 self-end rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
            {currentSellingPrice !== null ? (
              <button
                type="button"
                onClick={() => {
                  setSellingPriceInput(String(currentSellingPrice));
                  setIsEditingPrice(false);
                }}
                className="shrink-0 self-end rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]"
              >
                Cancel
              </button>
            ) : null}
          </form>
        ) : null}

        {currentSellingPrice === null ? (
          <p className="mt-1 text-[11px] text-[var(--ejo-warning)]">Not set yet — Store Part matching is blocked until this is set.</p>
        ) : null}
      </div>

      {lastReceipt && sellingPrice > 0 ? (
        <div className="mt-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-success)]">Profitability &amp; Pricing Insight</p>

          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Expected Revenue</dt>
              <dd className="font-medium text-[var(--ejo-text)]">{expectedRevenue !== null ? formatNaira(expectedRevenue) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Expected Gross Profit</dt>
              <dd className={`font-medium ${grossProfit !== null && grossProfit < 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>
                {grossProfit !== null ? formatNaira(grossProfit) : '—'}
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-[10px] text-[var(--ejo-text-muted)]">
            A real projection using the current Selling Price and current stock — not actual historical revenue.
            What was genuinely charged on a past sale may have differed if the price has changed since.
          </p>

          <dl className="mt-3 space-y-1 border-t border-[var(--ejo-success)]/20 pt-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Current Margin (of Price)</dt>
              <dd className="font-medium text-[var(--ejo-text)]">{formatPercent(currentMarginPercent)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Current Markup (of Cost)</dt>
              <dd className="font-medium text-[var(--ejo-text)]">{formatPercent(currentMarkupPercent)}</dd>
            </div>
          </dl>

          {targetMarginPercent !== null ? (
            <dl className="mt-3 space-y-1 border-t border-[var(--ejo-success)]/20 pt-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--ejo-text-muted)]">Target Margin</dt>
                <dd className="font-medium text-[var(--ejo-text)]">{formatPercent(targetMarginPercent)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--ejo-text-muted)]">Equivalent Target Markup</dt>
                <dd className="font-medium text-[var(--ejo-text)]">{formatPercent(equivalentTargetMarkup)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--ejo-text-muted)]">Margin Gap</dt>
                <dd className={`font-medium ${marginGap !== null && marginGap < 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>
                  {marginGap !== null ? `${marginGap >= 0 ? '+' : ''}${marginGap.toFixed(1)} points` : '—'}
                </dd>
              </div>
              {recommendedPrice !== null && Math.abs((currentSellingPrice ?? 0) - recommendedPrice) > 0.01 ? (
                <>
                  <div className="flex justify-between">
                    <dt className="text-[var(--ejo-text-muted)]">Recommended Price</dt>
                    <dd className="font-medium text-[var(--ejo-text)]">{formatNaira(recommendedPrice)}/{baseUnitOfMeasure}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--ejo-text-muted)]">Recommended Markup</dt>
                    <dd className="font-medium text-[var(--ejo-text)]">{formatPercent(recommendedMarkup)}</dd>
                  </div>
                  <div className="mt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        // Pre-fills the real, existing Selling Price
                        // form with the recommended figure — the
                        // actual save still goes through the same
                        // real setPartSellingPrice action (and its
                        // own real notification email) as any manual
                        // edit, never a separate, parallel path.
                        setSellingPriceInput(String(Math.round(recommendedPrice * 100) / 100));
                        setIsEditingPrice(true);
                      }}
                      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/10 px-3 py-1 text-xs font-medium text-[var(--ejo-success)] hover:bg-[var(--ejo-success)]/20"
                    >
                      Use Recommended Price
                    </button>
                  </div>
                </>
              ) : null}
            </dl>
          ) : (
            <p className="mt-3 border-t border-[var(--ejo-success)]/20 pt-2 text-[11px] text-[var(--ejo-text-muted)]">
              Set a Target below to see the real gap against this Part&apos;s own current pricing.
            </p>
          )}

          <p className="mt-3 text-[11px] text-[var(--ejo-text-muted)]">
            <span className="font-medium text-[var(--ejo-text)]">Margin</span> — profit compared with selling
            price. <span className="font-medium text-[var(--ejo-text)]">Markup</span> — profit compared with
            cost. Same real profit, two real ways to measure it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
