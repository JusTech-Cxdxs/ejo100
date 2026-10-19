/**
 * The offers the group is running, in one place: the bar under the header,
 * the store's advert strip and the home page's offers section all read it.
 * Every offer names where it comes from and when it ends; the sales team
 * confirms the terms (the bar and the cards say so).
 */
export type Offer = {
  id: string;
  kicker: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  /** Who the offer is with, when it is a partner's (shown as "with …"). */
  partner?: string;
  until?: string;
  tint: string;
  mark: string;
};

export const OFFERS: Offer[] = [
  {
    id: 'keystone-financing',
    kicker: 'Vehicle financing',
    title: '15% off every SOUEAST with financing from Keystone Bank',
    text: 'Drive the car of your dreams with more flexibility: S05, S06, S06DM, S07 and S09, financed through Keystone Bank, with 15% off the price. Visit the SOUEAST showroom at 8A Karimu Kotun Street, Victoria Island, to get started.',
    cta: 'See the SUVs',
    href: '/store?c=suvs',
    partner: 'Keystone Bank',
    until: '31 December 2026',
    tint: 'linear-gradient(135deg, #0b2416 0%, #22983f 100%)',
    mark: '15%',
  },
  {
    id: 'soueast-services',
    kicker: 'Launch offer',
    title: 'SOUEAST: first two services free',
    text: 'On every S05, S06, S07 and S09 ordered before 31 December 2026 — plus the five-year, 100,000 km warranty and servicing at the group’s own workshops.',
    cta: 'Reserve one',
    href: '/store?c=suvs',
    until: '31 December 2026',
    tint: 'linear-gradient(135deg, #103a22 0%, #2fae56 100%)',
    mark: 'S',
  },
  {
    id: 'fleet',
    kicker: 'Fleet programme',
    title: 'Five trucks or more: one account manager',
    text: 'Isuzu N- and Q-series and Foton pickups and buses, with scheduled servicing, parts stocked for your models and fleet finance from 30% deposit.',
    cta: 'See the trucks',
    href: '/store?c=trucks',
    tint: 'linear-gradient(135deg, #1a1f2b 0%, #c0392b 100%)',
    mark: 'N',
  },
  {
    id: 'tyres',
    kicker: 'Tyres and parts',
    title: 'Buy four tyres, alignment free',
    text: 'Bridgestone and Firestone fitted and balanced in our workshop; genuine parts matched by chassis number.',
    cta: 'See tyres',
    href: '/store?c=tyres',
    until: '30 November 2026',
    tint: 'linear-gradient(135deg, #1a1a1a 0%, #555 100%)',
    mark: '4',
  },
];

/** The one-line version for the bar under the header. */
export function offerLine(o: Offer): string {
  return `${o.title}${o.partner && !o.title.includes(o.partner) ? ` — with ${o.partner}` : ''}${o.until ? ` · until ${o.until}` : ''}`;
}
