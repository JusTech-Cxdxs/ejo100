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
};

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
    return `Good ${partOfDay(now)}! I'm ${info.assistantName}, ${info.organisation}'s assistant. I can tell you about our vehicles, offers and businesses, help you book a service, or have the right person call you back. What can I do for you?`;
  }
  const name = askedAbout(text);
  if (name) {
    const found = matchPeople(name, info.people);
    if (found.length === 1) return personText(found[0]!);
    if (found.length > 1) return `A few people match "${name}":\n${found.slice(0, 5).map((p) => `- ${personText(p)}`).join('\n')}`;
    return null;
  }
  if (OFFERS.test(text) && info.offers.length && text.length < 140) {
    return `Here is what we are offering now:\n${info.offers.slice(0, 4).map((o) => `- **${o.title}**${o.partner && !o.title.includes(o.partner) ? ` (with ${o.partner})` : ''}${o.until ? ` — until ${o.until}` : ''}. [See more](${o.href})`).join('\n')}\n\nThe sales team confirms the terms; [talk to sales](/contact?topic=sales) or visit the showroom.`;
  }
  if (CONTACT.test(text) && text.length < 120 && !/\d{5,}|\b(my (phone|number|email)|call me|job|estimate|invoice|my car|my vehicle|JC-|SV-)\b/i.test(text)) {
    return `Here is how to reach ${info.organisation}:\n${contactText(info)}`;
  }
  return null;
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
