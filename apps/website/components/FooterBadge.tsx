'use client';

import { useState } from 'react';
import Image from 'next/image';

interface FooterBadgeProps {
  src: string;
  alt: string;
}

/**
 * One badge in the footer's badge row. Fixed-size container (56px tall,
 * 128px wide) so the row never shifts layout whether the image is present
 * or not — object-contain keeps each badge's own aspect ratio inside that
 * box without stretching. Until the real file is uploaded to
 * public/images/footer-badges/, the badge simply doesn't render (no
 * broken-image icon) rather than reserving visible empty space.
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
