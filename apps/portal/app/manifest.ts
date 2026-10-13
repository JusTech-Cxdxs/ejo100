import type { MetadataRoute } from 'next';
import { portalConfig } from '@/lib/site-config';

/** A home-screen name has room for about 12 characters; a longer one is cut to its first word. */
function shortName(name: string): string {
  return name.length <= 12 ? name : (name.split(/\s+/)[0] ?? name).slice(0, 12);
}

/**
 * Lets the staff portal be added to a phone's home screen and open full
 * screen like an app. There is no service worker: pages hold personal and
 * business data, so nothing is kept for offline use (docs/PRODUCTION_READINESS.md, "Installable app").
 * Served at /manifest.webmanifest, which the middleware lets through
 * without a session so the browser can read it before sign-in.
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = portalConfig.organisationName;
  return {
    id: '/dashboard',
    name: `${name} Staff Portal`,
    short_name: shortName(name),
    description: portalConfig.poweredBy,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#16a34a',
    background_color: '#ffffff',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
