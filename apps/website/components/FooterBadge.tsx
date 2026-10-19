'use client';

import { useState } from 'react';

/**
 * One footer badge: a fixed-height box (36px on a phone, 44px from tablet up)
 * in which the picture keeps its own proportions — so three badges sit on one
 * row, small and never stretched. A missing file renders nothing.
 */
export function FooterBadge({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a plain onError fallback is needed
    <img src={src} alt={alt} loading="lazy" decoding="async" className="h-9 w-auto max-w-[5.5rem] shrink-0 object-contain sm:h-11 sm:max-w-[6.5rem]" onError={() => setFailed(true)} />
  );
}
