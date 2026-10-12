'use client';
// Copied from apps/portal/components (the apps never import across each other) — keep in step.

import { useState } from 'react';

/**
 * The organisation's wordmark — the same lockup as the printed document
 * header (components/print/DocumentHeader.tsx): the logo, the first word of
 * the name large and heavy, and the rest of the name smaller beneath, set off
 * by a thin rule in the logo's own green that runs flush to the end of the
 * first word. Used in the sidebar and on every sign-in page.
 *
 *  size  "md" (sidebar) · "lg" (sign-in brand panel)
 *  tone  "default" (theme colours) · "onDark" (white text on the dark panel)
 */
export function Wordmark({ name, size = 'md', tone = 'default' }: { name: string; size?: 'md' | 'lg'; tone?: 'default' | 'onDark' }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const words = name.trim().split(/\s+/);
  const top = words[0] ?? name;
  const bottom = words.slice(1).join(' ');
  const logoH = size === 'lg' ? 52 : 40;
  const logoW = Math.round(logoH * (537 / 650));
  const topText = tone === 'onDark' ? 'text-white' : 'text-[var(--ejo-text)]';
  const bottomText = tone === 'onDark' ? 'text-white/75' : 'text-[var(--ejo-text-muted)]';
  return (
    <div className="flex min-w-0 items-center" title={name}>
      {logoFailed ? (
        <span className="mr-1 flex shrink-0 items-center justify-center rounded-md bg-[var(--ejo-brand)] font-bold text-white" style={{ width: logoW, height: logoH }}>{top.charAt(0)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- plain onError fallback to the monogram
        <img src="/images/logo/logo.png" alt="" width={logoW} height={logoH} className="mr-1 block shrink-0 object-contain" style={{ width: logoW, height: logoH }} onError={() => setLogoFailed(true)} />
      )}
      <div className="inline-flex min-w-0 flex-col items-stretch">
        <span className={`truncate font-extrabold leading-none tracking-[0.01em] ${topText} ${size === 'lg' ? 'text-[30px]' : 'text-[22px]'}`}>{top}</span>
        {bottom ? (
          <span className={`flex min-w-0 items-center ${size === 'lg' ? 'mt-1.5' : 'mt-1'}`}>
            {/* A real border (not a background) so it prints, like the document header. */}
            <span className="mr-1.5 min-w-[12px] flex-1" style={{ borderBottom: `${size === 'lg' ? 1.5 : 1.25}px solid var(--ejo-brand)` }} />
            <span className={`truncate font-semibold leading-none ${bottomText} ${size === 'lg' ? 'text-sm' : 'text-[11px]'}`}>{bottom}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
