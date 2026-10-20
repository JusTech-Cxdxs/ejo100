/**
 * Everything the public website says, as documents Enyo can search: every
 * page, each business and company, the group's story and figures, every
 * product in the store with its price and offer, the offers running now,
 * the refer-and-earn programme and the published news. Pure: the caller
 * passes the data in (so this is tested without a database), and the
 * search is a small keyword scorer — the website is a few hundred
 * documents, and an answer must quote what the page says, nothing else.
 */

export type SiteDoc = { kind: 'store' | 'offer' | 'news' | 'page' | 'business' | 'company' | 'story' | 'referral'; title: string; href: string; text: string; keywords?: string };

type ProductIn = { id: string; category: string; kind: string; brand: string; name: string; blurb: string; about: string; highlights: string[]; specs: [string, string][]; price: number; listPrice: number; offerLabel?: string; offerUntil?: string; priceNote: string; badge?: string };
type OfferIn = { title: string; text: string; href: string; until?: string; partner?: string; kicker: string; cta: string };
type BusinessIn = { slug: string; name: string; short: string; summary: string; companies: string[]; offers: string[]; places: string[]; brands?: string[] };
type CompanyIn = { name: string; does: string; where?: string; business: string; phone?: string; email?: string };
type StoryIn = { slug: string; title: string; summary: string; body: string; publishedAt: string; category: string; businessArea?: string | null };
type PageIn = { title: string; href: string; category: string };
type ReferralIn = { rewards: { what: string; reward: string }[]; steps: string[]; terms: string };

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const CATEGORY_WORDS: Record<string, string> = {
  suvs: 'suv suvs car cars jeep family vehicle vehicles passenger',
  pickups: 'pickup pickups pick-up van double cab vehicle vehicles',
  trucks: 'truck trucks lorry lorries haulage cargo commercial vehicle vehicles',
  buses: 'bus buses minibus van vans staff shuttle passenger vehicle vehicles transport',
  tyres: 'tyre tyres tire tires wheel wheels',
  parts: 'part parts spare spares battery oil filter brake pads service consumables',
};

