'use client';

import { SearchableSelect } from './SearchableSelect';
import { searchCustomers } from '@/lib/actions/workshop';

/**
 * The reusable "pick a customer by searching" field — every place that
 * just needs a customer selected (Vehicle registration's Owner field,
 * and the customer half of CustomerVehiclePicker's cascading picker)
 * uses this one component, rather than each wiring up SearchableSelect
 * + searchCustomers + the option-mapping shape separately.
 */
export function CustomerSearchField({
  name = 'customerId',
  required,
  onSelect,
}: {
  name?: string;
  required?: boolean;
  onSelect?: (customerId: string) => void;
}) {
  return (
    <SearchableSelect
      name={name}
      required={required}
      placeholder="Search by name, email, or phone…"
      emptyMessage="No customer matches — check the spelling, or add them first."
      onChange={onSelect}
      search={async (query) => {
        const found = await searchCustomers(query);
        return found.map((c) => ({
          value: c.id,
          label: c.fullName,
          sublabel: c.phone ? `${c.email} · ${c.phone}` : c.email,
        }));
      }}
    />
  );
}
