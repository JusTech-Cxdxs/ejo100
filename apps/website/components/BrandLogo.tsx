'use client';

import { useState } from 'react';

interface BrandLogoProps {
  transparent?: boolean;
  size?: number;
}

/**
 * Looks for a real logo at public/images/logo/logo.svg first, then
 * public/images/logo/logo.png. If neither exists yet, falls back to the
 * "K" monogram circle so the header never looks broken in the meantime —
 * drop a real logo file into that folder (see README_CHANGES.md) and it
 * takes over automatically, no code change required.
 */
export function BrandLogo({ transparent = false, size = 36 }: BrandLogoProps) {
  const [svgFailed, setSvgFailed] = useState(false);
  const [pngFailed, setPngFailed] = useState(false);

  if (!svgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- needs plain onError fallback chaining (svg -> png -> monogram)
      <img
        src="/images/logo/logo.svg"
        alt="KCG Logo"
        style={{ height: size, width: 'auto' }}
        onError={() => setSvgFailed(true)}
      />
    );
  }

  if (!pngFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/images/logo/logo.svg"
        alt="KCG Logo"
        style={{ height: size, width: 'auto' }}
        onError={() => setPngFailed(true)}
      />
    );
  }

  return (
    <span
      className={`flex items-center justify-center rounded-full text-lg font-bold ${
        transparent ? 'bg-white/15 text-white' : 'bg-[var(--ejo-primary)] text-white'
      }`}
      style={{ height: size, width: size }}
    >
      K
    </span>
  );
}
