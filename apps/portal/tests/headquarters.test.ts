import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { branchHealth, csvCell, hqPeriod, median, toCsv, type HqBranch } from '../lib/hq-core';
import { navigationFor } from '../lib/authz/navigation';
import { decide, type Principal } from '../lib/authz/catalogue';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'a', departmentId: null, ...extra });

test('periods are Lagos calendar ranges; anything unknown is this month', () => {
  const now = new Date('2026-10-17T10:00:00+01:00');
  const m = hqPeriod('this_month', now);
  assert.equal(m.from.toISOString(), new Date('2026-10-01T00:00:00+01:00').toISOString());
  assert.equal(m.to.toISOString(), new Date('2026-10-18T00:00:00+01:00').toISOString());
  const l = hqPeriod('last_month', now);
  assert.equal(l.from.toISOString(), new Date('2026-09-01T00:00:00+01:00').toISOString());
  assert.equal(l.to.toISOString(), new Date('2026-10-01T00:00:00+01:00').toISOString());
  assert.equal(hqPeriod('this_quarter', now).from.toISOString(), new Date('2026-10-01T00:00:00+01:00').toISOString());
  assert.equal(hqPeriod('this_year', now).from.toISOString(), new Date('2026-01-01T00:00:00+01:00').toISOString());
  assert.equal(hqPeriod('drop table', now).key, 'this_month');
  assert.equal(hqPeriod('last_month', new Date('2026-01-10T10:00:00+01:00')).from.toISOString(), new Date('2025-12-01T00:00:00+01:00').toISOString());
});

test('branch health: action for old decisions or late customers; watch for queues and slow jobs', () => {
  const base: HqBranch = { id: 'b', name: 'B', staff: 3, opened: 1, finished: 1, collected: 0, inWorkshop: 2, ready: 0, waiting: 0, oldestWaitingHours: null, supportOpen: 0, supportLate: 0, turnaroundHours: 20 };
  assert.equal(branchHealth(base).tone, 'good');
  assert.equal(branchHealth({ ...base, waiting: 1, oldestWaitingHours: 50 }).tone, 'act');
  assert.equal(branchHealth({ ...base, supportLate: 1 }).tone, 'act');
  assert.equal(branchHealth({ ...base, ready: 5 }).tone, 'watch');
  assert.equal(branchHealth({ ...base, turnaroundHours: 100 }).tone, 'watch');
  assert.match(branchHealth({ ...base, supportLate: 2, ready: 6 }).reasons.join(' '), /2 customer requests past target.*6 vehicles/);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('the CSV export neutralises spreadsheet formulas and quotes every cell', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('+234 803'), `"'+234 803"`);
  assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
  assert.equal(csvCell(-1200), '"-1200"');
  assert.equal(csvCell('Ikeja, Lagos'), '"Ikeja, Lagos"');
  const csv = toCsv(['A', 'B'], [[1, null]]);
  assert.ok(csv.startsWith('\uFEFF"A","B"\r\n"1",""'));
});

test('Headquarters: leadership with the whole organisation in view; a branch manager is kept to the branch', () => {
  assert.ok(navigationFor(who(['executive'])).some((i) => i.key === 'headquarters'));
  assert.ok(navigationFor(who(['administrator'])).some((i) => i.key === 'headquarters'));
  assert.ok(!navigationFor(who(['workshop-manager'])).some((i) => i.key === 'headquarters'), 'branch scope: not in the menu');
  assert.ok(!navigationFor(who(['technician'])).some((i) => i.key === 'headquarters'));
  assert.equal(decide(who(['technician']), 'analytics.business.view').allowed, false);
  const page = read('app/(app)/headquarters/page.tsx');
  assert.match(page, /guardPage\('analytics\.business\.view'/);
  const action = read('lib/actions/headquarters.ts');
  assert.match(action, /await authorize\('analytics\.business\.view'/);
  assert.match(action, /businessUnit: \{ organisationId: org \}/, 'branches from the viewer\'s own organisation only');
  const route = read('app/(app)/headquarters/export/route.ts');
  assert.match(route, /getHeadquarters\(period\)/, 'the export runs the same checks as the page');
  assert.match(route, /'Cache-Control': 'no-store'/);
  assert.match(route, /headquarters\.exported/, 'every export is in the audit trail');
});

test('executives and IT administrators send notices; Users and Roles are read first, changed on purpose', () => {
  assert.equal(decide(who(['executive']), 'notifications.broadcast.send').allowed, true);
  assert.equal(decide(who(['it-administrator']), 'notifications.broadcast.send').allowed, true);
  assert.equal(decide(who(['technician']), 'notifications.broadcast.send').allowed, false);
  const users = read('app/(app)/users/page.tsx');
  assert.match(users, /redirect\('\/users\/new'\)/);
  assert.doesNotMatch(users, /<AddStaffForm/);
  assert.match(read('app/(app)/users/new/page.tsx'), /<AddStaffForm/);
  assert.match(read('app/(app)/roles/[id]/page.tsx'), /<EditableSection/);
  assert.match(read('lib/actions/roles-form-handlers.ts'), /\/roles\/\$\{id\}/);
});

test('dropdown lists float above the page (never clipped, never behind the next card)', () => {
  for (const f of ['components/FilterSelect.tsx', 'components/SearchableSelect.tsx', 'components/mail/RecipientField.tsx']) {
    const src = read(f);
    assert.match(src, /<Floating /, f);
    assert.doesNotMatch(src, /absolute[^"]*top-full[^"]*z-|absolute z-30 mt-1/, `${f}: no in-page absolute list`);
  }
  const fl = read('components/ui/Floating.tsx');
  assert.match(fl, /createPortal/);
  assert.match(fl, /position: 'fixed'/);
  assert.match(fl, /closest\('dialog\[open\]'\)/, 'inside a modal, drawn in the modal');
  // Clicks inside the floating list count as inside the field.
  assert.match(read('components/FilterSelect.tsx'), /!panel\.current\?\.contains\(t\)/);
  assert.match(read('components/SearchableSelect.tsx'), /!panelRef\.current\?\.contains/);
});
