'use client';

import { siteConfig } from '@/lib/site-config';
import { useState } from 'react';

interface BrandLogoProps {
  transparent?: boolean;
  size?: number;
}

/** Organisation logo (public/images/logo/logo.png) for the header and footer, or a one-letter monogram if it is missing. */
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
