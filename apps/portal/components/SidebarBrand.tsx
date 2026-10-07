'use client';

import { useState } from 'react';

/**
 * The organisation's wordmark at the top of the menu — the same lockup as
 * the printed document header (components/print/DocumentHeader.tsx): the
 * logo, the first word of the name large and heavy, and the rest of the name
 * smaller beneath, set off by a thin accent rule that runs flush to the end
 * of the first word. Colours come from the theme so it reads in light and dark.
 */
export function SidebarBrand({ organisationName }: { organisationName: string }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const words = organisationName.trim().split(/\s+/);
  const top = words[0] ?? organisationName;
  const bottom = words.slice(1).join(' ');
  return (
    <div className="flex items-center" title={organisationName}>
      {logoFailed ? (
        <span className="mr-1 flex h-10 w-[33px] items-center justify-center rounded-md bg-[var(--ejo-primary)] text-base font-bold text-white">{top.charAt(0)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- plain onError fallback to the monogram
        <img src="/images/logo/logo.png" alt="" width={33} height={40} className="mr-1 block h-10 w-[33px] object-contain" onError={() => setLogoFailed(true)} />
      )}
      <div className="inline-flex min-w-0 flex-col items-stretch">
        <span className="truncate text-[22px] font-extrabold leading-none tracking-[0.01em] text-[var(--ejo-text)]">{top}</span>
        {bottom ? (
          <span className="mt-1 flex items-center">
            <span className="mr-1.5 flex-1 border-b-[1.25px] border-[var(--ejo-primary)]" />
            <span className="whitespace-nowrap text-[11px] font-semibold leading-none text-[var(--ejo-text-muted)]">{bottom}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