/** The documents, in a fixed order (store first: it is what most visitors ask about). */
export function buildSiteDocs(o: { products: ProductIn[]; offers: OfferIn[]; businesses: BusinessIn[]; companies: CompanyIn[]; milestones: { year: string; title: string; text: string }[]; figures: { value: string; label: string; note?: string }[]; pillars: { title: string; text: string }[]; pages: PageIn[]; stories: StoryIn[]; referral: ReferralIn; places: { name: string; address: string }[] }): SiteDoc[] {
  const docs: SiteDoc[] = [];
  for (const p of o.products) {
    const off = p.listPrice > p.price ? ` (list ${naira(p.listPrice)}, save ${naira(p.listPrice - p.price)}${p.offerUntil ? `; ${p.offerLabel ?? 'offer'} until ${p.offerUntil}` : ''})` : '';
    docs.push({
      kind: 'store', title: `${p.name} — ${p.kind}`, href: `/store?c=${p.category}`,
      text: `${p.brand} ${p.name}, ${p.kind}${p.badge ? ` (${p.badge})` : ''}. Price ${naira(p.price)}${off}. ${p.priceNote} ${p.blurb} ${p.about} Highlights: ${p.highlights.join('; ')}. Specifications: ${p.specs.map(([k, v]) => `${k} ${v}`).join('; ')}.`,
      keywords: `${CATEGORY_WORDS[p.category] ?? ''} price cost how much buy sale sell ${p.brand} ${p.id.replace(/-/g, ' ')}`,
    });
  }
  for (const f of o.offers) docs.push({ kind: 'offer', title: f.title, href: f.href, text: `${f.kicker}: ${f.title}. ${f.text}${f.partner ? ` With ${f.partner}.` : ''}${f.until ? ` Until ${f.until}.` : ''} The sales team confirms the terms.`, keywords: 'offer offers promo promotion discount deal deals financing finance loan bank' });
  docs.push({ kind: 'referral', title: 'Refer and earn — sell for us', href: '/store#refer', text: `Refer a buyer, or sell for us as a referral partner (digital marketers, fleet consultants, dealers, influencers). Rewards: ${o.referral.rewards.map((r) => `${r.what}: ${r.reward}`).join('; ')}. How it works: ${o.referral.steps.join(' ')} ${o.referral.terms}`, keywords: 'refer referral earn commission reward partner affiliate marketer marketers influencer sell for us agent' });
  for (const s of o.stories) docs.push({ kind: 'news', title: s.title, href: `/news/${s.slug}`, text: `${s.publishedAt} — ${s.summary} ${s.body.replace(/[#>*_`[\]()!-]/g, ' ').replace(/\s+/g, ' ').slice(0, 900)}`, keywords: `news story stories press media latest milestone ${s.category} ${s.businessArea ?? ''}` });
  for (const b of o.businesses) docs.push({ kind: 'business', title: `${b.name} — ${b.short}`, href: `/businesses/${b.slug}`, text: `${b.summary} Companies: ${b.companies.join(', ')}. What it offers: ${b.offers.join('; ')}. Where: ${b.places.join('; ')}.${b.brands?.length ? ` Brands: ${b.brands.join(', ')}.` : ''}`, keywords: 'business businesses division divisions what do you do' });
  for (const c of o.companies) docs.push({ kind: 'company', title: c.name, href: '/contact', text: `${c.name} (${c.business}): ${c.does}.${c.where ? ` Where: ${c.where}.` : ''}${c.phone ? ` Phone: ${c.phone}.` : ''}${c.email ? ` Email: ${c.email}.` : ''}`, keywords: 'company companies subsidiary contact phone email' });
  docs.push({ kind: 'story', title: 'Our history — milestones since 1860', href: '/about', text: o.milestones.map((m) => `${m.year}: ${m.title} — ${m.text}`).join(' '), keywords: 'history story founded milestones about heritage years old since' });
  docs.push({ kind: 'story', title: 'The group in figures, and what guides it', href: '/about', text: `${o.figures.map((f) => `${f.label}: ${f.value}${f.note ? ` (${f.note})` : ''}`).join('; ')}. ${o.pillars.map((p) => `${p.title} — ${p.text}`).join(' ')}`, keywords: 'about figures employees people staff countries values strategy pillars' });
  docs.push({ kind: 'page', title: 'Where we are', href: '/contact', text: o.places.map((p) => `${p.name}: ${p.address}`).join('. '), keywords: 'address location where office plant factory showroom visit directions' });
  for (const p of o.pages) docs.push({ kind: 'page', title: p.title, href: p.href, text: `${p.category}: ${p.title}.`, keywords: p.title.toLowerCase() });
  return docs;
}

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'do', 'does', 'you', 'your', 'we', 'our', 'i', 'me', 'my', 'it', 'what', 'which', 'how', 'any', 'have', 'has', 'with', 'about', 'can', 'please', 'tell', 'show', 'there', 'this', 'that', 'be', 'at', 'by', 'from', 'all', 'some', 'get', 'want', 'need', 'enyo']);
const SYNONYMS: Record<string, string[]> = { sell: ['sale', 'price', 'buy'], selling: ['sale', 'price'], sale: ['price', 'buy'], prices: ['price'], cost: ['price'], costs: ['price'], cars: ['suv', 'car'], car: ['suv'], jeep: ['suv'], vehicle: ['vehicles'], tires: ['tyres'], tire: ['tyre'], spare: ['parts'], spares: ['parts'], discount: ['offer'], discounts: ['offer'], promo: ['offer'], loan: ['financing'], finance: ['financing'], refer: ['referral'], earn: ['referral'], jobs: ['careers'], job: ['careers'], vacancy: ['careers'], vacancies: ['careers'], invest: ['investors'], investor: ['investors'], csr: ['sustainability'], news: ['news'], latest: ['news'] };

export function terms(query: string): string[] {
  const words = query.toLowerCase().replace(/[^a-z0-9₦\s-]/g, ' ').split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w));
  const out = new Set<string>();
  for (const w of words) { out.add(w); for (const s of SYNONYMS[w] ?? []) out.add(s); if (w.endsWith('s') && w.length > 3) out.add(w.slice(0, -1)); }
  return [...out].slice(0, 16);
}

/** The best documents for a question: words in the title count most, then the keywords, then the text. */
export function searchSite(docs: SiteDoc[], query: string, opts: { kind?: SiteDoc['kind'] | 'any'; limit?: number } = {}): SiteDoc[] {
  const want = terms(query);
  const pool = opts.kind && opts.kind !== 'any' ? docs.filter((d) => d.kind === opts.kind) : docs;
  if (!want.length) return pool.slice(0, opts.limit ?? 6);
  const scored = pool.map((d, i) => {
    const title = d.title.toLowerCase(); const keys = (d.keywords ?? '').toLowerCase(); const text = d.text.toLowerCase();
    let score = 0;
    for (const w of want) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (re.test(title)) score += 4;
      if (re.test(keys)) score += 2;
      if (re.test(text)) score += 1;
    }
    return { d, score, i };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, opts.limit ?? 6).map((x) => x.d);
}

/** The whole store as a short price list (for "what do you sell and at what price"). */
export function priceList(docs: SiteDoc[], category?: string): string[] {
  return docs.filter((d) => d.kind === 'store' && (!category || d.href.endsWith(`c=${category}`))).map((d) => {
    const price = /Price (₦\d[\d,]*\d)( \(list (₦\d[\d,]*\d))?/.exec(d.text);
    return `${d.title}: ${price?.[1] ?? 'price on request'}${price?.[3] ? ` (was ${price[3]})` : ''} — ${d.href}`;
  });
}
