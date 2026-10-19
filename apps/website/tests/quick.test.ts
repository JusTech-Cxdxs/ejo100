import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askedAbout, busyAnswer, cleanHistory, isGreeting, matchPeople, quickAnswer, type QuickInfo } from '../lib/enyo/quick-core';

const info: QuickInfo = {
  organisation: 'Kewalram Chanrai Group',
  assistantName: 'Enyo',
  people: [
    { name: 'Sudeep Mittal', title: 'Head of Automobiles, Nigeria', area: 'Automobiles', about: 'Leads the automobile business in Nigeria.', profile: null },
    { name: 'Anil Sahgal', title: 'Managing Director, Auto & Transport Vertical', area: 'Automobiles and transport (Africa)', about: null, profile: 'https://example.com/anil' },
  ],
  headOffice: { address: '8A Karimu Kotun Street, Victoria Island, Lagos', phones: ['0701 655 5555'], email: 'info@example.com' },
  offers: [{ title: '15% off every SOUEAST with financing from Keystone Bank', text: '…', href: '/store?c=suvs', until: '31 December 2026', partner: 'Keystone Bank' }],
};
const evening = new Date('2026-10-19T21:00:00Z'); // 10 pm Lagos

test('greetings are answered at once, by Lagos time; questions are not mistaken for greetings', () => {
  for (const g of ['Hi', 'hey Enyo', 'Hello there!', 'Good evening', 'hi again', 'How are you doing?', 'how far']) assert.equal(isGreeting(g), true, g);
  for (const q of ['Hi, who is Sudeep Mittal?', 'hello I want to book a service', 'hey what offers do you have']) assert.equal(isGreeting(q), false, q);
  assert.match(quickAnswer('Hey Enyo', info, evening)!, /^Good evening! I'm Enyo, Kewalram Chanrai Group's assistant/);
});

test('"who is" finds published people by full, first or last name, in every way people ask', () => {
  for (const q of ["Hi who's Sudeep Mittal", 'Ok who’s Sudeep Mittal', 'Who is Mr. Mittal?', 'who is sudeep', 'Tell me about Sudeep Mittal', 'Do you know Mr Sudeep Mittal?']) {
    assert.match(quickAnswer(q, info)!, /^\*\*Sudeep Mittal\*\* — Head of Automobiles, Nigeria/, q);
  }
  assert.match(quickAnswer("Who's Anil", info)!, /\*\*Anil Sahgal\*\* — Managing Director.*\[Public profile\]\(https:\/\/example\.com\/anil\)/);
  assert.equal(quickAnswer('Who is Bhushan Salgar', info), null, 'not published: the model and the web may know');
  assert.equal(askedAbout('who is the head of IT?'), null, 'a role, not a name');
  assert.deepEqual(matchPeople('mittal', info.people).map((p) => p.name), ['Sudeep Mittal']);
});

test('contact and offers come from the records; questions about a job do not', () => {
  assert.match(quickAnswer('What is your phone number?', info)!, /0701 655 5555[\s\S]*\[Contact us\]\(\/contact\)/);
  assert.match(quickAnswer('Where is your showroom?', info)!, /8A Karimu Kotun Street/);
  assert.match(quickAnswer('Any discount or financing offers?', info)!, /\*\*15% off every SOUEAST with financing from Keystone Bank\*\* — until 31 December 2026/);
  assert.equal(quickAnswer('Can you call me about my car JC-2026-000001?', info), null);
  assert.equal(quickAnswer('My phone number is 0803 555 0101, please call me back', info), null, 'a visitor giving theirs is a hand-over');
  assert.equal(quickAnswer('[[tool:request_handover {"name":"Visitor","phone":"08035550102","consent":false}]]', info), null);
  assert.match(quickAnswer('How can I reach you?', info)!, /0701 655 5555/);
  assert.match(quickAnswer('Contact', info)!, /Contact us/);
  assert.equal(quickAnswer('Which SUV is best for a family of six?', info), null);
});

