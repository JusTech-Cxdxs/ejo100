import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkProfile } from '../lib/organisation/people-core';
import { stripCitationMarks } from '../lib/enyo/citations';
import { parseMarkdown } from '../lib/enyo/markdown';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

test('people the organisation publishes: name and title required, https profile, no contact details', () => {
  const good = checkProfile({ name: '  Ada   Obi ', title: 'Director, Automobile Division', area: 'Automobile Division', bio: 'Leads the auto business.', profileUrl: 'https://www.linkedin.com/in/ada', isPublic: 'on' });
  assert.ok(good.ok);
  assert.deepEqual(good.ok && good.value, { name: 'Ada Obi', title: 'Director, Automobile Division', area: 'Automobile Division', bio: 'Leads the auto business.', profileUrl: 'https://www.linkedin.com/in/ada', isPublic: true });
  assert.equal(checkProfile({ name: 'A', title: 'Director' }).ok, false);
  assert.equal(checkProfile({ name: 'Ada Obi', title: '' }).ok, false);
  assert.equal(checkProfile({ name: 'Ada Obi', title: 'Director', profileUrl: 'http://x.com' }).ok, false);
  assert.equal(checkProfile({ name: 'Ada Obi', title: 'Director', profileUrl: 'javascript:alert(1)' }).ok, false);
  assert.equal(checkProfile({ name: 'Ada Obi', title: 'Director', bio: 'Call 0803 123 4567' }).ok, false);
  assert.equal(checkProfile({ name: 'Ada Obi', title: 'Director', bio: 'ada@example.com' }).ok, false);
  const staffOnly = checkProfile({ name: 'Ada Obi', title: 'Director' });
  assert.ok(staffOnly.ok && staffOnly.value.isPublic === false && staffOnly.value.profileUrl === null);
});

test('people: fenced to the administrator\'s organisation; only public ones reach the website', () => {
  const actions = read('lib/actions/public-profiles.ts');
  assert.match(actions, /authorize\(PERM/);
  for (const fn of ['savePublicProfile', 'removePublicProfile', 'movePublicProfile']) {
    const body = actions.split(`export async function ${fn}`)[1]!.split('\nexport ')[0]!;
    assert.match(body, /profileOrg\(/, fn);
    assert.match(body, /refuseDuringAssist\(/, fn);
    assert.doesNotMatch(body, /where: \{ id \}/, fn);
  }
  const website = read('../website/lib/enyo/company.ts');
  assert.match(website, /publicProfile\.findMany\(\{ where: \{ organisationId, isPublic: true \}/);
  const staff = read('lib/enyo/tools/organisation.ts');
  assert.match(staff, /organisationId: org/);
  assert.match(staff, /getPrincipal\(\)/);
  assert.match(read('lib/enyo/tools/index.ts'), /organisationTools/);
});

test('citation marks never reach the reader', () => {
  assert.equal(stripCitationMarks('Ada Obi leads the auto business【web_lookup†source】.'), 'Ada Obi leads the auto business.');
  const blocks = parseMarkdown('Hello 【1†source】 world');
  assert.doesNotMatch(JSON.stringify(blocks), /【/);
  assert.equal(stripCitationMarks(read('../website/lib/enyo/citations.ts').includes('【') ? 'x【y】' : ''), 'x');
});
