'use client';

import { wordmarkParts } from '@/lib/site-config';
import { BrandLogo } from './BrandLogo';

/**
 * The website wordmark: logo, the first word of the organisation name large
 * and heavy, and the rest smaller beneath it after a thin rule in the logo
 * green, as on printed documents and in the customer and staff portals.
 * The first word is set much larger than the second line so the rule always
 * has room to show, at every width.
 *
 *  tone  "default" (theme colours) · "light" (white text over the hero image or the dark footer)
 *  size  "header" · "footer"
 */
export function SiteWordmark({ tone = 'default', size = 'header' }: { tone?: 'default' | 'light'; size?: 'header' | 'footer' }) {
  const mark = wordmarkParts();
  const top = tone === 'light' ? 'text-white' : 'text-[var(--ejo-text)]';
  const bottom = tone === 'light' ? 'text-white/75' : 'text-[var(--ejo-text-muted)]';
  const footer = size === 'footer';
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <BrandLogo transparent={tone === 'light'} size={footer ? 40 : 34} />
      <span className="inline-flex min-w-0 flex-col items-stretch">
        <span className={`block font-extrabold leading-none tracking-[0.01em] ${top} ${footer ? 'text-[22px]' : 'text-[19px] sm:text-[21px]'}`}>{mark.top}</span>
        {mark.bottom ? (
          <span className="mt-1 flex items-center">
            <span className="mr-1.5 min-w-[12px] flex-1" style={{ borderBottom: '1.25px solid var(--ejo-brand)' }} aria-hidden="true" />
            <span className={`block font-semibold leading-none ${bottom} ${footer ? 'text-[11px]' : 'text-[10px] sm:text-[11px]'}`}>{mark.bottom}</span>
          </span>
        ) : null}
      </span>
    </span>
  );
}
