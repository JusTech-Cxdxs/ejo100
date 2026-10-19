/**
 * Background on the organisation for Enyo, from the public record, so that
 * "what is the group", "which brands do we sell", "where is the plant" are
 * answered even when the web look-up is refused from the server (free search
 * engines often refuse data-centre addresses). Facts only — no prices, no
 * personal contact details. The organisation's own records (organisation_info)
 * always win over this; it is background, not the source of truth.
 *
 * Keyed by organisation slug, with a general entry for the platform.
 */
export type OrganisationKnowledge = {
  summary: string;
  facts: string[];
  /** Public background on people the group itself names in press releases and on its website: name, public title, one line. */
  people: { name: string; title: string; note: string; source: string }[];
  sources: { label: string; href: string }[];
};

const KEWALRAM: OrganisationKnowledge = {
  summary:
    'Kewalram Chanrai Group is a 160-year-old, family-owned diversified business group founded in 1860, with group management in Singapore and its largest presence in Nigeria, where it has operated for over 70 years. In Nigeria it spans automobiles (vehicle sales, assembly, workshops and parts), agriculture and food (Afcott, Afprint), tyres and batteries distribution (Asahi Brands: Bridgestone, Firestone), logistics and healthcare, with head office at 8A Karimu Kotun Street, Victoria Island, Lagos, and its Automobiles Manufacturing Hub at Afprint Industrial Estate, Isolo, Lagos.',
  facts: [
    'Founded 1860; operates in West Africa, Asia and beyond; group management office in Singapore.',
    'Automobiles in Nigeria: Kewalram Nigeria (Foton trucks, pickups and View minibuses; SOUEAST SUVs since 2026), Koncept Autocentre (Isuzu trucks, D-Max pickups and mu-X), and the group\'s own passenger and commercial vehicle workshops in Lagos.',
    'The Automobiles Manufacturing Hub at Isolo, Lagos was inaugurated in April 2016 with assembly lines for trucks; cars, pickups and minibuses; and two- and three-wheelers. SOUEAST passenger-vehicle (SUV) assembly started there in September 2026.',
    'SOUEAST range in Nigeria: S05, S06, S07 and S09 SUVs, launched April 2026 with a five-year or 100,000 km warranty; the S06 and S07 are assembled in Lagos.',
    'Foton range in Nigeria: Tunland pickups, View C2 Classic and Premium minibuses, View CS2 cargo van; sold and serviced by Kewalram Nigeria.',
    'Isuzu range through Koncept Autocentre: N-series (NPR, NQR) and Q-series light trucks, F-series medium trucks, D-Max pickups and the mu-X SUV.',
    'Tyres and batteries: Asahi Brands distributes Bridgestone and Firestone tyres in Nigeria.',
    'Agriculture and food: Afcott (cotton, grains and agro-processing in northern Nigeria) and Afprint (textiles, Isolo, Lagos).',
    'Vehicle financing promotions are run with partner banks from time to time (for example, SOUEAST financing with Keystone Bank in 2026); the sales team confirms the current offer.',
    'Head office: 8A Karimu Kotun Street, Victoria Island, Lagos. Automobile showroom at the same address; workshops and the assembly plant at Isolo, Lagos.',
  ],
  people: [
    { name: 'Sudeep Mittal', title: 'Head of Automobiles, Kewalram Chanrai Group Nigeria (General Manager, Automobile)', note: 'Leads the automobile business in Nigeria: vehicle sales, assembly, workshops and parts; speaks for the group at vehicle launches (Foton View C2 2022, Fiat Strada 2024, SOUEAST 2026).', source: 'BusinessDay (Jan 2022); ThisDay (Feb 2024)' },
    { name: 'Anil Sahgal', title: 'Managing Director, Auto & Transport Vertical, Kewalram Chanrai Group (Africa)', note: 'Group-level head of the auto and transport businesses across Africa.', source: 'BusinessDay (Jan 2022); ThisDay (Feb 2024)' },
  ],
  sources: [
    { label: 'Kewalram Chanrai Group', href: 'https://www.kewalramchanrai.com' },
    { label: 'BusinessDay: Kewalram excites auto industry with new Foton View C2 (2022)', href: 'https://businessday.ng/companies/article/kewalram-excites-auto-industry-with-new-foton-view-c2-minibus-cargo-van/' },
    { label: 'ThisDay: Kewalram introduces Fiat Strada (2024)', href: 'https://www.thisdaylive.com/2024/02/17/kewalram-introduces-fiat-strada-compact-pickup-into-nigerian-market/' },
  ],
};

const BY_SLUG: Record<string, OrganisationKnowledge> = { 'kewalram-nigeria': KEWALRAM, 'kewalram-chanrai-group': KEWALRAM, kewalram: KEWALRAM };

/** Background for an organisation, by slug or name; null when the platform knows nothing about it. */
export function organisationKnowledge(slugOrName: string | null | undefined): OrganisationKnowledge | null {
  const key = (slugOrName ?? '').toLowerCase().trim();
  if (!key) return null;
  if (BY_SLUG[key]) return BY_SLUG[key]!;
  if (/kewalram/.test(key)) return KEWALRAM;
  return null;
}

/** The people in the background whose name or title matches the words asked (all of them when nothing was asked). */
export function knownPeople(k: OrganisationKnowledge, terms: string[]): OrganisationKnowledge['people'] {
  if (!terms.length) return k.people;
  // Whole words, so "IT" finds Information Technology and not Mittal.
  const words = terms.map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  return k.people.filter((p) => words.some((w) => w.test(p.name) || w.test(p.title)));
}
