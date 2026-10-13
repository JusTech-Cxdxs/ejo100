'use client';

import { useState } from 'react';
import { Icon } from './Icon';

/** Copies a value (account number, reference) with a clear "Copied" tick. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const t = document.createElement('textarea');
      t.value = value;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs sm:h-8 sm:px-2.5 font-medium transition-colors ${copied ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/10 text-[var(--ejo-success)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)] hover:text-[var(--ejo-primary)]'}`}
    >
      <Icon name={copied ? 'check' : 'copy'} size={13} strokeWidth={2.2} />
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
