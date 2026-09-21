'use client';

import { useState } from 'react';
import { addServiceEstimateLineItemFormAction } from '@/lib/actions/vehicle-service-estimate-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { UnitOfMeasureInput } from '@/components/UnitOfMeasureInput';

type PartCategoryWithTypes = {
  id: string;
  name: string;
  types: { id: string; name: string; typicalUnit: string | null }[];
};

/**
 * The real Vehicle Service equivalent of Job Card's own
 * EstimateLineItemForm — same exact real UX (Store Part picks a real
 * PartType, grouped by its real parent PartCategory, and never sees
 * a price field; every other type keeps free-text description with
 * a price field). The one genuine difference: Vehicle Service has no
 * External Part/Job concept at all, so there's no case where the
 * technician ever has real pricing authority here — every priced
 * line (Internal Job, Labour, Sundry) is supervisor-only, matching
 * requireServicePricingAuthority server-side exactly. This is just
 * the matching, honest UI for that real rule, not a substitute for
 * the real check.
 */
export function ServiceEstimateLineItemForm({
  vehicleServiceId,
  estimateId,
  categories,
  descriptionSuggestions,
  hasSundry,
  isTechnicianOnly,
}: {
  vehicleServiceId: string;
  estimateId: string;
  categories: PartCategoryWithTypes[];
  descriptionSuggestions: string[];
  hasSundry: boolean;
  isTechnicianOnly: boolean;
}) {
  const [type, setType] = useState('STORE_PART');
  const isStorePart = type === 'STORE_PART';
  // Same real preview-only purpose as Job Card's own version — looked
  // up from what's already in the catalog for this Part Type, never
  // guessed, and never the value that actually gets submitted; that
  // still only ever comes from Store's own real match.
  const [selectedPartTypeId, setSelectedPartTypeId] = useState('');
  const selectedPartType = categories.flatMap((c) => c.types).find((t) => t.id === selectedPartTypeId);
  // No External Part/Job here at all — the technician never has real
  // pricing authority on any Vehicle Service line, unlike Job Card's
  // own real exception for what a technician personally sourced.
  const canShowPriceField = !isStorePart && !isTechnicianOnly;

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
    <form action={addServiceEstimateLineItemFormAction} className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--ejo-border)] pt-4 sm:grid-cols-6">
      <FormPendingOverlay />
      <input type="hidden" name="estimateId" value={estimateId} />
      <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
      <select
        name="type"
        required
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)] sm:col-span-1"
      >
        <option value="STORE_PART">Store Part</option>
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
            onChange={setSelectedPartTypeId}
          />
        </div>
      ) : (
        <input
          name="description"
          required
          list="service-estimate-line-suggestions"
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

      {isStorePart ? (
        <input
          type="text"
          readOnly
          value={selectedPartType?.typicalUnit ?? ''}
          placeholder={selectedPartType ? 'Varies' : 'Unit'}
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-xs text-[var(--ejo-text)]"
        />
      ) : (
        <UnitOfMeasureInput name="unitOfMeasure" placeholder="Unit" />
      )}

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
        className="col-span-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] sm:col-span-6"
      />
      <p className="col-span-2 text-[11px] text-[var(--ejo-text-muted)] sm:col-span-6">
        {isStorePart
          ? 'Pick the kind of part needed — the Unit shown is a preview from what\u2019s already in stock; Store still confirms the exact part and price.'
          : 'Pricing: the supervisor prices Internal Job, Labour and Sundry lines.'}
      </p>

      <datalist id="service-estimate-line-suggestions">
        {descriptionSuggestions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </form>
  );
}
