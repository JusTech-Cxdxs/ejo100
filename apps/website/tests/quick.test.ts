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
