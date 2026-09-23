'use client';

import { useState } from 'react';
import Link from 'next/link';
import { updateGoodsReceiptLineCostFormAction } from '@/lib/actions/store-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';

function formatNaira(value: number | null): string {
  return value === null ? '—' : `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pluralizeWord(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/** Where this delivery's stock went — computed server-side from the real
 * batch / serial / FIFO-layer records, for every tracking type. */
export type GoodsReceiptLineStockTrace = {
  trackingType: 'QUANTITY' | 'BATCH' | 'SERIALIZED';
  received: number;
  remaining: number;
  issued: number;
  /** The delivery FIFO is currently selling from (batch / quantity). */
  isActive: boolean;
  issuedTo: {
    slipId: string;
    referenceNumber: string;
    sourceNumber: string | null;
    customerName: string | null;
    quantity: number;
    /** e.g. "Serial SN-0042" for a serialized unit. */
    detail: string | null;
  }[];
};

export function GoodsReceiptLineCard({
  goodsReceiptId,
  lineId,
  partId,
  partNumber,
  stockTrace,
  partName,
  baseUnitOfMeasure,
  quantityReceivedInUnit,
  unitUsed,
  quantityInBaseUnit,
  batchNumber,
  totalCost,
  unitCost,
}: {
  goodsReceiptId: string;
  lineId: string;
  /** The Part this delivery was received into — the GRN's destination link. */
  partId: string;
  partNumber: string | null;
  stockTrace: GoodsReceiptLineStockTrace;
  partName: string;
  baseUnitOfMeasure: string;
  quantityReceivedInUnit: number;
  unitUsed: string;
  quantityInBaseUnit: number;
  batchNumber: string | null;
  totalCost: number | null;
  unitCost: number | null;
}) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--ejo-text)]">
          <Link href={`/inventory/parts/${partId}`} className="text-[var(--ejo-primary)] hover:underline">
            {partName}
          </Link>
          {partNumber ? <span className="ml-1.5 text-xs font-normal text-[var(--ejo-text-muted)]">{partNumber}</span> : null}
        </span>
        <span className="text-xs text-[var(--ejo-text-muted)]">
          {quantityReceivedInUnit.toLocaleString('en-NG')} {pluralizeWord(quantityReceivedInUnit, unitUsed)}
          {unitUsed !== baseUnitOfMeasure ? ` (= ${quantityInBaseUnit.toLocaleString('en-NG')} ${pluralizeWord(quantityInBaseUnit, baseUnitOfMeasure)})` : ''}
        </span>
      </div>
      {batchNumber ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Batch: {batchNumber}</p> : null}

      {(() => {
        const t = stockTrace;
        const unit = (n: number) => `${n.toLocaleString('en-NG', { maximumFractionDigits: 3 })} ${pluralizeWord(n, baseUnitOfMeasure)}`;
        const status =
          t.issued <= 0
            ? { label: 'Fully in stock', cls: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' }
            : t.remaining <= 0
              ? { label: 'Fully issued', cls: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' }
              : { label: 'Partly issued', cls: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' };
        return (
          <div className="mt-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium uppercase tracking-wide text-[10px] text-[var(--ejo-text-muted)]">Stock Destination</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
              {t.isActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ejo-success)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-success)]">
                  ● Active / Selling Now
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[var(--ejo-text)]">
              Received into{' '}
              <Link href={`/inventory/parts/${partId}`} className="text-[var(--ejo-primary)] hover:underline">
                {partName}
              </Link>{' '}
              — {unit(t.remaining)} still in stock, {unit(t.issued)} issued of {unit(t.received)}.
            </p>
            {t.issuedTo.length > 0 ? (
              <div className="mt-1.5 space-y-0.5">
                {t.issuedTo.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-[var(--ejo-text)]">
                      {d.detail ? `${d.detail} — ` : `${unit(d.quantity)} — `}
                      {d.customerName ?? '—'}
                    </span>
                    <Link href={`/workshop/parts-requests/${d.slipId}`} className="shrink-0 text-[var(--ejo-primary)] hover:underline">
                      {d.referenceNumber}
                      {d.sourceNumber ? ` · ${d.sourceNumber}` : ''}
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })()}

      {!isEditing ? (
        <div className="mt-2 flex items-center justify-between rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/5 px-3 py-2.5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ejo-success)]">Total Bulk Cost — Current</p>
            <p className="text-base font-bold text-[var(--ejo-text)]">{formatNaira(totalCost)}</p>
            <p className="mt-0.5 text-[11px] text-[var(--ejo-text-muted)]">
              System notes: cost is {formatNaira(unitCost)} per {baseUnitOfMeasure}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
          >
            Correct
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <form action={updateGoodsReceiptLineCostFormAction} className="flex flex-wrap items-center gap-2">
            <FormPendingOverlay />
            <input type="hidden" name="goodsReceiptId" value={goodsReceiptId} />
            <input type="hidden" name="lineId" value={lineId} />
            <input
              name="unitCost"
              type="number"
              step="0.01"
              min="0.01"
              required
              autoFocus
              placeholder={`Correct total cost, per ${unitUsed}`}
              className="w-48 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
            />
            <SubmitButton
              label="Correct"
              pendingLabel="Saving…"
              className="shrink-0 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            />
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]"
            >
              Cancel
            </button>
          </form>
          <p className="mt-1.5 text-[11px] text-[var(--ejo-text-muted)]">
            Enter the real cost per {unitUsed} — the same unit this line was originally received in — and both the
            Total Bulk Cost and the per-{baseUnitOfMeasure} figure above will be corrected together. Store is
            notified by email either way, and this is recorded on the Audit Trail.
          </p>
        </div>
      )}
    </div>
  );
}
