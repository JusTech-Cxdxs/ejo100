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
 * Searchable dropdown for lists too large to load in full. Each (debounced)
 * query calls the `search` server action. The chosen value is submitted
 * through a hidden <input>, like a native <select>.
 */
export function SearchableSelect({
  name,
  search,
  loadDefaultOptions,
  defaultOptionsLabel = 'Recent',
  placeholder = 'Search…',
  required,
  defaultValue,
  defaultLabel,
  onChange,
  emptyMessage = 'No matches.',
  minQueryLength = 1,
  debounceMs = 300,
  id,
}: {
  name: string;
  search: (query: string) => Promise<SearchableOption[]>;
  /** Optional options shown before anything is typed (e.g. recent
   * customers). Without it the dropdown stays closed until a query. */
  loadDefaultOptions?: () => Promise<SearchableOption[]>;
  defaultOptionsLabel?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  defaultLabel?: string;
  onChange?: (value: string) => void;
  emptyMessage?: string;
  minQueryLength?: number;
  debounceMs?: number;
  /** The text field's id, for a <label htmlFor>. */
  id?: string;
}) {
  const [selectedValue, setSelectedValue] = useState(defaultValue ?? '');
  const [query, setQuery] = useState(defaultLabel ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchableOption[]>([]);
  const [state, setState] = useState<SearchState>('idle');
  const [showingDefaults, setShowingDefaults] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0); // guards against an older, slower response overwriting a newer one
  const listboxId = useId();
  const debouncedQuery = useDebouncedValue(query, debounceMs);

  // Search when the debounced query changes. The request counter discards
  // a slower, older response so it can't overwrite newer results.
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    const requestId = ++requestIdRef.current;

    if (trimmed.length < minQueryLength) {
      if (!loadDefaultOptions) {
        setResults([]);
        setState('idle');
        setShowingDefaults(false);
        return;
      }
      setState('loading');
      setShowingDefaults(true);
      loadDefaultOptions()
        .then((found) => {
          if (requestId !== requestIdRef.current) return;
          setResults(found);
          setState('success');
          setHighlightIndex(0);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setResults([]);
          setState('error');
        });
      return;
    }

    setState('loading');
    setShowingDefaults(false);
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
  }, [debouncedQuery, minQueryLength, search, loadDefaultOptions]);

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

  const showDropdown = open && (query.trim().length >= minQueryLength || Boolean(loadDefaultOptions));

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selectedValue} required={required} />
      <input
        id={id}
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
          className="absolute z-30 mt-1 max-h-[min(16rem,45dvh)] w-full overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-lg"
        >
          {state === 'loading' ? (
            <p className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {showingDefaults ? 'Loading…' : 'Searching…'}
            </p>
          ) : state === 'error' ? (
            <p className="px-3 py-2 text-xs text-[var(--ejo-error)]">
              Something went wrong {showingDefaults ? 'loading suggestions' : 'searching'} — try again.
            </p>
          ) : state === 'success' && results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
              {showingDefaults ? 'Nothing to suggest yet — start typing to search.' : emptyMessage}
            </p>
          ) : (
            <>
              {showingDefaults ? (
                <p className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--ejo-text-muted)]">
                  {defaultOptionsLabel}
                </p>
              ) : null}
              {results.map((option, i) => (
                <button
                  key={option.value}
                  id={`${listboxId}-option-${i}`}
                  role="option"
                  aria-selected={i === highlightIndex}
                  type="button"
                  onClick={() => selectOption(option)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={`block min-h-10 w-full px-3 py-2 text-left text-sm ${
                    i === highlightIndex ? 'bg-[var(--ejo-primary)]/10' : ''
                  }`}
                >
                  <span className="text-[var(--ejo-text)]">{option.label}</span>
                  {option.sublabel ? (
                    <span className="block break-words text-xs text-[var(--ejo-text-muted)] [overflow-wrap:anywhere] sm:ml-2 sm:inline">{option.sublabel}</span>
                  ) : null}
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
