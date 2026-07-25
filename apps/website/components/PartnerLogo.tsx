'use client';

import { useState } from 'react';

interface PartnerLogoProps {
  name: string;
  filename: string;
}

/**
 * Renders a real logo image from public/images/partners/<filename>. Until
 * the real file is uploaded, `onError` swaps to a neutral text fallback
 * instead of the browser's default broken-image icon — so the carousel
 * looks intentional either way, and starts showing real logos the moment
 * a file is dropped into that folder with no code change.
 */
export function PartnerLogo({ name, filename }: PartnerLogoProps) {
  const [errored, setErrored] = useState(false);

  return (
    <div className="flex h-16 w-32 shrink-0 items-center justify-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 opacity-80 grayscale transition-all hover:opacity-100 hover:grayscale-0">
      {errored ? (
        <span className="text-xs font-bold tracking-tight text-[var(--ejo-text-muted)]">{name}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- intentional: needs a plain onError fallback, not next/image's stricter loader behaviour
        <img
          src={`/images/partners/${filename}`}
          alt={name}
          className="max-h-8 w-auto object-contain"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
