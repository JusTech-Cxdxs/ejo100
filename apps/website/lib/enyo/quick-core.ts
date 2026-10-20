/**
 * Answers the website assistant gives straight from the organisation's own
 * records, with no model call: a greeting, "who is <one of our people>",
 * how to reach us, and the offers running now. They cost nothing from the
 * model's per-minute budget, arrive at once, and are what a busy model
 * falls back on — so a visitor never meets "try again in a minute" for a
 * question the records can answer. Pure (no database), tested.
 */

export type QuickPerson = { name: string; title: string; area: string | null; about: string | null; profile: string | null };
export type QuickInfo = {
  organisation: string;
  assistantName: string;
  people: QuickPerson[];
  headOffice: { address: string | null; phones: string[]; email: string | null };
  offers: { title: string; text: string; href: string; until?: string; partner?: string }[];
  /** The store (indicative prices), for "what do you sell", "how much is …". */
  products?: QuickProduct[];
  /** The refer-and-earn rewards, one line each. */
  referral?: string[];
};
export type QuickProduct = { id: string; name: string; brand: string; kind: string; category: string; price: number; listPrice: number; offerLabel?: string; offerUntil?: string; blurb: string };

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
const CATEGORY_OF: [RegExp, string, string][] = [
  [/\b(suvs?|jeeps?|family cars?|cars?)\b/i, 'suvs', 'SUVs'],
  [/\b(pick-?ups?|double cabs?)\b/i, 'pickups', 'Pickups'],
  [/\b(trucks?|lorr(y|ies)|haulage)\b/i, 'trucks', 'Trucks'],
  [/\b(bus|buses|minibus(es)?|vans?|shuttles?)\b/i, 'buses', 'Buses and vans'],
  [/\b(tyres?|tires?)\b/i, 'tyres', 'Tyres'],
  [/\b(parts?|spares?|batter(y|ies)|oil|filters?|brake)\b/i, 'parts', 'Parts'],
];
const GENERIC = new Set(['soueast', 'isuzu', 'foton', 'bridgestone', 'firestone', 'genuine', 'the', 'cab', 'double', 'series', 'set', 'front', 'and', 'for', 'with', 'of', 'free', 'fully', 'synthetic', 'litres', 'maintenance', 'q', 'n']);
/** Words that name one product ("s07", "npr", "tunland", "d-max", "view c2"). */
function productWords(p: QuickProduct): string[] {
  return [...new Set([...p.id.split('-'), ...p.name.toLowerCase().replace(/[()]/g, ' ').split(/[\s/]+/)].map((w) => w.trim()).filter((w) => w.length >= 2 && !GENERIC.has(w) && !/^\d+$/.test(w)))];
}
function productLine(p: QuickProduct): string {
  const was = p.listPrice > p.price ? ` ~~${naira(p.listPrice)}~~` : '';
  const until = p.offerUntil ? ` (${(p.offerLabel ?? 'offer').toLowerCase()} until ${p.offerUntil})` : '';
  return `**${p.name}** — ${p.kind}: **${naira(p.price)}**${was}${until}`;
}
const PRICE_Q = /\b(price|prices|pricing|cost|costs|how much|sell|selling|sale|for sale|buy|available|in stock|do you have|what (vehicles?|cars?|trucks?|suvs?|tyres?|parts?|buses?|pick-?ups?)|catalogue|catalog|range|models?)\b/i;

