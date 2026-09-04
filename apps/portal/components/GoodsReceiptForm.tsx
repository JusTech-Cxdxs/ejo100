'use client';

import { useRef, useState } from 'react';
import { SubmitButton } from './SubmitButton';
import { FormPendingOverlay } from './FormPendingOverlay';
import { SearchableSelect, type SearchableOption } from './SearchableSelect';

type PartOption = {
  id: string;
  name: string;
  trackingType: string;
  baseUnitOfMeasure: string;
  // Prisma's real Decimal fields aren't plain `number` — a hand-typed
  // `number` here looked reasonable (since Number(...) is how it's
  // actually used below) but doesn't match what's genuinely passed in,
  // the exact class of mismatch already caught once before in this
  // project. Number|string|Decimal-with-toString all coerce correctly
  // through Number(...), which is the only thing this ever does with it.
  alternativeUnits: { unitName: string; conversionFactor: number | string | { toString(): string } }[];
};

type SerialRow = { key: string; value: string };

/**
 * A goods receipt form that responds to which part is actually
 * selected — the same real gap this was built to close: a Server
 * Component page can't show or hide fields based on a selection made
 * in the browser, so the earlier version showed every field for every
 * part regardless of whether it applied. This version only shows the
 * one field the selected part's tracking type genuinely needs (Batch
 * Number, or the serial list — never both, never neither when one's
 * required), and shows the part's real base unit and any recognized
 * alternative units immediately, so whoever's filling this in doesn't
 * have to leave the page to check.
 *
 * Serial numbers use the exact same numbered-list pattern as
 * ComplaintListInput on Job Card creation — "Serial 1," "Serial 2,"
 * each its own real <input name="serialNumbers">, not one field that
 * has to be split apart later — with a live count against the
 * quantity entered, since a serialized part's real quantity IS its
 * serial count, not a separately-typed number that could disagree
 * with it. The server enforces this match independently; this is a
 * genuine help, not the actual guarantee.
 */
