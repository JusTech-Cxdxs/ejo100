'use client';

import { UNIT_OF_MEASURE_OPTIONS } from '@/lib/data/unit-of-measure-catalog';

/**
 * Real, curated Unit of Measure suggestions (Piece, Set, Liter, Drum,
 * Hour, Job, and the rest of the actual Nigerian auto-parts framework)
 * — built on the same native `<datalist>` approach already proven for
 * vehicle Make/Model/Engine, since a unit's real submitted value
 * genuinely is the text itself ("Liter", not an opaque ID), unlike
 * PartType/PartCategory which need SearchableSelect's ID-resolving
 * behavior instead. Never a restriction: anything typed that isn't in
 * the list still submits exactly as typed.
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
  const listId = `${name}-uom-suggestions`;
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
            {u.group}: {u.label} ({u.code})
          </option>
        ))}
      </datalist>
    </>
  );
}
