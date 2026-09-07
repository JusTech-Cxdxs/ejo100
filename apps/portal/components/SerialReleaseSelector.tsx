'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from './SearchableSelect';

/**
 * Every box shares one real source of truth: the Part's own currently
 * in-stock serials, already fetched in real FIFO order (earliest
 * received first — the same order Store's batch-tracked stock already
 * follows). Each box defaults to the next unpicked FIFO serial, so
 * clicking an empty box shows the right suggestion immediately; typing
 * still searches freely among whatever's left. The moment a serial is
 * picked in one box, it's gone from every other box's own options —
 * genuinely impossible to release the same physical unit twice under
 * two different line items by accident.
 */
export function SerialReleaseSelector({
  lineId,
  quantityNeeded,
  availableSerials,
}: {
  lineId: string;
  quantityNeeded: number;
  availableSerials: string[];
}) {
  // FIFO defaults: box 0 gets the earliest-received serial still
  // available, box 1 the next, and so on — exactly the suggestion the
  // user asked for, right from the moment the form first renders.
  const [picked, setPicked] = useState<string[]>(() => availableSerials.slice(0, quantityNeeded));

  function optionsExcludingOtherBoxes(boxIndex: number): SearchableOption[] {
    const pickedElsewhere = new Set(picked.filter((_, i) => i !== boxIndex));
    return availableSerials.filter((s) => !pickedElsewhere.has(s)).map((s) => ({ value: s, label: s }));
  }

  return (
    <div className="space-y-1.5">
      {Array.from({ length: quantityNeeded }).map((_, i) => {
        const boxOptions = optionsExcludingOtherBoxes(i);
        return (
          <SearchableSelect
            key={i}
            name={`serials_${lineId}`}
            defaultValue={picked[i] ?? ''}
            defaultLabel={picked[i] ?? ''}
            required
            placeholder={`Search serial numbers — Unit ${i + 1} of ${quantityNeeded}`}
            emptyMessage="No matching in-stock serial — it may already be picked above."
            defaultOptionsLabel="Available now, earliest received first"
            search={async (query) => {
              const q = query.trim().toLowerCase();
              return boxOptions.filter((o) => o.label.toLowerCase().includes(q));
            }}
            loadDefaultOptions={async () => boxOptions}
            onChange={(value) => {
              setPicked((prev) => {
                const next = [...prev];
                next[i] = value;
                return next;
              });
            }}
          />
        );
      })}
    </div>
  );
}
