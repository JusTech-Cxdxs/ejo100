'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from './SearchableSelect';
import { formatDateOnly } from '@/lib/utils/format-date';

export type AvailableSerial = { serialNumber: string; receivedAt: string | Date };

/**
 * Pick the serials to release from the part's in-stock serials (oldest
 * first). Nothing is pre-filled; the FIFO choice is shown as a suggestion.
 * A serial picked in one box is removed from the others.
 */
export function SerialReleaseSelector({
  lineId,
  quantityNeeded,
  availableSerials,
}: {
  lineId: string;
  quantityNeeded: number;
  availableSerials: AvailableSerial[];
}) {
  const [picked, setPicked] = useState<string[]>(() => Array(quantityNeeded).fill(''));

  function optionsExcludingOtherBoxes(boxIndex: number): SearchableOption[] {
    const pickedElsewhere = new Set(picked.filter((_, i) => i !== boxIndex && Boolean(picked[i])));
    return availableSerials.filter((s) => !pickedElsewhere.has(s.serialNumber)).map((s) => ({ value: s.serialNumber, label: s.serialNumber }));
  }

  // Each box suggests the oldest serial not picked elsewhere, so the
  // suggestions update as boxes are filled.
  function fifoSuggestionFor(boxIndex: number): AvailableSerial | undefined {
    const pickedElsewhere = new Set(picked.filter((_, i) => i !== boxIndex && Boolean(picked[i])));
    return availableSerials.find((s) => !pickedElsewhere.has(s.serialNumber));
  }

  return (
    <div className="space-y-2.5">
      {Array.from({ length: quantityNeeded }).map((_, i) => {
        const boxOptions = optionsExcludingOtherBoxes(i);
        const suggestion = fifoSuggestionFor(i);
        return (
          <div key={i}>
            <SearchableSelect
              name={`serials_${lineId}`}
              defaultValue=""
              required
              placeholder={`Unit ${i + 1} of ${quantityNeeded} — search or pick a serial number`}
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
            {suggestion ? (
              <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
                Suggested (FIFO — earliest received in stock): <span className="font-medium text-[var(--ejo-text)]">{suggestion.serialNumber}</span>, received{' '}
                {formatDateOnly(new Date(suggestion.receivedAt))}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
