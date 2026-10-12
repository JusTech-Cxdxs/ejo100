'use client';

import { useState } from 'react';
import Image from 'next/image';

interface FooterBadgeProps {
  src: string;
  alt: string;
}

/**
 * One footer badge in a fixed 128 × 56 box (object-contain), so the row
 * never shifts. If the file is missing from public/images/footer-badges/,
 * the badge is not rendered.
 */
export function FooterBadge({ src, alt }: FooterBadgeProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div className="relative h-10 w-32 shrink-0 sm:h-14">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="128px"
        style={{ objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
