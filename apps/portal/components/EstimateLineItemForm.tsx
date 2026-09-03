'use client';

import { useState } from 'react';
import { addEstimateLineItemFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';

type PartCategoryWithTypes = {
  id: string;
  name: string;
  types: { id: string; name: string }[];
};

/**
 * Store Part lines and every other line type genuinely need different
 * fields, not just different validation — a Store Part line picks a
 * PartType (grouped by its real parent PartCategory) and never sees a
 * price field at all, since that price can only ever come from
 * Store's own later match. Every other type keeps the existing
 * free-text description, with a price field shown only when the
 * current viewer actually has pricing authority for that type
 * (mirrors requirePricingAuthority server-side — this is just the
 * matching, honest UI for it, not a substitute for that real check).
 */
export function EstimateLineItemForm({
  jobCardId,
  categories,
  descriptionSuggestions,
  hasSundry,
  isTechnicianOnly,
}: {
  jobCardId: string;
  categories: PartCategoryWithTypes[];
  descriptionSuggestions: string[];
  hasSundry: boolean;
  isTechnicianOnly: boolean;
}) {
  const [type, setType] = useState('STORE_PART');
  const isStorePart = type === 'STORE_PART';
  // A technician only ever has pricing authority for what they
  // personally sourced outside the workshop — everything else is
  // priced by the supervisor. Store Part never gets a price field at
  // all, regardless of viewer, since that's Store's own job now.
  const canShowPriceField = !isStorePart && (!isTechnicianOnly || type === 'EXTERNAL_PART' || type === 'EXTERNAL_JOB');

  // Every Part Type is already loaded via the `categories` prop — no
  // server round-trip needed to search it, just a plain client-side
  // filter wrapped as a Promise to match SearchableSelect's own
  // (query) => Promise<SearchableOption[]> shape.
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
    <form action={addEstimateLineItemFormAction} className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--ejo-border)] pt-4 sm:grid-cols-5">
      <FormPendingOverlay />
      <input type="hidden" name="jobCardId" value={jobCardId} />
      <select
        name="type"
        required
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)] sm:col-span-1"
      >
        <option value="STORE_PART">Store Part</option>
        <option value="EXTERNAL_PART">External Part</option>
        <option value="EXTERNAL_JOB">External Job</option>
        <option value="INTERNAL_JOB">Internal Job</option>
        <option value="LABOUR">Labour</option>
        {!hasSundry ? <option value="SUNDRY">Sundry</option> : null}
      </select>

      {isStorePart ? (
        <div className="col-span-2 sm:col-span-2">
          <SearchableSelect
            name="partTypeId"
            required
            search={searchPartTypesLocal}
            loadDefaultOptions={loadAllPartTypesLocal}
            defaultOptionsLabel="All Part Types"
            placeholder="Search Part Types…"
            emptyMessage="No Part Type matches."
          />
        </div>
      ) : (
        <input
          name="description"
          required
          list="internal-job-suggestions"
          placeholder="Description"
          className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)] sm:col-span-2"
        />
      )}

      <input
        name="quantity"
        type="number"
        step="1"
        min="1"
        required
        defaultValue="1"
        placeholder="Qty"
        className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
      />

      {canShowPriceField ? (
        <input
          name="unitPrice"
          type="number"
          step="0.01"
          min="0"
          placeholder="Unit Price (optional)"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
        />
      ) : (
        <div className="flex items-center rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] px-2 py-2 text-[11px] text-[var(--ejo-text-muted)]">
          {isStorePart ? 'Priced by Store' : 'Priced by supervisor'}
        </div>
      )}

      <SubmitButton
        label="Add"
        pendingLabel="Adding…"
        className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] sm:col-span-5"
      />
      <p className="col-span-2 text-[11px] text-[var(--ejo-text-muted)] sm:col-span-5">
        {isStorePart
          ? 'Pick the kind of part needed — Store will match it to a real part in stock and set the price.'
          : 'Pricing: the technician prices External Part/Job lines (they sourced them); the supervisor prices Labour and Sundry.'}
      </p>

      <datalist id="internal-job-suggestions">
        {descriptionSuggestions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </form>
  );
}
