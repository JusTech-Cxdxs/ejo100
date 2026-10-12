'use client';

import { useId } from 'react';
import { UNIT_OF_MEASURE_OPTIONS } from '@/lib/data/unit-of-measure-catalog';

/**
 * Unit of measure with suggestions (Piece, Set, Litre, Drum, Hour…) through a
 * native <datalist>; any other text is accepted. The datalist id comes from
 * useId() because two inputs with the same `name` can be on one page.
 */
export function UnitOfMeasureInput({
  name,
  defaultValue,
  placeholder,
  required,
}: {
  name: string;
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
        placeholder={placeholder ?? 'e.g. Piece, Liter, Set…'}
        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
      />
      <datalist id={listId}>
        {UNIT_OF_MEASURE_OPTIONS.map((u) => (
          <option key={u.code} value={u.label}>
            {u.group}: {u.label}{u.hint ? ` — ${u.hint}` : ''} ({u.code})
          </option>
        ))}
      </datalist>
    </>
  );
}
