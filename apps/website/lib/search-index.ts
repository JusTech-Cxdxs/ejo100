/**
 * Static, client-side search index. No backend search service exists yet
 * (out of scope for this frontend-only fix) — this indexes every real
 * page/entity currently in the site so the search modal returns genuine
 * results instead of doing nothing. Add an entry here whenever a new
 * page, business unit, product, news item, or careers listing is added.
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
  { title: 'Product Catalogue', category: 'Product', href: '/products' },

  // News
  { title: 'Kewalram Chanrai Group Expands Operations in West Africa', category: 'News', href: '/news' },
  { title: 'KCG Partners With Global Industry Leaders', category: 'News', href: '/news' },
  { title: 'New Manufacturing Facility Officially Opened', category: 'News', href: '/news' },

  // Careers
  { title: 'Careers at Kewalram Chanrai Group', category: 'Careers', href: '/careers' },
];

export function searchSite(query: string): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SEARCH_INDEX.filter(
    (entry) => entry.title.toLowerCase().includes(q) || entry.category.toLowerCase().includes(q),
  ).slice(0, 8);
}
