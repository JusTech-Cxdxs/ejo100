'use client';

import { useCallback, useRef, useState } from 'react';
import { FloatingLayer } from '@/components/ui/FloatingLayer';
import { PrinterIcon, ChevronDownIcon, BuildingIcon, UserCheckIcon } from '@/components/icons';

export function PrintMenu({
  orgHref,
  clientHref,
  clientLabel = 'Collector Copy',
  align = 'left',
  size = 'default',
}: {
  orgHref: string;
  clientHref: string;
  clientLabel?: string;
  /** Edge the menu aligns to. Use 'right' for a button at the right of its
   * container, or the menu runs off-screen. */
  align?: 'left' | 'right';
  /** 'compact' matches the small outlined action buttons used in cards and tables. */
  size?: 'default' | 'compact';
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="relative inline-block print:hidden">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          size === 'compact'
            ? 'inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] transition hover:bg-[var(--ejo-bg)]'
            : 'inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90'
        }
      >
        <PrinterIcon className="h-4 w-4" />
        Print
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Drawn above headers, tab bars and tables, so it never blends into them. */}
      <FloatingLayer anchor={button} open={open} onClose={close} align={align} width="14.5rem" label="Print">
        <div>
          <a
            href={orgHref}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-12 items-center gap-2.5 px-4 py-3 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
          >
            <BuildingIcon className="h-4 w-4 text-[var(--ejo-primary)]" />
            <span>
              <span className="block font-medium">Organisation Copy</span>
              <span className="block text-xs text-[var(--ejo-text-muted)]">Full record for internal files</span>
            </span>
          </a>
          <a
            href={clientHref}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-12 items-center gap-2.5 border-t border-[var(--ejo-border)] px-4 py-3 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
          >
            <UserCheckIcon className="h-4 w-4 text-[var(--ejo-primary)]" />
            <span>
              <span className="block font-medium">{clientLabel}</span>
              <span className="block text-xs text-[var(--ejo-text-muted)]">Simple acknowledgment copy</span>
            </span>
          </a>
        </div>
      </FloatingLayer>
    </div>
  );
}
