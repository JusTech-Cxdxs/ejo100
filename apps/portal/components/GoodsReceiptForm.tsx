'use client';

import { useRef, useState } from 'react';
import { SubmitButton } from './SubmitButton';
import { FormPendingOverlay } from './FormPendingOverlay';
import { SearchableSelect, type SearchableOption } from './SearchableSelect';
import { SerialNumberInput } from './SerialNumberInput';
import { IdempotencyKey } from './IdempotencyKey';
import { pluralizeWord } from '@/lib/utils/pluralize';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

type PartOption = {
  id: string;
  name: string;
  trackingType: string;
  baseUnitOfMeasure: string;
  // Prisma Decimals arrive as objects; this value is only ever passed to Number().
  alternativeUnits: { unitName: string; conversionFactor: number | string | { toString(): string } }[];
};

type SerialRow = { key: string; value: string };

/**
 * Goods receipt form. Shows the selected part's units and only the field its
 * tracking type needs: a batch number, or one <input name="serialNumbers">
 * per unit with a live count against the quantity. The server checks the
 * count again.
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
  const [totalCost, setTotalCost] = useState('');
  const [serials, setSerials] = useState<SerialRow[]>([{ key: 's0', value: '' }]);
  const nextSerialId = useRef(1);

  function selectPart(partId: string) {
    setSelectedPartId(partId);
    // Default to the alternative unit (deliveries usually come by the drum
    // or carton). Set on every part change; defaultValue would only apply once.
    const newPart = parts.find((p) => p.id === partId);
    setUnitUsed(newPart?.alternativeUnits[0]?.unitName ?? newPart?.baseUnitOfMeasure ?? '');
  }

  // Parts are already loaded, so search filters on the client.
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

  // Serial rows with a problem (duplicate here or already recorded).
  // Submission is blocked while any remain.
  const [serialValidity, setSerialValidity] = useState<Record<string, boolean>>({});
  const hasInvalidSerial = Object.values(serialValidity).some(Boolean);

  const filledSerialCount = serials.filter((r) => r.value.trim()).length;
  const parsedQuantity = Number(quantity);
  const serialCountMatches = Number.isFinite(parsedQuantity) && parsedQuantity > 0 && filledSerialCount === parsedQuantity;

  // The Store enters the delivery's total cost; unit costs are worked out here.
  const parsedTotalCost = Number(totalCost);
  const hasLiveCalc = Number.isFinite(parsedQuantity) && parsedQuantity > 0 && Number.isFinite(parsedTotalCost) && parsedTotalCost > 0;
  const costPerUnitUsed = hasLiveCalc ? parsedTotalCost / parsedQuantity : null;
  const conversionFactor = selectedPart?.alternativeUnits.find((u) => u.unitName === unitUsed);
  const costPerBaseUnit =
    hasLiveCalc && selectedPart && unitUsed !== selectedPart.baseUnitOfMeasure && conversionFactor
      ? costPerUnitUsed !== null
        ? costPerUnitUsed / Number(conversionFactor.conversionFactor)
        : null
      : costPerUnitUsed;

  return (
    <form action={action} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
      <FormPendingOverlay />
      <IdempotencyKey />
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
                  .map((u) => {
                    const factor = Number(u.conversionFactor);
                    return `${u.unitName} (1 ${u.unitName} = ${factor.toLocaleString('en-NG', { maximumFractionDigits: 3 })} ${pluralizeWord(factor, selectedPart.baseUnitOfMeasure)})`;
                  })
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
          {/* Only this part's own units (alternative and base). */}
          <datalist id="goods-receipt-unit-suggestions">
            {selectedPart?.alternativeUnits.map((u) => (
              <option key={u.unitName} value={u.unitName} />
            ))}
            {selectedPart ? <option value={selectedPart.baseUnitOfMeasure} /> : null}
          </datalist>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">
          Total Cost
          {unitUsed
            ? ` (for the full ${quantity || '…'} ${quantity ? pluralizeWord(Number(quantity), unitUsed) : pluralizeWord(2, unitUsed)} received)`
            : ''}
        </label>
        <input
          name="totalCost"
          type="number"
          step="0.01"
          required
          value={totalCost}
          onChange={(e) => setTotalCost(e.target.value)}
          placeholder="e.g. 650000 — the real total actually paid"
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        {hasLiveCalc && selectedPart ? (
          <p className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">
            = <span className="font-medium text-[var(--ejo-text)]">₦{costPerUnitUsed!.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> per {unitUsed}
            {costPerBaseUnit !== null && unitUsed !== selectedPart.baseUnitOfMeasure ? (
              <>
                {' '}(= ₦{costPerBaseUnit.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per {selectedPart.baseUnitOfMeasure})
              </>
            ) : null}
          </p>
        ) : null}
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
                <SerialNumberInput
                  index={i}
                  value={row.value}
                  otherValues={serials.filter((r) => r.key !== row.key).map((r) => r.value)}
                  onChange={(value) => updateSerialRow(row.key, value)}
                  onValidityChange={(hasError) => setSerialValidity((prev) => ({ ...prev, [row.key]: hasError }))}
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
        <textarea id="goodsreceiptform-text-1"
          name="notes"
          rows={2}
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <RefineTextButton targetId="goodsreceiptform-text-1" />
      </div>

      {hasInvalidSerial ? (
        <p className="text-xs text-[var(--ejo-error)]">Fix the serial number problem above before this can be recorded.</p>
      ) : null}

      {hasInvalidSerial ? (
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white opacity-50"
        >
          Record Goods Receipt
        </button>
      ) : (
        <SubmitButton
          label="Record Goods Receipt"
          pendingLabel="Recording…"
          className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        />
      )}
    </form>
  );
}
