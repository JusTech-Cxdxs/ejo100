import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knownPeople, organisationKnowledge } from '../lib/enyo/knowledge';

test('the group background is found by slug or name, and nothing is claimed for an unknown organisation', () => {
  assert.ok(organisationKnowledge('kewalram-nigeria'));
  assert.ok(organisationKnowledge('Kewalram Chanrai Group'));
  assert.equal(organisationKnowledge('other-motors'), null);
  assert.equal(organisationKnowledge(null), null);
});

test('people in the background match by a name or a title word, and carry a public source and no contact details', () => {
  const k = organisationKnowledge('kewalram-nigeria')!;
  assert.deepEqual(knownPeople(k, ['mittal']).map((p) => p.name), ['Sudeep Mittal']);
  assert.deepEqual(knownPeople(k, ['IT', 'information']).map((p) => p.name), ['Bhushan Salgar']);
  assert.equal(knownPeople(k, []).length, k.people.length);
  for (const p of k.people) { assert.ok(p.source); assert.doesNotMatch(`${p.title} ${p.note}`, /@|\+234|\b0[789]\d{9}\b/); }
  for (const f of k.facts) assert.doesNotMatch(f, /₦\s?\d/);
});
