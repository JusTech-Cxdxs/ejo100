'use client';

import { SearchableSelect } from './SearchableSelect';
import { searchCustomers, listRecentCustomers } from '@/lib/actions/workshop';

/**
 * Search-and-pick a customer (vehicle owner, CustomerVehiclePicker). Shows
 * the most recently registered customers before anything is typed.
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
