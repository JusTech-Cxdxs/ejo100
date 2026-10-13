'use client';

import { useId, useState, type ReactNode } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { UnitOfMeasureInput } from '@/components/UnitOfMeasureInput';

export type PartCategoryWithTypes = {
  id: string;
  name: string;
  types: { id: string; name: string; typicalUnit: string | null }[];
};

const FIELD = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const LABEL = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/**
 * The "add an estimate line" form shared by Job Cards and Vehicle Services.
 * One field per row in a narrow card (a phone, or the Job Card's main column
 * on a small laptop), a single row of quantity / unit / price when there is
 * room. Every field has a visible label; quantity and price open the number
 * keyboard on phones. Field names are what the server actions read.
 */
export function EstimateLineAddForm({
  action,
  hidden,
  typeOptions,
  categories,
  descriptionSuggestions,
  datalistId,
  canPrice,
  pricingHint,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden: ReactNode;
  typeOptions: { value: string; label: string }[];
  categories: PartCategoryWithTypes[];
  descriptionSuggestions: string[];
  datalistId: string;
  /** Whether the person adding the line may price this line type. */
  canPrice: (type: string) => boolean;
  pricingHint: string;
}) {
  const ids = useId();
  const [type, setType] = useState('STORE_PART');
  const isStorePart = type === 'STORE_PART';
  // Display only: the Part Type's typical unit, so "1" is clearly a set or a
  // single piece. The Store sets the real unit when it matches the part.
  const [selectedPartTypeId, setSelectedPartTypeId] = useState('');
  const selectedPartType = categories.flatMap((c) => c.types).find((t) => t.id === selectedPartTypeId);
  const canShowPriceField = !isStorePart && canPrice(type);

  // Part Types are already loaded, so search filters on the client.
  const allPartTypeOptions: SearchableOption[] = categories.flatMap((category) =>
    category.types.map((t) => ({ value: t.id, label: t.name, sublabel: category.name })),
  );
  async function searchPartTypesLocal(query: string): Promise<SearchableOption[]> {
    const q = query.trim().toLowerCase();
    if (!q) return allPartTypeOptions;
    return allPartTypeOptions.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }
  async function loadAllPartTypesLocal(): Promise<SearchableOption[]> {
    return allPartTypeOptions;
  }

  return (
    <form action={action} className="@container mt-4 border-t border-[var(--ejo-border)] pt-4">
      <FormPendingOverlay />
      {hidden}
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--ejo-text-muted)]">Add a line</p>
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-6">
        <div className="@md:col-span-2">
          <label htmlFor={`${ids}-type`} className={LABEL}>Line type</label>
          <select id={`${ids}-type`} name="type" required value={type} onChange={(e) => setType(e.target.value)} className={FIELD}>
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {isStorePart ? (
          <div className="@md:col-span-4">
            <label htmlFor={`${ids}-part`} className={LABEL}>Part Type</label>
            <SearchableSelect
              id={`${ids}-part`}
              name="partTypeId"
              required
              search={searchPartTypesLocal}
              loadDefaultOptions={loadAllPartTypesLocal}
              defaultOptionsLabel="All Part Types"
              placeholder="Search Part Types…"
              emptyMessage="No Part Type matches."
              onChange={setSelectedPartTypeId}
            />
          </div>
        ) : (
          <div className="@md:col-span-4">
            <label htmlFor={`${ids}-desc`} className={LABEL}>Description</label>
            <input id={`${ids}-desc`} name="description" required list={datalistId} placeholder="Description" className={FIELD} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 @md:col-span-6 @md:grid-cols-3">
          <div>
            <label htmlFor={`${ids}-qty`} className={LABEL}>Quantity</label>
            <input
              id={`${ids}-qty`}
              name="quantity"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              required
              defaultValue="1"
              placeholder="Qty"
              className={FIELD}
            />
          </div>
          <div>
            {isStorePart ? (
              <>
                <label htmlFor={`${ids}-unit`} className={LABEL}>Unit</label>
                <input
                  id={`${ids}-unit`}
                  type="text"
                  readOnly
                  value={selectedPartType?.typicalUnit ?? ''}
                  placeholder={selectedPartType ? 'Varies' : 'Unit'}
                  className={`${FIELD} text-[var(--ejo-text-muted)]`}
                />
              </>
            ) : (
              <>
                <label htmlFor={`${ids}-unit`} className={LABEL}>Unit</label>
                <UnitOfMeasureInput id={`${ids}-unit`} name="unitOfMeasure" placeholder="Unit" />
              </>
            )}
          </div>
          <div className="col-span-2 @md:col-span-1">
            {canShowPriceField ? (
              <>
                <label htmlFor={`${ids}-price`} className={LABEL}>Unit price (₦, optional)</label>
                <input
                  id={`${ids}-price`}
                  name="unitPrice"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="Unit Price (optional)"
                  className={FIELD}
                />
              </>
            ) : (
              <>
                <span className={LABEL}>Unit price</span>
                <p className="flex min-h-[2.375rem] items-center rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] px-3 text-xs text-[var(--ejo-text-muted)] max-md:min-h-11">
                  {isStorePart ? 'Priced by Store' : 'Priced by supervisor'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <SubmitButton
        label="Add"
        pendingLabel="Adding…"
        className="mt-3 min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
      />
      <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
        {isStorePart
          ? 'Pick the kind of part needed. The unit shown is a preview from what’s already in stock; the Store still confirms the exact part and price.'
          : pricingHint}
      </p>

      <datalist id={datalistId}>
        {descriptionSuggestions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </form>
  );
}