const GREETING = /^\s*(hi+|hello+|hey+|hiya|howdy|good\s+(morning|afternoon|evening|day)|greetings|yo|sup|what'?s up|how are you( doing)?|how far)([\s,!.]+(there|enyo|everyone|all|again))*[\s,!.?]*(?:\p{Extended_Pictographic}[\s,!.?]*)*$/iu;

/** "Good evening" by Lagos time. */
export function partOfDay(d: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', hour12: false }).format(d));
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

export function isGreeting(message: string): boolean {
  return GREETING.test(message);
}

/** The name in "who is …", "who's …", "tell me about …" (lower-case, titles and punctuation removed), or null. */
export function askedAbout(message: string): string | null {
  const m = /^\s*(?:(?:hi|hello|hey|ok(?:ay)?|so|and|please|enyo)[\s,!.]+)*(?:who(?:'s|’s| is| was)|tell me (?:about|who)|do you know|what does)\s+(?:mr\.?|mrs\.?|ms\.?|miss|dr\.?|engr\.?|chief|sir)?\s*([a-z][a-z .’'-]{1,60}?)(?:\s+(?:is|do|does))?\s*[?!.]*\s*$/i.exec(message);
  if (!m) return null;
  const name = m[1]!.replace(/[’']s$/i, '').replace(/[.]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  // "who is the …", "who is your …" are questions about roles, not names: the model answers those.
  if (!name || /^(the|your|our|a|an|in|on|at|this|that|it|he|she|they|you|there|here|calling|available|responsible)\b/.test(name)) return null;
  return name;
}

/** The published people the name matches: the whole name, or a first or last name. */
export function matchPeople(name: string, people: QuickPerson[]): QuickPerson[] {
  const want = name.split(' ').filter((w) => w.length >= 2);
  if (!want.length) return [];
  const full = people.filter((p) => p.name.toLowerCase() === name);
  if (full.length) return full;
  return people.filter((p) => {
    const parts = p.name.toLowerCase().split(/\s+/);
    return want.every((w) => parts.includes(w));
  });
}

function personText(p: QuickPerson): string {
  const role = [p.title, p.area && !p.title.toLowerCase().includes(p.area.toLowerCase()) ? p.area : null].filter(Boolean).join(', ');
  return `**${p.name}** — ${role}.${p.about ? ` ${p.about}` : ''}${p.profile ? ` [Public profile](${p.profile})` : ''}`;
}

// Asking for OUR details — never a visitor giving theirs ("my phone number is …, call me back" is a hand-over).
const CONTACT = /\b(your|ur|the (company|office|showroom|head office))\s+(phone|telephone|number|contact|address|location|email|e-mail|office|showroom|hotline)\b|\bwhere (are|is) (you|your|the (showroom|office|head office))\b|\bhow (can|do) i (reach|contact|call|find|visit) (you|your)\b|^\s*(contact|contacts|address|phone|phone number|hotline|location)\s*[?!.]*\s*$/i;
const OFFERS = /\b(offer|offers|promo|promotion|discount|deal|deals|financing|finance|loan|keystone|sale)\b/i;

function contactText(info: QuickInfo): string {
  const h = info.headOffice;
  const lines = [
    h.address ? `- **Head office and showroom:** ${h.address}` : null,
    h.phones.length ? `- **Phone:** ${h.phones.slice(0, 3).join(', ')}` : null,
    h.email ? `- **Email:** ${h.email}` : null,
    '- **Write to us:** [Contact us](/contact) — the right team replies within a working day.',
  ].filter(Boolean);
  return lines.join('\n');
}

/** A complete answer from the records, or null when the question needs the model. */
export function quickAnswer(message: string, info: QuickInfo, now: Date = new Date()): string | null {
  const text = message.trim();
  if (isGreeting(text)) {
    const lead = info.offers[0];
    return `Good ${partOfDay(now)}! I'm ${info.assistantName}, ${info.organisation}'s assistant. I can show you our vehicles, tyres and parts with prices, tell you about our businesses, help you book a service, or have the right person call you back.${lead ? `\n\nThis season: **${lead.title}**${lead.until ? ` (until ${lead.until})` : ''} — [see the offer](${lead.href}).` : ''}\n\nWhat can I do for you?`;
  }
  const name = askedAbout(text);
  if (name) {
    const found = matchPeople(name, info.people);
    if (found.length === 1) return personText(found[0]!);
    if (found.length > 1) return `A few people match "${name}":\n${found.slice(0, 5).map((p) => `- ${personText(p)}`).join('\n')}`;
    return null;
  }
  const store = storeAnswer(text, info);
  if (store) return store;
  if (OFFERS.test(text) && info.offers.length && text.length < 140) {
    return `Here is what we are offering now:\n${info.offers.slice(0, 4).map((o) => `- **${o.title}**${o.partner && !o.title.includes(o.partner) ? ` (with ${o.partner})` : ''}${o.until ? ` — until ${o.until}` : ''}. [See more](${o.href})`).join('\n')}\n\nThe sales team confirms the terms; [talk to sales](/contact?topic=sales) or visit the showroom.${referLine(info)}`;
  }
  if (CONTACT.test(text) && text.length < 120 && !/\d{5,}|\b(my (phone|number|email)|call me|job|estimate|invoice|my car|my vehicle|JC-|SV-)\b/i.test(text)) {
    return `Here is how to reach ${info.organisation}:\n${contactText(info)}`;
  }
  return null;
}

function referLine(info: QuickInfo): string {
  return info.referral?.length ? `\n\n**Refer and earn:** know someone who needs a vehicle? ${info.referral.slice(0, 2).join('; ')} — and digital marketers, dealers and fleet consultants can sell for us. [How it works](/store#refer)` : '';
}

/** "What do you sell and the prices", "how much is the S07", "truck prices": straight from the store. */
export function storeAnswer(message: string, info: QuickInfo): string | null {
  const products = info.products ?? [];
  if (!products.length || message.length > 200) return null;
  const lower = message.toLowerCase();
  const words = new Set(lower.replace(/[^a-z0-9-\s]/g, ' ').split(/\s+/).filter(Boolean));
  const named = products.filter((p) => productWords(p).some((w) => words.has(w) || (w.includes('-') && lower.includes(w)) || (w.length >= 4 && lower.includes(w))));
  const asksPrice = PRICE_Q.test(message);
  // One or a few products named ("how much is the S07", "tell me about the NPR"): their prices and a line each.
  if (named.length && named.length <= 4 && (asksPrice || /\b(about|tell me|details?|specs?|what is|what's)\b/i.test(message))) {
    const offer = info.offers.find((o) => named.some((p) => o.title.toLowerCase().includes(p.brand.toLowerCase())));
    return `${named.map((p) => `${productLine(p)}\n  ${p.blurb} [See it in the store](/store?c=${p.category})`).join('\n')}\n\nPrices are indicative and include VAT; the sales team confirms when you reserve.${offer ? ` Also: **${offer.title}**${offer.until ? ` until ${offer.until}` : ''}.` : ''} Online checkout is coming soon — [reserve with the sales team](/contact?topic=sales) and they will call you within a working day.${referLine(info)}`;
  }
  if (!asksPrice) return null;
  const cats = CATEGORY_OF.filter(([re]) => re.test(message));
  const mentionsStore = cats.length || /\b(vehicles?|cars?|products?|store|shop|everything)\b/i.test(message);
  if (!mentionsStore) return null;
  const chosen = cats.length ? cats : CATEGORY_OF.filter(([, key]) => ['suvs', 'pickups', 'trucks', 'buses'].includes(key));
  const sections = chosen.map(([, key, label]) => {
    const items = products.filter((p) => p.category === key);
    return items.length ? `**${label}**\n${items.map((p) => `- ${productLine(p)}`).join('\n')}` : null;
  }).filter(Boolean);
  if (!sections.length) return null;
  const lead = info.offers[0];
  const more = cats.length ? '' : '\n\nWe also sell Bridgestone and Firestone tyres and genuine parts — ask me for those prices.';
  return `Here is what we have, with this season's prices:\n\n${sections.join('\n\n')}${more}\n\nPrices are indicative and include VAT; the sales team confirms when you reserve.${lead ? ` **${lead.title}**${lead.until ? ` until ${lead.until}` : ''}.` : ''} Online checkout is coming soon — [browse the store](/store) or [reserve with the sales team](/contact?topic=sales).${referLine(info)}`;
}

/** What to say when the model cannot answer at all just now: the records if they help, else how to reach a person. */
export function busyAnswer(message: string, info: QuickInfo, now: Date = new Date()): string {
  const quick = quickAnswer(message, info, now);
  if (quick) return quick;
  const name = askedAbout(message);
  if (name) return `I don't have published details about ${name.replace(/\b\w/g, (c) => c.toUpperCase())} here. For anyone at ${info.organisation}, our team can help:\n${contactText(info)}`;
  return `I couldn't look that up just now, but the team can help straight away:\n${contactText(info)}\n\nOr ask me again in a moment.`;
}

/**
 * The conversation for the model, without the turns where the model could
 * not answer: an error text in the history, with the question before it,
 * only confuses the next answer (it answers the old question instead).
 * `errorTexts` are the messages shown for a failed answer (llmErrorMessage).
 */
export function cleanHistory<T extends { role: string; content: string }>(turns: T[], errorTexts: string[]): T[] {
  const errors = new Set(errorTexts.map((e) => e.trim()));
  const out: T[] = [];
  for (const t of turns) {
    if (t.role === 'assistant' && errors.has(t.content.trim())) {
      if (out.length && out[out.length - 1]!.role === 'user') out.pop();
      continue;
    }
    out.push(t);
  }
  return out;
}
