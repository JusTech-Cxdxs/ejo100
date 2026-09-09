'use client';

import { useEffect, useRef, useState } from 'react';
import { PrinterIcon, ChevronDownIcon, BuildingIcon, UserCheckIcon } from '@/components/icons';

export function PrintMenu({ orgHref, clientHref, clientLabel = 'Collector Copy' }: { orgHref: string; clientHref: string; clientLabel?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative inline-block print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
      >
        <PrinterIcon className="h-4 w-4" />
        Print
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute left-0 z-10 mt-2 w-56 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-lg">
          <a
            href={orgHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
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
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 border-t border-[var(--ejo-border)] px-4 py-3 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
          >
            <UserCheckIcon className="h-4 w-4 text-[var(--ejo-primary)]" />
            <span>
              <span className="block font-medium">{clientLabel}</span>
              <span className="block text-xs text-[var(--ejo-text-muted)]">Simple acknowledgment copy</span>
            </span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
