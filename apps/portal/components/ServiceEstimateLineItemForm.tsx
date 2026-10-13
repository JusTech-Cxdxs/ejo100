'use client';

import { addServiceEstimateLineItemFormAction } from '@/lib/actions/vehicle-service-estimate-form-handlers';
import { EstimateLineAddForm, type PartCategoryWithTypes } from '@/components/EstimateLineAddForm';

const TYPES = [
  { value: 'STORE_PART', label: 'Store Part' },
  { value: 'INTERNAL_JOB', label: 'Internal Job' },
  { value: 'LABOUR', label: 'Labour' },
  { value: 'SUNDRY', label: 'Sundry' },
];

/**
 * Vehicle Service version of EstimateLineItemForm. There are no external
 * lines, so only the supervisor prices lines (requireServicePricingAuthority
 * enforces this on the server).
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
  return (
    <EstimateLineAddForm
      action={addServiceEstimateLineItemFormAction}
      hidden={
        <>
          <input type="hidden" name="estimateId" value={estimateId} />
          <input type="hidden" name="vehicleServiceId" value={vehicleServiceId} />
        </>
      }
      typeOptions={TYPES.filter((t) => t.value !== 'SUNDRY' || !hasSundry)}
      categories={categories}
      descriptionSuggestions={descriptionSuggestions}
      datalistId="service-estimate-line-suggestions"
      // Technicians never price Vehicle Service lines.
      canPrice={() => !isTechnicianOnly}
      pricingHint="Pricing: the supervisor prices Internal Job, Labour and Sundry lines."
    />
  );
}
