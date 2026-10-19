import type { ArtKind } from '@/components/store/VehicleArt';

/**
 * The store's catalogue, for demonstration: the models the group sells in
 * Nigeria, with indicative naira prices and a launch discount. Prices are
 * marked as indicative on every card; the sales team confirms each one.
 * (Filled in from the research below; kept here as data, not configuration.)
 */
export type Category = 'suvs' | 'pickups' | 'trucks' | 'buses' | 'tyres' | 'parts';
export type Product = {
  id: string; category: Category; kind: string; brand: string; name: string; blurb: string; about: string;
  highlights: string[]; specs: [string, string][]; price: number; listPrice: number; offerLabel?: string; offerUntil?: string; priceNote: string; badge?: string; art: ArtKind;
};

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'suvs', label: 'SUVs' }, { key: 'pickups', label: 'Pickups' }, { key: 'trucks', label: 'Trucks' }, { key: 'buses', label: 'Buses and vans' }, { key: 'tyres', label: 'Tyres' }, { key: 'parts', label: 'Parts' },
];

export const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
export const discountPct = (p: Product) => (p.listPrice > p.price ? Math.round(((p.listPrice - p.price) / p.listPrice) * 100) : 0);

export const PRODUCTS: Product[] = [];

export const OFFERS: { kicker: string; title: string; text: string; cta: string; href: string; tint: string; mark: string }[] = [];

export const REFERRAL = {
  rewards: [
    { what: 'A vehicle sold', reward: '₦150,000' },
    { what: 'A fleet of five or more', reward: '₦1,000,000' },
    { what: 'Parts and tyres', reward: '5% of the order' },
  ],
  steps: ['Send us the buyer’s name and number (or your own, if you sell for us).', 'The sales team calls within a working day and quotes with your name on the file.', 'When the sale completes and the vehicle is delivered, you are paid within 14 days — by transfer, with a statement.'],
  terms: 'Rewards are paid on completed, delivered sales to buyers not already in our records in the last 90 days. One referrer per buyer, the first to reach us. Referral partners sign a short agreement and receive a code and a rate card.',
};
