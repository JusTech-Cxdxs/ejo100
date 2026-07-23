import type { TranslationKey } from './languages';

export const siteNav: {
  key: TranslationKey;
  href: string;
  children?: { label: string; href: string }[];
}[] = [
  { key: 'nav.home', href: '/' },
  { key: 'nav.about', href: '/about' },
  {
    key: 'nav.businesses',
    href: '/businesses',
    children: [
      { label: 'Automotive', href: '/businesses/automotive' },
      { label: 'Manufacturing', href: '/businesses/manufacturing' },
      { label: 'Food', href: '/businesses/food' },
      { label: 'Agriculture', href: '/businesses/agriculture' },
      { label: 'Healthcare', href: '/businesses/healthcare' },
      { label: 'Logistics', href: '/businesses/logistics' },
    ],
  },
  { key: 'nav.products', href: '/products' },
  { key: 'nav.investors', href: '/investors' },
  { key: 'nav.sustainability', href: '/sustainability' },
  { key: 'nav.careers', href: '/careers' },
  { key: 'nav.news', href: '/news' },
  { key: 'nav.contact', href: '/contact' },
] as const;

export const siteConfig = {
  companyName: 'Kewalram Nigeria',
  companyShortName: 'Kewalram Chanrai Group',
  tagline: 'A Spirit of Entrepreneurship for Over 150 Years',
  poweredBy: 'Powered by EJO 100 Enterprise Platform',
};

/**
 * Employee Login now points at the real production portal by default.
 * NEXT_PUBLIC_PORTAL_URL still overrides this (e.g. for local dev against
 * a portal running on localhost), but production deployments that forget
 * to set the env var no longer silently fall back to localhost.
 */
export function getPortalLoginUrl(): string {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ejo100-portal.vercel.app';
  return `${portalUrl}/login`;
}
