'use client';

import { useEffect, useState } from 'react';

/**
 * Delays reflecting a fast-changing value (e.g. every keystroke) until
 * it's been stable for `delayMs` — the standard building block for
 * search-as-you-type: fire the actual server search only after the user
 * pauses, not on every single keystroke. Generic and reusable by any
 * future async search (Technicians, Parts, Estimates), not specific to
 * customers or vehicles.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
