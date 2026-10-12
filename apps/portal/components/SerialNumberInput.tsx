'use client';

import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { checkSerialNumberExists } from '@/lib/actions/store';

/**
 * Serial number box. Duplicates within the form are checked instantly;
 * serials already in the database are checked after a pause in typing.
 * recordGoodsReceipt rejects both on the server as well.
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
    // Already a duplicate here: skip the server check.
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

  // The parent passes a new onValidityChange on every render (it is created
  // in a .map()). Keeping it in a ref, and depending only on hasError,
  // avoids an infinite render loop.
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
