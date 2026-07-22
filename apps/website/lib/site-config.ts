export const siteNav = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  {
    label: 'Our Businesses',
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
  { label: 'Products', href: '/products' },
  { label: 'Investors', href: '/investors' },
  { label: 'Sustainability', href: '/sustainability' },
  { label: 'Careers', href: '/careers' },
  { label: 'News & Media', href: '/news' },
  { label: 'Contact', href: '/contact' },
] as const;

export const siteConfig = {
  companyName: 'Kewalram Nigeria',
  companyShortName: 'Kewalram Chanrai Group',
  tagline: 'A Spirit of Entrepreneurship for Over 150 Years',
  poweredBy: 'Powered by EJO 100 Enterprise Platform',
};

/**
 * Phase 2: Employee Login now points at the real portal (a separate
 * deployed app), not the website's own /employee-portal placeholder.
 * Reads NEXT_PUBLIC_PORTAL_URL so this resolves correctly in every
 * environment (local dev, preview, production) without a code change.
 */
export function getPortalLoginUrl(): string {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3001';
  return `${portalUrl}/login`;
}
