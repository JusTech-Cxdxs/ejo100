'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from './SearchableSelect';

export type AvailableSerial = { serialNumber: string; receivedAt: string | Date };

/**
 * Every box shares one real source of truth: the Part's own currently
 * in-stock serials, in real FIFO order (earliest received first — the
 * same order Store's batch-tracked stock already follows). Nothing is
 * ever pre-filled — the field stays genuinely empty until the operator
 * actually picks something, exactly as asked; the FIFO order is only
 * ever offered as a clear, written-up suggestion alongside the box,
 * never silently chosen on their behalf. The moment a serial is picked
 * in one box, it's gone from every other box's own options — genuinely
 * impossible to release the same physical unit twice under two
 * different boxes by accident.
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

  // The suggestion is genuinely a live recommendation, not a fixed
  // assignment — box one's suggestion is always the earliest-received
  // serial not already picked anywhere else, so if the operator picks
  // something different for an earlier box, every later box's own
  // suggestion updates to reflect what's really still next in line.
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
                {new Date(suggestion.receivedAt).toLocaleDateString('en-NG')}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
