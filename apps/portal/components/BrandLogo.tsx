'use client';

import { useState } from 'react';

interface BrandLogoProps {
  size?: number;
}

/**
 * Portal's own copy of the company logo component (mirrors
 * apps/website/components/BrandLogo.tsx). Looks for a real logo at
 * public/images/logo/logo.png; falls back to the "K" monogram if it
 * hasn't been uploaded yet.
 *
 * Important: apps/portal and apps/website are separate Next.js
 * deployments with separate `public/` folders — uploading logo.png to
 * the website does NOT make it available here. Upload the same file to
 * apps/portal/public/images/logo/logo.png as well (see
 * README_CHANGES.md). Once shared object storage (Cloudflare R2, per the
 * project roadmap) is wired up, both apps can point at one shared URL
 * instead of needing the file uploaded twice.
 */
export function BrandLogo({ size = 40 }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className="flex items-center justify-center rounded-full bg-[var(--ejo-primary)] text-lg font-bold text-white"
        style={{ height: size, width: size }}
      >
        K
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- needs a plain onError fallback to the monogram
    <img
      src="/images/logo/logo.png"
      alt="Kewalram Chanrai Group"
      style={{ height: size, width: 'auto' }}
      onError={() => setFailed(true)}
    />
  );
}
