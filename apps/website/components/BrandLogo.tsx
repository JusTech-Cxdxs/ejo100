'use client';

import { siteConfig } from '@/lib/site-config';
import { useState } from 'react';

interface BrandLogoProps {
  transparent?: boolean;
  size?: number;
}

/**
 * Single shared logo component used by both Header and Footer — PNG is
 * the primary, production organisation logo (public/images/logo/logo.png).
 * directly, with exactly one fallback state (a one-letter monogram) if the
 * PNG genuinely isn't there yet.
 */
export function BrandLogo({ transparent = false, size = 44 }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`flex items-center justify-center rounded-full text-lg font-bold ${
          transparent ? 'bg-white/15 text-white' : 'bg-[var(--ejo-primary)] text-white'
        }`}
        style={{ height: size, width: size }}
      >
        {siteConfig.organisationName.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- needs a plain onError fallback to the monogram
    <img
      src="/images/logo/logo.png"
      alt={siteConfig.organisationName}
      style={{ height: size, width: 'auto' }}
      onError={() => setFailed(true)}
    />
  );
}
