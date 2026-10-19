import 'server-only';
import { OFFERS, PRODUCTS, REFERRAL } from '@ejo/ui';
import { BUSINESSES, COMPANIES, FIGURES, GROUP_OFFICE, HEAD_OFFICE, MILESTONES, PILLARS, PLANT } from '@/lib/content/group';
import { SEARCH_INDEX } from '@/lib/search-index';
import { listStories } from '@/lib/news/data';
import { buildSiteDocs, priceList, searchSite, type SiteDoc } from './site-knowledge-core';
import type { WebTool } from './types';

/**
 * The website's own content for Enyo (site-knowledge-core.ts), rebuilt at
 * most every five minutes so a story published in the portal or a price
 * changed in the catalogue reaches the answers quickly.
 */
let cache: { at: number; docs: SiteDoc[] } | null = null;

export async function siteDocs(): Promise<SiteDoc[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.docs;
  const stories = await listStories().catch(() => []);
  const docs = buildSiteDocs({
    products: PRODUCTS, offers: OFFERS, businesses: BUSINESSES, companies: COMPANIES, milestones: MILESTONES, figures: FIGURES, pillars: PILLARS,
    pages: SEARCH_INDEX.map((e) => ({ title: e.title, href: e.href, category: e.category })),
    stories: stories.slice(0, 30).map((s) => ({ slug: s.slug, title: s.title, summary: s.summary, body: s.body, publishedAt: s.publishedAt, category: s.category, businessArea: s.businessArea })),
    referral: REFERRAL,
    places: [HEAD_OFFICE, PLANT, GROUP_OFFICE],
  });
  cache = { at: Date.now(), docs };
  return docs;
}

const AREAS = ['any', 'store', 'offer', 'news', 'page', 'business', 'company', 'story', 'referral'] as const;
const CATS = ['suvs', 'pickups', 'trucks', 'buses', 'tyres', 'parts'] as const;

/** One tool for everything on the website: products and prices, offers, news, pages, businesses, history, refer and earn. */
export const searchWebsiteTool: WebTool = {
  name: 'search_website',
  description:
    'Search everything on this website: the store (every vehicle, tyre and part with its price, list price, discount and offer date), the offers running now (financing, launch offers, fleet, tyres), refer and earn (rewards for referring a buyer or selling for us), news stories, the businesses and companies, the group\'s history and figures, and every page (careers, investors, sustainability, contact). Use it for ANY question about what we sell, prices, offers, news or the group. For "what do you sell / your prices", set list_prices true (optionally with a category).',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The visitor\'s question in a few words, e.g. "SOUEAST S07 price", "truck financing", "latest news", "careers".', maxLength: 160 },
      area: { type: 'string', enum: [...AREAS], description: 'Optional: only one kind of content (default any).' },
      list_prices: { type: 'boolean', description: 'True for the whole price list (or one category of it).' },
      category: { type: 'string', enum: [...CATS], description: 'With list_prices: one category of the store.' },
    },
    additionalProperties: false,
  },
  kind: 'read',
  status: 'Reading the website…',
  async run(args) {
    const docs = await siteDocs();
    const query = typeof args.query === 'string' ? args.query.slice(0, 160) : '';
    const category = typeof args.category === 'string' && (CATS as readonly string[]).includes(args.category) ? args.category : undefined;
    if (args.list_prices === true) {
      const offers = docs.filter((d) => d.kind === 'offer').slice(0, 4).map((d) => `${d.title} — ${d.href}`);
      return {
        ok: true,
        data: { priceList: priceList(docs, category), offersNow: offers, note: 'Indicative prices including VAT; the sales team confirms each one when the visitor reserves. Online checkout is coming soon: reserving is through the sales team (contact form, phone or the showroom).' },
        sources: [{ label: 'Store', href: category ? `/store?c=${category}` : '/store' }],
      };
    }
    const area = typeof args.area === 'string' && (AREAS as readonly string[]).includes(args.area) ? (args.area as SiteDoc['kind'] | 'any') : 'any';
    const found = searchSite(docs, query, { kind: area, limit: 6 });
    if (!found.length) return { ok: false, message: `Nothing on the website matches "${query}". Say so, and offer the contact form (/contact) or a call back.` };
    return {
      ok: true,
      data: { results: found.map((d) => ({ kind: d.kind, title: d.title, link: d.href, says: d.text.length > 700 ? `${d.text.slice(0, 697)}…` : d.text })), note: 'Quote only what "says" contains; link each item with its link.' },
      sources: found.slice(0, 3).map((d) => ({ label: d.title.slice(0, 80), href: d.href })),
    };
  },
};
