'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

export type SearchableOption = {
  value: string;
  label: string;
  sublabel?: string; // shown smaller/muted next to the label — e.g. a customer's email/phone
};

type SearchState = 'idle' | 'loading' | 'success' | 'error';

/**
 * A real server-backed searchable dropdown — the permanent replacement
 * for a plain <select> anywhere the option list is too large to load in
 * full (customers, vehicles, and later technicians/parts/estimates).
 * Deliberately built as the ONLY foundation for this pattern going
 * forward: every keystroke (after a debounce) queries the real database
 * through a passed-in Server Action, so results are always complete and
 * current — never a filtered slice of some earlier, capped snapshot.
 *
 * No new dependency added — plain React state + the project's existing
 * Server Action → Prisma pattern. The selected value is carried by a
 * real hidden <input>, so any <form action={someServerAction}> this
 * sits inside submits exactly the same FormData shape a native <select>
 * would.
 *
 * Reusable by design: `search` is the only thing that changes between
 * uses (searchCustomers, a future searchTechnicians, searchParts, etc.)
 * — everything else (debouncing, loading/empty/error states, keyboard
 * navigation, accessibility, race-condition handling) is common and
 * shouldn't need to be rebuilt per entity type.
 */
export function SearchableSelect({
  name,
  search,
  placeholder = 'Search…',
  required,
  defaultValue,
  defaultLabel,
  onChange,
  emptyMessage = 'No matches.',
  minQueryLength = 1,
  debounceMs = 300,
}: {
  name: string;
  search: (query: string) => Promise<SearchableOption[]>;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  defaultLabel?: string;
  onChange?: (value: string) => void;
  emptyMessage?: string;
  minQueryLength?: number;
  debounceMs?: number;
}) {
  const [selectedValue, setSelectedValue] = useState(defaultValue ?? '');
  const [query, setQuery] = useState(defaultLabel ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchableOption[]>([]);
  const [state, setState] = useState<SearchState>('idle');
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0); // guards against an older, slower response overwriting a newer one
  const listboxId = useId();
  const debouncedQuery = useDebouncedValue(query, debounceMs);

  // Run the actual search whenever the debounced query changes. A
  // request-generation counter means that if the user types quickly
  // enough to fire two searches, and the FIRST one's network response
  // happens to arrive after the SECOND's, the stale first response is
  // discarded instead of overwriting the correct, newer results.
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < minQueryLength) {
      setResults([]);
      setState('idle');
      return;
    }

    const requestId = ++requestIdRef.current;
    setState('loading');

    search(trimmed)
      .then((found) => {
        if (requestId !== requestIdRef.current) return; // a newer search has since superseded this one
        setResults(found);
        setState('success');
        setHighlightIndex(0);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setResults([]);
        setState('error');
      });
  }, [debouncedQuery, minQueryLength, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectOption(option: SearchableOption) {
    setSelectedValue(option.value);
    setQuery(option.label);
    setOpen(false);
    onChange?.(option.value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = results[highlightIndex];
      if (option) selectOption(option);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showDropdown = open && query.trim().length >= minQueryLength;

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selectedValue} required={required} />
      <input
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-busy={state === 'loading'}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedValue(''); // typing invalidates a previous selection until a real option is chosen again
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
      />

      {showDropdown ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-lg"
        >
          {state === 'loading' ? (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Searching…
            </p>
          ) : state === 'error' ? (
            <p className="px-3 py-2 text-xs text-[var(--ejo-error)]">
              Something went wrong searching — try again.
            </p>
          ) : state === 'success' && results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{emptyMessage}</p>
          ) : (
            results.map((option, i) => (
              <button
                key={option.value}
                id={`${listboxId}-option-${i}`}
                role="option"
                aria-selected={i === highlightIndex}
                type="button"
                onClick={() => selectOption(option)}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  i === highlightIndex ? 'bg-[var(--ejo-primary)]/10' : ''
                }`}
              >
                <span className="text-[var(--ejo-text)]">{option.label}</span>
                {option.sublabel ? (
                  <span className="ml-2 text-xs text-[var(--ejo-text-muted)]">{option.sublabel}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
