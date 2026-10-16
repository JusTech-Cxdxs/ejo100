import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';

/**
 * The customer portal as an installable app: it opens on the customer's
 * dashboard (the sign-in page when signed out) and stays inside
 * /customer-portal; links to the public site open in the browser. No
 * service worker, so nothing personal is kept on the phone for offline use.
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = siteConfig.organisationName;
  return {
    id: '/customer-portal/dashboard',
    name: `${name} Customer Portal`,
    short_name: siteConfig.appShortName,
    description: siteConfig.description || `Your vehicles, jobs and payments with ${name}.`,
    start_url: '/customer-portal/dashboard',
    scope: '/customer-portal',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#16a34a',
    background_color: '#ffffff',
    categories: ['business', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