export function GoodsReceiptForm({
  branchId,
  parts,
  action,
}: {
  branchId: string;
  parts: PartOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedPartId, setSelectedPartId] = useState('');
  const selectedPart = parts.find((p) => p.id === selectedPartId);
  const [quantity, setQuantity] = useState('');
  const [unitUsed, setUnitUsed] = useState('');
  const [serials, setSerials] = useState<SerialRow[]>([{ key: 's0', value: '' }]);
  const nextSerialId = useRef(1);

  function selectPart(partId: string) {
    setSelectedPartId(partId);
    // Alternative unit first, base unit only when there isn't one —
    // Store almost always receives a delivery of Engine Oil by the
    // Drum, not counted out in Liters, so that's the real, useful
    // default to start from. A plain `defaultValue` here would only
    // apply on first mount, not when the selection actually changes,
    // the same class of bug already caught once before in this
    // project on a status dropdown. Still freely editable afterward.
    const newPart = parts.find((p) => p.id === partId);
    setUnitUsed(newPart?.alternativeUnits[0]?.unitName ?? newPart?.baseUnitOfMeasure ?? '');
  }

  // Every real Part is already loaded via the `parts` prop — no
  // server round-trip needed to search it, just a plain client-side
  // filter wrapped as a Promise to match SearchableSelect's own
  // (query) => Promise<SearchableOption[]> shape.
  const allPartOptions: SearchableOption[] = parts.map((p) => ({ value: p.id, label: p.name }));
  async function searchPartsLocal(query: string): Promise<SearchableOption[]> {
    const q = query.trim().toLowerCase();
    if (!q) return allPartOptions;
    return allPartOptions.filter((o) => o.label.toLowerCase().includes(q));
  }
  async function loadAllPartsLocal(): Promise<SearchableOption[]> {
    return allPartOptions;
  }

  function addSerialRow() {
    setSerials((prev) => [...prev, { key: `s${nextSerialId.current++}`, value: '' }]);
  }

  function removeSerialRow(key: string) {
    setSerials((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function updateSerialRow(key: string, value: string) {
    setSerials((prev) => prev.map((r) => (r.key === key ? { ...r, value } : r)));
  }

  const filledSerialCount = serials.filter((r) => r.value.trim()).length;
  const parsedQuantity = Number(quantity);
  const serialCountMatches = Number.isFinite(parsedQuantity) && parsedQuantity > 0 && filledSerialCount === parsedQuantity;

  return (
    <form action={action} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
      <FormPendingOverlay />
      <input type="hidden" name="branchId" value={branchId} />

      <div>
        <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Supplier</label>
        <input
          name="supplierName"
          required
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Part</label>
        <SearchableSelect
          name="partId"
          required
          search={searchPartsLocal}
          loadDefaultOptions={loadAllPartsLocal}
          defaultOptionsLabel="All Parts"
          placeholder="Search Parts…"
          emptyMessage="No Part matches."
          onChange={selectPart}
        />
        {selectedPart ? (
          <p className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">
            Base unit: <span className="font-medium text-[var(--ejo-text)]">{selectedPart.baseUnitOfMeasure}</span>
            {selectedPart.alternativeUnits.length > 0 ? (
              <>
                {' '}— also accepts:{' '}
                {selectedPart.alternativeUnits
                  .map((u) => `${u.unitName} (1 ${u.unitName} = ${Number(u.conversionFactor).toLocaleString('en-NG', { maximumFractionDigits: 3 })} ${selectedPart.baseUnitOfMeasure})`)
                  .join(', ')}
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Quantity Received</label>
          <input
            name="quantityReceivedInUnit"
            type="number"
            step="0.0001"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Unit</label>
          <input
            name="unitUsed"
            list="goods-receipt-unit-suggestions"
            required
            value={unitUsed}
            onChange={(e) => setUnitUsed(e.target.value)}
            placeholder="e.g. Liter, or Drum"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          {/* Exactly the real units this specific Part actually uses
              — its alternative unit (if it has one) and its base unit
              — never the full generic catalog, so clearing this by
              mistake still leads straight back to a genuinely correct
              choice, not a wall of unrelated suggestions. */}
          <datalist id="goods-receipt-unit-suggestions">
            {selectedPart?.alternativeUnits.map((u) => (
              <option key={u.unitName} value={u.unitName} />
            ))}
            {selectedPart ? <option value={selectedPart.baseUnitOfMeasure} /> : null}
          </datalist>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Unit Cost (optional)</label>
        <input
          name="unitCost"
          type="number"
          step="0.01"
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
      </div>

      {selectedPart?.trackingType === 'BATCH' ? (
        <div>
          <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Batch Number</label>
          <input
            name="batchNumber"
            required
            placeholder="e.g. the lot/batch code printed on the delivery"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
        </div>
      ) : null}

      {selectedPart?.trackingType === 'SERIALIZED' ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-[var(--ejo-text-muted)]">Serial Numbers</label>
            <span className={`text-xs font-medium ${quantity && !serialCountMatches ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text-muted)]'}`}>
              {filledSerialCount} / {quantity || '?'} entered
            </span>
          </div>
          <div className="space-y-2">
            {serials.map((row, i) => (
              <div key={row.key} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs font-medium text-[var(--ejo-text-muted)]">Serial {i + 1}</span>
                <input
                  name="serialNumbers"
                  required={i === 0}
                  value={row.value}
                  onChange={(e) => updateSerialRow(row.key, e.target.value)}
                  placeholder="e.g. the DOT code or stamped serial"
                  className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                {serials.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeSerialRow(row.key)}
                    aria-label={`Remove serial ${i + 1}`}
                    className="shrink-0 rounded-[var(--ejo-radius-md)] px-2 py-1 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-error)]"
                  >
                    &times;
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addSerialRow}
            className="mt-2 text-xs font-medium text-[var(--ejo-primary)] hover:underline"
          >
            + Add another serial
          </button>
          {quantity && !serialCountMatches ? (
            <p className="mt-1.5 text-xs text-[var(--ejo-error)]">
              The number of serials entered must exactly match the quantity received before this can be submitted.
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Notes (optional)</label>
        <textarea
          name="notes"
          rows={2}
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
      </div>

      <SubmitButton
        label="Record Goods Receipt"
        pendingLabel="Recording…"
        className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      />
    </form>
  );
}
