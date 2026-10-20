import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteDocs, priceList, searchSite, terms } from '../lib/enyo/site-knowledge-core';

const docs = buildSiteDocs({
  products: [
    { id: 'soueast-s07', category: 'suvs', kind: 'Seven-seat SUV', brand: 'SOUEAST', name: 'SOUEAST S07', blurb: 'Seven seats.', about: 'Assembled in Lagos.', highlights: ['Seven seats'], specs: [['Engine', '1.6 T']], price: 45_900_000, listPrice: 48_900_000, offerLabel: 'Launch price', offerUntil: '31 December 2026', priceNote: 'Indicative price.', badge: 'Assembled in Lagos' },
    { id: 'isuzu-npr', category: 'trucks', kind: 'Medium-light truck', brand: 'Isuzu', name: 'Isuzu NPR (N-series)', blurb: 'Favourite.', about: 'Cargo, box, reefer.', highlights: ['4JJ1'], specs: [['GVW', '6–7 t']], price: 54_000_000, listPrice: 57_000_000, priceNote: 'Indicative price.' },
  ],
  offers: [{ kicker: 'Vehicle financing', title: '15% off every SOUEAST with financing from Keystone Bank', text: 'S05, S06, S07, S09.', href: '/store?c=suvs', until: '31 December 2026', partner: 'Keystone Bank', cta: 'See' }],
  businesses: [{ slug: 'agriculture', name: 'Agriculture', short: 'Farming', summary: 'Fifty years in Nigerian farming.', companies: ['Afcott'], offers: ['Cotton ginning'], places: ['Kano'] }],
  companies: [{ name: 'Koncept Autocentre', does: 'Isuzu trucks and pickups', business: 'Automotive' }],
  milestones: [{ year: '1860', title: 'A trading house in Sindh', text: 'Brothers begin trading.' }],
  figures: [{ value: '4,600+', label: 'People' }],
  pillars: [{ title: 'Sustainable growth', text: 'Value that lasts.' }],
  pages: [{ title: 'Careers', href: '/careers', category: 'Page' }, { title: 'Investors', href: '/investors', category: 'Page' }],
  stories: [{ slug: 'soueast-assembly', title: 'SOUEAST passenger-vehicle assembly begins in Lagos', summary: 'The first SUVs leave the line.', body: '## The line\n\nTechnicians trained.', publishedAt: '2026-09-15', category: 'MILESTONE', businessArea: 'Automotive' }],
  referral: { rewards: [{ what: 'A vehicle sold', reward: '₦150,000' }], steps: ['Send the buyer.'], terms: 'Paid on delivery.' },
  places: [{ name: 'Head office', address: '8A Karimu Kotun Street' }],
});

test('the store, offers, news, pages, history and refer-and-earn are all searchable, with links', () => {
  assert.equal(searchSite(docs, 'how much is the S07')[0]!.title, 'SOUEAST S07 — Seven-seat SUV');
  assert.match(searchSite(docs, 'how much is the S07')[0]!.text, /Price ₦45,900,000 \(list ₦48,900,000, save ₦3,000,000; Launch price until 31 December 2026\)/);
  assert.equal(searchSite(docs, 'truck price')[0]!.href, '/store?c=trucks');
  assert.equal(searchSite(docs, 'any discount or financing?')[0]!.kind, 'offer');
  assert.equal(searchSite(docs, 'latest news')[0]!.kind, 'news');
  assert.equal(searchSite(docs, 'latest news')[0]!.href, '/news/soueast-assembly');
  assert.equal(searchSite(docs, 'how can I earn by referring')[0]!.kind, 'referral');
  assert.equal(searchSite(docs, 'job vacancies')[0]!.href, '/careers');
  assert.equal(searchSite(docs, 'when was the company founded history')[0]!.href, '/about');
  assert.equal(searchSite(docs, 'cotton farming')[0]!.href, '/businesses/agriculture');
  assert.equal(searchSite(docs, 'zzzz qqqq').length, 0);
  assert.deepEqual(searchSite(docs, 'S07', { kind: 'news' }).map((d) => d.kind), []);
});

test('the price list reads every product with its price and saving', () => {
  assert.deepEqual(priceList(docs), ['SOUEAST S07 — Seven-seat SUV: ₦45,900,000 (was ₦48,900,000) — /store?c=suvs', 'Isuzu NPR (N-series) — Medium-light truck: ₦54,000,000 (was ₦57,000,000) — /store?c=trucks']);
  assert.equal(priceList(docs, 'trucks').length, 1);
  assert.ok(terms('What vehicle do you sell').includes('price'));
});
