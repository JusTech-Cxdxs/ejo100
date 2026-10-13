'use client';

import { useState } from 'react';
import Image from 'next/image';

interface FooterBadgeProps {
  src: string;
  alt: string;
}

/**
 * One footer badge in a fixed box (96 × 40 on a phone, 128 × 56 from tablet up) (object-contain), so the row
 * never shifts. If the file is missing from public/images/footer-badges/,
 * the badge is not rendered.
 */
export function FooterBadge({ src, alt }: FooterBadgeProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div className="relative h-10 w-24 shrink-0 sm:h-14 sm:w-32">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(min-width: 640px) 128px, 96px"
        style={{ objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
