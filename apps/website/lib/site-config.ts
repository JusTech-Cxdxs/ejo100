import { portalBaseUrl } from './site-urls';
import type { TranslationKey } from './languages';
import { appShortName, PLATFORM } from './brand';

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

/**
 * Everything on the public website that identifies the organisation, in one
 * place and set per deployment (Vercel → Settings → Environment Variables).
 * NEXT_PUBLIC_* values are read when the site is built, so redeploy after a
 * change. Defaults are neutral: a fresh install shows the product's own name
 * and hides contact lines and social links that are not set. Longer page
 * copy (the About text, news items) is page content, not configuration;
 * a content-management screen for it is on the roadmap.
 *
 * Each value is written out in full (process.env.NEXT_PUBLIC_…) because
 * Next.js only inlines public variables that appear literally in the code.
 */
const organisationName = process.env.NEXT_PUBLIC_ORGANISATION_NAME?.trim() || PLATFORM.name;

export const siteConfig = {
  /** Display name: header and footer wordmark, page titles, emails. */
  organisationName,
  /** Registered name for legal lines; falls back to the display name. */
  legalName: process.env.NEXT_PUBLIC_ORGANISATION_LEGAL_NAME?.trim() || organisationName,
  /** Kept for existing callers: the same as organisationName. */
  companyShortName: organisationName,
  companyName: process.env.NEXT_PUBLIC_ORGANISATION_LEGAL_NAME?.trim() || organisationName,
  tagline: process.env.NEXT_PUBLIC_SITE_TAGLINE?.trim() || '',
  /** Year the organisation was founded (the "years of excellence" badge); hidden when not set. */
  foundedYear: Number(process.env.NEXT_PUBLIC_ORGANISATION_FOUNDED_YEAR) || null,
  description: process.env.NEXT_PUBLIC_SITE_DESCRIPTION?.trim() || '',
  contact: {
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || '',
    phone: process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || '',
    /** One line, e.g. "12 Example Road, Ikeja, Lagos". */
    address: process.env.NEXT_PUBLIC_CONTACT_ADDRESS?.trim() || '',
  },
  /** Only the ones that are set are shown. */
  social: {
    facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK?.trim() || '',
    linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN?.trim() || '',
    x: process.env.NEXT_PUBLIC_SOCIAL_X?.trim() || '',
    youtube: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE?.trim() || '',
    instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM?.trim() || '',
  },
  poweredBy: PLATFORM.poweredBy,
  /** The installed app's home-screen name: NEXT_PUBLIC_APP_SHORT_NAME, or the organisation's initials (KCG). */
  appShortName: appShortName(organisationName, process.env.NEXT_PUBLIC_APP_SHORT_NAME),
};

/** First word of the name over the rule, the rest beneath (the wordmark lockup). */
export function wordmarkParts(name: string = siteConfig.organisationName): { top: string; bottom: string } {
  const words = name.trim().split(/\s+/);
  return { top: words[0] ?? name, bottom: words.slice(1).join(' ') };
}

/** The staff portal's sign-in page (NEXT_PUBLIC_PORTAL_URL), or null when it is not configured. */
export function getPortalLoginUrl(): string | null {
  const base = portalBaseUrl();
  return base ? `${base}/login` : null;
}
