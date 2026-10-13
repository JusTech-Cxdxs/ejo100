'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` once it has stopped changing for `delayMs`, so a
 * search-as-you-type field queries the server after the user pauses rather
 * than on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
