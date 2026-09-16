'use client';

import { useId } from 'react';

/**
 * Same real, proven native <datalist> approach as UnitOfMeasureInput
 * — anything typed submits exactly as typed, whether or not it
 * matches a suggestion, since a Service Type's category is real free
 * text on the model, not a foreign key to a separate entity. The
 * suggestions themselves are the real, existing categories already
 * in use, not a static catalog — passed in as a prop rather than
 * fetched here, since the page already has this real data loaded.
 */
export function ServiceCategoryInput({
  name,
  categories,
  defaultValue,
  placeholder,
  required,
}: {
  name: string;
  categories: string[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const listId = useId();
  return (
    <>
      <input
        name={name}
        list={listId}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder ?? 'e.g. Filters, Brakes, AC, Fluids'}
        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
      />
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
