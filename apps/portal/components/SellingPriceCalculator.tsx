'use client';

import { useState } from 'react';
import { setPartSellingPriceFormAction } from '@/lib/actions/store-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The real "how much did we pay, how much do we charge, what's the
 * margin" picture — kept genuinely separate the whole way through:
 * Total Bulk Cost is what was actually paid for the most recent real
 * delivery (a permanent Goods Receipt record, untouched here),
 * Selling Price is a deliberate, editable decision Store makes on
 * this Part specifically, and the margin insight is purely a live,
 * client-side calculation — never stored anywhere, recomputed fresh
 * from whatever's currently typed, the same way a real POS system's
 * own pricing screen would show it.
 */
export function SellingPriceCalculator({
  partId,
  partName,
  baseUnitOfMeasure,
  currentSellingPrice,
  lastReceipt,
}: {
  partId: string;
  partName: string;
  baseUnitOfMeasure: string;
  currentSellingPrice: number | null;
  lastReceipt: {
    referenceNumber: string;
    quantityReceivedInUnit: number;
    unitUsed: string;
    quantityInBaseUnit: number;
    unitCostInBaseUnit: number | null;
  } | null;
}) {
  const [sellingPriceInput, setSellingPriceInput] = useState(currentSellingPrice !== null ? String(currentSellingPrice) : '');
  const sellingPrice = Number(sellingPriceInput) || 0;

  const totalBulkCost = lastReceipt?.unitCostInBaseUnit !== null && lastReceipt?.unitCostInBaseUnit !== undefined ? lastReceipt.unitCostInBaseUnit * lastReceipt.quantityInBaseUnit : null;
  const expectedRevenue = lastReceipt ? sellingPrice * lastReceipt.quantityInBaseUnit : null;
  const grossProfit = totalBulkCost !== null && expectedRevenue !== null ? expectedRevenue - totalBulkCost : null;
  const markupPercent = totalBulkCost !== null && totalBulkCost > 0 && grossProfit !== null ? (grossProfit / totalBulkCost) * 100 : null;

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
                {lastReceipt.quantityReceivedInUnit.toLocaleString('en-NG')} {lastReceipt.unitUsed}
                {lastReceipt.unitUsed !== baseUnitOfMeasure ? ` (= ${lastReceipt.quantityInBaseUnit.toLocaleString('en-NG')} ${baseUnitOfMeasure})` : ''}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Total Bulk Cost</dt>
              <dd className="font-medium text-[var(--ejo-text)]">{totalBulkCost !== null ? formatNaira(totalBulkCost) : '—'}</dd>
            </div>
          </dl>
          {lastReceipt.unitCostInBaseUnit !== null ? (
            <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
              System notes: cost is {formatNaira(lastReceipt.unitCostInBaseUnit)}/{baseUnitOfMeasure} — from {lastReceipt.referenceNumber}.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No Goods Receipt recorded yet — record one to see the real purchase cost here.</p>
      )}

      <div className="mt-4 border-t border-[var(--ejo-border)] pt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">Selling Details</p>
        <p className="mt-1.5 text-sm text-[var(--ejo-text)]">
          Selling Unit: <span className="font-medium">{baseUnitOfMeasure}</span>
        </p>
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
              value={sellingPriceInput}
              onChange={(e) => setSellingPriceInput(e.target.value)}
              placeholder={`e.g. 4500 per ${baseUnitOfMeasure}`}
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <SubmitButton
            label={currentSellingPrice !== null ? 'Update' : 'Set'}
            pendingLabel="Saving…"
            className="shrink-0 self-end rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
        </form>
        {currentSellingPrice !== null ? (
          <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">Current selling price on record: {formatNaira(currentSellingPrice)}.</p>
        ) : (
          <p className="mt-1 text-[11px] text-[var(--ejo-warning)]">Not set yet — Store Part matching is blocked until this is set.</p>
        )}
      </div>

      {lastReceipt && sellingPrice > 0 ? (
        <div className="mt-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-success)]">Live Margin Insight</p>
          <dl className="mt-1.5 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Expected Revenue</dt>
              <dd className="font-medium text-[var(--ejo-text)]">{expectedRevenue !== null ? formatNaira(expectedRevenue) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--ejo-text-muted)]">Gross Profit</dt>
              <dd className={`font-medium ${grossProfit !== null && grossProfit < 0 ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}`}>
                {grossProfit !== null ? formatNaira(grossProfit) : '—'}
                {markupPercent !== null ? ` (${markupPercent.toFixed(1)}% Markup)` : ''}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
