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

test('support holidays: Nigerian calendar worked out every year, own days added, days opened anyway removed', async () => {
  const { holidayEntries, effectiveHolidays } = await import('../lib/support/holidays');
  const { nigerianHolidays, islamicHolidaysEstimated } = await import('../lib/nigeria-calendar');
  const y2026 = holidayEntries('NG', [], [], [2026]).map((e) => e.date);
  for (const d of ['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-06-12', '2026-10-01', '2026-12-25', '2026-12-26']) assert.ok(y2026.includes(d), d);
  // Christmas 2027 is a Saturday, Boxing Day a Sunday: Monday 27 and Tuesday 28 are given off (provisional).
  const h2027 = nigerianHolidays(2027, { observed: true });
  assert.equal(h2027.get('2027-12-27')?.provisional, true);
  assert.equal(h2027.get('2027-12-28')?.provisional, true);
  // Without "observed" the plain calendar is unchanged.
  assert.equal(nigerianHolidays(2027).has('2027-12-27'), false);
  // Years beyond the table: Islamic holidays are estimated from the Hijri calendar.
  const est = islamicHolidaysEstimated(2030).map(([, n]) => n);
  assert.ok(est.includes('Eid-el-Fitr') && est.includes('Eid-el-Kabir') && est.includes('Eid-el-Maulud'), est.join(','));
  assert.ok(nigerianHolidays(2030).size >= 12);
  // Own closed day added; a holiday the organisation opens on removed; no calendar → own days only.
  const eff = effectiveHolidays('NG', ['2026-11-20'], ['2026-12-26'], new Date('2026-10-16T09:00:00Z'));
  assert.ok(eff.includes('2026-11-20'));
  assert.ok(!eff.includes('2026-12-26'));
  assert.ok(eff.includes('2025-12-25') && eff.includes('2027-01-01'));
  assert.deepEqual(effectiveHolidays(null, ['2026-11-20', 'bad'], [], new Date('2026-10-16T09:00:00Z')), ['2026-11-20']);
});

test('support set-up: separate pages, each form saves only its own part', () => {
  const h = read('lib/actions/support-form-handlers.ts');
  for (const s of ["section === 'hours'", "section === 'holidays'", "section === 'enyo'", "section === 'followups'"]) assert.ok(h.includes(s), s);
  const admin = read('lib/actions/support-admin.ts');
  assert.match(admin, /if \(input\.hours !== undefined\)/);
  for (const page of ['page.tsx', 'teams/page.tsx', 'teams/[id]/page.tsx', 'hours/page.tsx', 'enyo/page.tsx', 'follow-ups/page.tsx']) {
    const src = read(`app/(app)/settings/support/${page}`);
    assert.match(src, /guardPage\('support\.manage'/, page);
  }
  assert.doesNotMatch(read('app/(app)/settings/support/hours/page.tsx'), /YYYY-MM-DD, separated by commas/);
});
