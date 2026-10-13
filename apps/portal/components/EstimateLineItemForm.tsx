'use client';

import { addEstimateLineItemFormAction } from '@/lib/actions/workshop-form-handlers';
import { EstimateLineAddForm, type PartCategoryWithTypes } from '@/components/EstimateLineAddForm';

const TYPES = [
  { value: 'STORE_PART', label: 'Store Part' },
  { value: 'EXTERNAL_PART', label: 'External Part' },
  { value: 'EXTERNAL_JOB', label: 'External Job' },
  { value: 'INTERNAL_JOB', label: 'Internal Job' },
  { value: 'LABOUR', label: 'Labour' },
  { value: 'SUNDRY', label: 'Sundry' },
];

/**
 * A Store Part line picks a Part Type and has no price (the Store prices it
 * when matching). Other types take a description, and a price only when the
 * viewer may price that type. requirePricingAuthority enforces this on the
 * server; hiding the field here is only for clarity.
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
  return (
    <EstimateLineAddForm
      action={addEstimateLineItemFormAction}
      hidden={<input type="hidden" name="jobCardId" value={jobCardId} />}
      typeOptions={TYPES.filter((t) => t.value !== 'SUNDRY' || !hasSundry)}
      categories={categories}
      descriptionSuggestions={descriptionSuggestions}
      datalistId="internal-job-suggestions"
      // Technicians price only what they sourced outside; the supervisor prices the rest.
      canPrice={(type) => !isTechnicianOnly || type === 'EXTERNAL_PART' || type === 'EXTERNAL_JOB'}
      pricingHint="Pricing: the technician prices External Part/Job lines (they sourced them); the supervisor prices Labour and Sundry."
    />
  );
}
