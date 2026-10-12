'use client';

import { useState } from 'react';

interface PartnerLogoProps {
  name: string;
  filename: string;
}

/**
 * A partner logo from public/images/partners/. Pass only the file name
 * (e.g. "soueast-img.png"); the folder is added here. A missing file shows
 * a text fallback. Logos keep their own colours and proportions.
 */
export function PartnerLogo({ name, filename }: PartnerLogoProps) {
  const [errored, setErrored] = useState(false);

  return (
    <div className="flex h-24 w-44 shrink-0 items-center justify-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3 transition-transform duration-300 hover:scale-105">
      {errored ? (
        <span className="text-sm font-bold tracking-tight text-[var(--ejo-text-muted)]">{name}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- intentional: needs a plain onError fallback, not next/image's stricter loader behaviour
        <img
          src={`/images/partners/${filename}`}
          alt={name}
          className="h-full max-h-20 w-full max-w-full object-contain"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
