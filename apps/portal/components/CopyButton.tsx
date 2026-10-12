'use client';

import { useState } from 'react';

/** Copies a short value (a reference, a number) and says so. */
export function CopyButton({ value, label = 'Copy', className = '' }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" onClick={copy} aria-label={`${label} ${value}`} className={`rounded-md px-2 py-0.5 text-xs font-medium text-[var(--ejo-primary)] transition hover:bg-[var(--ejo-primary)]/10 ${className}`}>
      {copied ? 'Copied' : label}
      <span className="sr-only" aria-live="polite">{copied ? ' to the clipboard' : ''}</span>
    </button>
  );
}
