'use client';

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

/**
 * Segmented entry for VIN/chassis (17 characters) and Nigerian plates
 * (AAA 000 AA). Only the joined value is submitted, through one hidden input
 * named `name`.
 */
export function SegmentedCodeInput({
  name,
  length,
  groups,
  placeholder = '',
  defaultValue = '',
}: {
  name: string;
  length: number;
  groups: number[]; // e.g. [3, 3, 2] for a plate — must sum to `length`
  placeholder?: string;
  defaultValue?: string;
}) {
  const [chars, setChars] = useState<string[]>(() => {
    const initial = defaultValue.toUpperCase().split('').slice(0, length);
    return Array.from({ length }, (_, i) => initial[i] ?? '');
  });
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function setChar(index: number, value: string) {
    const char = value.slice(-1).toUpperCase();
    setChars((prev) => {
      const next = [...prev];
      next[index] = char;
      return next;
    });
    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !chars[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < length - 1) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/\s+/g, '').slice(0, length);
    const next = Array.from({ length }, (_, i) => pasted[i] ?? '');
    setChars(next);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  const joined = chars.join('');

  // Build box index ranges per group, e.g. groups=[3,3,2] -> [[0,1,2],[3,4,5],[6,7]]
  let cursor = 0;
  const groupRanges = groups.map((size) => {
    const range = Array.from({ length: size }, (_, i) => cursor + i);
    cursor += size;
    return range;
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name={name} value={joined} />
      {groupRanges.map((range, groupIndex) => (
        <div key={groupIndex} className="flex flex-wrap gap-1">
          {range.map((i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="text"
              maxLength={1}
              value={chars[i]}
              placeholder={placeholder[i] ?? ''}
              onChange={(e) => setChar(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              className="h-10 w-8 rounded-[var(--ejo-radius-sm,6px)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-center text-sm font-semibold uppercase text-[var(--ejo-text)] outline-none focus:border-[var(--ejo-primary)]"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
