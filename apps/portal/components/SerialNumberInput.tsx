'use client';

import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { checkSerialNumberExists } from '@/lib/actions/store';

/**
 * Two genuinely different problems, checked two genuinely different
 * ways: a duplicate against another box on this SAME form is a pure
 * client-side fact (no serial number in the real world can ever be
 * the same as another), checked instantly on every keystroke with no
 * server round-trip needed. A serial already recorded somewhere else
 * in the real catalog is checked against the real database, debounced
 * so it fires once the operator actually pauses, not on every single
 * keystroke — the same real-time feedback recordGoodsReceipt's own
 * server-side rejection already guaranteed, just surfaced the moment
 * it's typed instead of only after the whole form is submitted.
 */
export function SerialNumberInput({
  index,
  value,
  otherValues,
  onChange,
  onValidityChange,
}: {
  index: number;
  value: string;
  otherValues: string[];
  onChange: (value: string) => void;
  onValidityChange: (hasError: boolean) => void;
}) {
  const trimmed = value.trim();
  const duplicateInForm = trimmed !== '' && otherValues.some((v) => v.trim().toLowerCase() === trimmed.toLowerCase());

  const debouncedValue = useDebouncedValue(trimmed, 400);
  const [catalogState, setCatalogState] = useState<'idle' | 'checking' | 'ok' | 'exists'>('idle');

  useEffect(() => {
    // A within-form duplicate is already the real, more urgent
    // problem — no need to also spend a real server call confirming
    // whether it happens to exist in the catalog too.
    if (!debouncedValue || duplicateInForm) {
      setCatalogState('idle');
      return;
    }
    let cancelled = false;
    setCatalogState('checking');
    checkSerialNumberExists(debouncedValue)
      .then((exists) => {
        if (cancelled) return;
        setCatalogState(exists ? 'exists' : 'ok');
      })
      .catch(() => {
        if (cancelled) return;
        setCatalogState('idle');
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedValue, duplicateInForm]);

  const hasError = duplicateInForm || catalogState === 'exists';

  // The real, exact cause of a genuine browser freeze the moment this
  // section renders — confirmed directly, not guessed at. The parent
  // form passes onValidityChange as a fresh inline arrow function on
  // every one of its own renders (it has to — a stable one would need
  // useCallback called inside a .map() loop, which breaks React's own
  // rules of hooks). A useEffect that depends on that unstable
  // reference re-fires every render, calls back into the parent,
  // triggers a parent state update, and the parent re-renders with yet
  // another new reference — a real, genuine infinite loop, not a
  // one-off glitch. A ref sidesteps this at the root: the effect
  // itself only ever depends on the real value that matters
  // (hasError), and always calls whatever the latest real callback
  // happens to be via the ref, without that callback's own identity
  // ever being part of the dependency array at all.
  const onValidityChangeRef = useRef(onValidityChange);
  onValidityChangeRef.current = onValidityChange;

  useEffect(() => {
    onValidityChangeRef.current(hasError);
  }, [hasError]);

  return (
    <div className="flex-1">
      <input
        name="serialNumbers"
        required={index === 0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. the DOT code or stamped serial"
        aria-invalid={hasError}
        className={`w-full rounded-[var(--ejo-radius-md)] border bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)] ${
          hasError ? 'border-[var(--ejo-error)]' : 'border-[var(--ejo-border)]'
        }`}
      />
      {duplicateInForm ? (
        <p className="mt-1 text-xs text-[var(--ejo-error)]">Already entered above — no serial number can be used twice.</p>
      ) : catalogState === 'exists' ? (
        <p className="mt-1 text-xs text-[var(--ejo-error)]">Already recorded elsewhere in the catalog — this can&apos;t be reused.</p>
      ) : catalogState === 'checking' ? (
        <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Checking…</p>
      ) : null}
    </div>
  );
}
