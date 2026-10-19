/**
 * The public website, for staff: the store (every vehicle, tyre and part
 * with the price the website shows), the offers running now, refer and earn,
 * and the stories published from News & media — so a salesperson, the front
 * desk or a director answers a customer exactly as the website does. Public
 * content only; news is this organisation's own published stories.
 */
import { prisma } from '@ejo/database';
import { getPrincipal } from '@/lib/authz/server';
import { OFFERS, PRODUCTS, REFERRAL, naira, type Category } from '@ejo/ui';
import { nothing, ok, text } from '../tool-helpers';
import type { StaffTool } from '../types';

const CATS: Category[] = ['suvs', 'pickups', 'trucks', 'buses', 'tyres', 'parts'];
const WEBSITE = (process.env.NEXT_PUBLIC_WEBSITE_URL ?? '').replace(/\/+$/, '');

export const websiteTools: StaffTool[] = [
  {
    name: 'website_content',
    kind: 'read',
    status: 'Reading the website…',
    description:
      'What the public website shows today: the store (every vehicle, tyre and part with its indicative price, list price, saving and offer date), the offers running now (e.g. Keystone Bank financing on SOUEAST), refer and earn (rewards for referring a buyer, and for digital marketers or dealers who sell for us), and the news stories published from News & media. Use it when someone asks about prices, offers, what we sell, the referral programme or the latest news.',
    parameters: {
      type: 'object',
      properties: {
        show: { type: 'string', enum: ['store', 'offers', 'referral', 'news', 'all'], description: 'What to read (default all).' },
        query: { type: 'string', maxLength: 80, description: 'Optional: a model, brand or word to narrow the store ("S07", "Isuzu", "tyre").' },
        category: { type: 'string', enum: ['suvs', 'pickups', 'trucks', 'buses', 'tyres', 'parts'], description: 'Optional: one category of the store.' },
      },
      additionalProperties: false,
    },
    run: async (args, ctx) => {
      // The session is read again: the stories are the signed-in person's own organisation's.
      const org = (await getPrincipal()).organisationId ?? ctx.organisationId;
      const show = text(args.show, 10) || 'all';
      const q = text(args.query, 80).toLowerCase();
      const cat = CATS.includes(args.category as Category) ? (args.category as Category) : null;
      const out: Record<string, unknown> = {};
      if (show === 'store' || show === 'all') {
        const words = q.split(/\s+/).filter((w) => w.length >= 2);
        const items = PRODUCTS.filter((p) => (!cat || p.category === cat) && (!words.length || words.some((w) => `${p.name} ${p.brand} ${p.kind} ${p.id}`.toLowerCase().includes(w))));
        out.store = items.slice(0, 25).map((p) => ({
          name: p.name, kind: p.kind, price: naira(p.price), ...(p.listPrice > p.price ? { listPrice: naira(p.listPrice), saving: naira(p.listPrice - p.price) } : {}),
          ...(p.offerUntil ? { offer: `${p.offerLabel ?? 'Offer'} until ${p.offerUntil}` } : {}), about: p.blurb, link: `${WEBSITE}/store?c=${p.category}`,
        }));
        out.priceNote = 'Indicative prices including VAT, as the website shows them; the sales team confirms the price when the customer reserves. Online checkout is coming soon.';
        if (q && !items.length) out.storeNote = `Nothing in the store matches "${q}".`;
      }
      if (show === 'offers' || show === 'all') out.offers = OFFERS.map((o) => ({ title: o.title, what: o.text, ...(o.partner ? { with: o.partner } : {}), ...(o.until ? { until: o.until } : {}), link: `${WEBSITE}${o.href}` }));
      if (show === 'referral' || show === 'all') out.referAndEarn = { rewards: REFERRAL.rewards.map((r) => `${r.what}: ${r.reward}`), howItWorks: REFERRAL.steps, terms: REFERRAL.terms, link: `${WEBSITE}/store#refer` };
      if (show === 'news' || show === 'all') {
        const stories = await prisma.newsPost.findMany({ where: { organisationId: org, status: 'PUBLISHED', publishedAt: { lte: new Date() } }, orderBy: [{ publishedAt: 'desc' }], take: 6, select: { title: true, summary: true, slug: true, publishedAt: true, category: true } }).catch(() => []);
        out.news = stories.map((s) => ({ title: s.title, summary: s.summary, kind: s.category, published: s.publishedAt?.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' }), link: `${WEBSITE}/news/${s.slug}` }));
        out.newsDesk = '/news';
      }
      if (!Object.keys(out).length) return nothing('Say what to read: store, offers, referral or news.');
      return ok(out, [{ label: 'Website store', href: `${WEBSITE}/store` }, { label: 'News & media', href: '/news' }]);
    },
  },
];
