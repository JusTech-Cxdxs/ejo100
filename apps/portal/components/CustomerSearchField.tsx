'use client';

import { SearchableSelect } from './SearchableSelect';
import { searchCustomers, listRecentCustomers } from '@/lib/actions/workshop';

/**
 * The reusable "pick a customer by searching" field — every place that
 * just needs a customer selected (Vehicle registration's Owner field,
 * and the customer half of CustomerVehiclePicker's cascading picker)
 * uses this one component, rather than each wiring up SearchableSelect
 * + searchCustomers + the option-mapping shape separately.
 *
 * Shows the most recently registered customers by default before
 * anyone types — the common case (the same customer as earlier today)
 * needs zero typing.
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
      defaultOptionsLabel="Recent customers"
      onChange={onSelect}
      loadDefaultOptions={async () => {
        const recent = await listRecentCustomers();
        return recent.map((c) => ({
          value: c.id,
          label: c.fullName,
          sublabel: c.phone ? `${c.email} · ${c.phone}` : c.email,
        }));
      }}
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