test('when the model is busy, the person still gets an answer: the records, or how to reach the team', () => {
  assert.match(busyAnswer('Who is Sudeep Mittal?', info), /\*\*Sudeep Mittal\*\*/);
  assert.match(busyAnswer('Who is Bhushan Salgar?', info), /I don't have published details about Bhushan Salgar[\s\S]*0701 655 5555/);
  assert.match(busyAnswer('Which SUV is best for a family of six?', info), /team can help straight away[\s\S]*Contact us/);
  assert.doesNotMatch(busyAnswer('anything', info), /try again in a minute|handling a lot/);
});

test('turns the model could not answer are left out of the history, with their question', () => {
  const busy = "I'm handling a lot of questions right now. Please try again in a minute.";
  const turns = [
    { role: 'user', content: 'Who is Sudeep Mittal' }, { role: 'assistant', content: 'Head of Automobiles.' },
    { role: 'user', content: "Who's Anil" }, { role: 'assistant', content: busy },
    { role: 'user', content: 'Who is Bhushan' }, { role: 'assistant', content: busy },
    { role: 'user', content: 'Hi' },
  ];
  assert.deepEqual(cleanHistory(turns, [busy]).map((t) => t.content), ['Who is Sudeep Mittal', 'Head of Automobiles.', 'Hi']);
});

const store: QuickInfo = {
  ...info,
  referral: ['₦150,000 for a vehicle sold', '₦1,000,000 for a fleet of five or more'],
  products: [
    { id: 'soueast-s07', name: 'SOUEAST S07', brand: 'SOUEAST', kind: 'Seven-seat SUV', category: 'suvs', price: 45_900_000, listPrice: 48_900_000, offerLabel: 'Launch price', offerUntil: '31 December 2026', blurb: 'Seven seats, assembled in Lagos.' },
    { id: 'soueast-s05', name: 'SOUEAST S05', brand: 'SOUEAST', kind: 'Compact SUV', category: 'suvs', price: 29_900_000, listPrice: 31_500_000, blurb: 'The way into the range.' },
    { id: 'isuzu-npr', name: 'Isuzu NPR (N-series)', brand: 'Isuzu', kind: 'Medium-light truck', category: 'trucks', price: 54_000_000, listPrice: 57_000_000, blurb: 'Nigeria’s favourite N-series.' },
    { id: 'foton-view-c2-premium', name: 'Foton View C2 Premium', brand: 'Foton', kind: '15-seat minibus', category: 'buses', price: 59_900_000, listPrice: 63_000_000, blurb: 'The executive View.' },
    { id: 'tyre-bs-265-65-17', name: 'Bridgestone Dueler H/T 265/65 R17', brand: 'Bridgestone', kind: 'SUV tyre', category: 'tyres', price: 85_000, listPrice: 92_000, blurb: 'Fitted and balanced.' },
  ],
};

test('"what vehicles do you sell and the prices": the price list from the store, the offer and refer and earn', () => {
  const a = quickAnswer('What vehicle do you have for sell and price', store)!;
  assert.match(a, /\*\*SUVs\*\*[\s\S]*\*\*SOUEAST S07\*\* — Seven-seat SUV: \*\*₦45,900,000\*\* ~~₦48,900,000~~ \(launch price until 31 December 2026\)/);
  assert.match(a, /\*\*Trucks\*\*[\s\S]*Isuzu NPR/);
  assert.match(a, /\*\*Buses and vans\*\*/);
  assert.doesNotMatch(a, /Dueler/, 'tyres only when asked');
  assert.match(a, /15% off every SOUEAST with financing from Keystone Bank/);
  assert.match(a, /Online checkout is coming soon/);
  assert.match(a, /Refer and earn:\*\* know someone who needs a vehicle\? ₦150,000 for a vehicle sold/);
  assert.match(quickAnswer('tyre prices', store)!, /Dueler H\/T 265\/65 R17\*\* — SUV tyre: \*\*₦85,000\*\*/);
});

test('"how much is the S07": that product, its price, the matching offer, how to reserve', () => {
  for (const q of ['How much is the S07?', 'price of soueast s07', 'Tell me about the NPR']) {
    const a = quickAnswer(q, store)!;
    assert.ok(a, q);
    assert.match(a, /indicative/);
  }
  const s07 = quickAnswer('How much is the S07?', store)!;
  assert.match(s07, /^\*\*SOUEAST S07\*\* — Seven-seat SUV: \*\*₦45,900,000\*\*/);
  assert.doesNotMatch(s07, /S05/);
  assert.match(s07, /Keystone Bank/);
  assert.match(s07, /\[reserve with the sales team\]\(\/contact\?topic=sales\)/);
  assert.match(quickAnswer('Tell me about the NPR', store)!, /Isuzu NPR \(N-series\)\*\* — Medium-light truck: \*\*₦54,000,000\*\*/);
  // Not about the store: left to the model.
  assert.equal(quickAnswer('Which SUV is best for a family of six?', store), null);
  assert.equal(quickAnswer('Do you service Toyota cars?', store), null);
});

test('the greeting carries this season\'s lead offer; the offers answer ends with refer and earn', () => {
  assert.match(quickAnswer('Hi', store)!, /This season: \*\*15% off every SOUEAST with financing from Keystone Bank\*\*/);
  assert.match(quickAnswer('Any offers !?', store)!, /Refer and earn/);
});
