import { siteConfig } from './site-config';
import { FIRST_STORIES } from './news/stories';
/**
 * Static, client-side search index for the site search. Add an entry when a
 * page, business unit, product, news item or careers listing is added.
 */
export interface SearchEntry {
  title: string;
  category: 'Page' | 'Business' | 'Product' | 'News' | 'Careers';
  href: string;
}

export const SEARCH_INDEX: SearchEntry[] = [
  // Pages
  { title: 'Home', category: 'Page', href: '/' },
  { title: 'About', category: 'Page', href: '/about' },
  { title: 'Our Businesses', category: 'Page', href: '/businesses' },
  { title: 'Products', category: 'Page', href: '/products' },
  { title: 'Investors', category: 'Page', href: '/investors' },
  { title: 'Sustainability', category: 'Page', href: '/sustainability' },
  { title: 'Careers', category: 'Page', href: '/careers' },
  { title: 'News & Media', category: 'Page', href: '/news' },
  { title: 'Contact', category: 'Page', href: '/contact' },
  { title: 'Privacy Policy', category: 'Page', href: '/privacy' },
  { title: 'Terms of Use', category: 'Page', href: '/terms' },
  { title: 'Support', category: 'Page', href: '/support' },

  // Businesses
  { title: 'Automotive Division', category: 'Business', href: '/businesses/automotive' },
  { title: 'Workshop Services', category: 'Business', href: '/businesses/automotive/workshop' },
  { title: 'Vehicle Sales', category: 'Business', href: '/businesses/automotive/vehicle-sales' },
  { title: 'Spare Parts', category: 'Business', href: '/businesses/automotive/spare-parts' },
  { title: 'Manufacturing', category: 'Business', href: '/businesses/manufacturing' },
  { title: 'Food, Agriculture & FMCG', category: 'Business', href: '/businesses/food' },
  { title: 'Agriculture', category: 'Business', href: '/businesses/agriculture' },
  { title: 'Healthcare', category: 'Business', href: '/businesses/healthcare' },
  { title: 'Logistics', category: 'Business', href: '/businesses/logistics' },

  // Products
  { title: 'Products', category: 'Product', href: '/products' },
  { title: 'Services', category: 'Page', href: '/services' },
  { title: 'Vehicle sales', category: 'Business', href: '/businesses/automotive/vehicle-sales' },
  { title: 'Spare parts and tyres', category: 'Business', href: '/businesses/automotive/spare-parts' },

  // News: the first stories (the live list comes from News & media in the staff portal).
  ...FIRST_STORIES.map((st) => ({ title: st.title, category: 'News' as const, href: `/news/${st.slug}` })),

  // Careers
  { title: `Careers at ${siteConfig.organisationName}`, category: 'Careers', href: '/careers' },
];

export function searchSite(query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SEARCH_INDEX.filter(
    (entry) => entry.title.toLowerCase().includes(q) || entry.category.toLowerCase().includes(q),
  ).slice(0, 8);
}
