'use client';

import { useState } from 'react';

interface PartnerLogoProps {
  name: string;
  filename: string;
}

/**
 * Renders a real logo image from public/images/partners/<filename> — pass
 * only the bare filename (e.g. "soueast-img.png"), never a path with
 * "/public/" or "/images/partners/" already in it; this component adds
 * that prefix itself, so including it again produces a broken (doubled)
 * path. Until the real file is uploaded, `onError` swaps to a neutral
 * text fallback instead of the browser's default broken-image icon.
 *
 * Logos render in their original colours at all times — no grayscale
 * filter, on hover or otherwise — and each fills most of its card via a
 * large fixed-height box with object-contain, so proportions are never
 * distorted regardless of each logo's original aspect ratio.
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
