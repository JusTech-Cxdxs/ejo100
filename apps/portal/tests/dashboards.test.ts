import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

test('leadership and IT overviews: permission-checked, inside the viewer\'s own organisation, counts only', () => {
  const src = read('lib/actions/leadership.ts');
  assert.match(src, /authorize\('analytics\.business\.view'/);
  assert.match(src, /authorize\('audit\.view'/);
  // Branches: always the viewer's own organisation (also for the platform team), narrowed to their reach.
  assert.match(src, /businessUnit: \{ organisationId: org \}/);
  assert.match(src, /all\.includes\(b\)/);
  // No customer names or message text leave these functions.
  assert.doesNotMatch(src, /fullName: true|contactName|body: true/);
  const dash = read('app/(app)/dashboard/page.tsx');
  assert.match(dash, /overviews\.leadership \? <Suspense/);
  assert.match(dash, /overviews\.it \? <Suspense/);
  assert.match(read('components/dashboard/LeadershipOverview.tsx'), /figures as of/);
  assert.match(read('components/dashboard/ItOverview.tsx'), /As of/);
});
