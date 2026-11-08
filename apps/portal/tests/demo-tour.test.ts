/**
 * D4 — the demo role tour (lib/demo/tour.ts) never promises what the
 * authorization catalogue would not do: every demo sign-in has a tour stop;
 * every "must not" page is refused by its roles; every click on a protected
 * page is granted; the director's order uses real sign-ins; and
 * docs/KEWALRAM_DEMO.md is exactly what `npm run demo:tour-doc` writes.
 * e2e/demo-tour.spec.ts proves the same in the browser for every person.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decide, type Principal } from '../lib/authz/catalogue';
import { AREAS, EVERYONE } from '../lib/authz/page-areas';
import { DEMO_CUSTOMERS, DEMO_STAFF } from '../lib/demo/people';
import { DIRECTOR_TOUR, TOUR, tourFor } from '../lib/demo/tour';
import { renderTourDoc } from '../lib/demo/tour-doc';

const ROOT = join(__dirname, '..', '..', '..', '..');
const principal = (roles: string[]): Principal => ({ userId: 'x', isSuperAdmin: false, roleSlugs: roles, branchId: 'b', departmentId: null });
const opens = (roles: string[], href: string) => {
  // The page's own area, or the nearest one above it (/organisation/people is guarded by /organisation's layout).
  const path = href.split('?')[0]!;
  const area = AREAS.filter((a) => path === a.url || path.startsWith(`${a.url}/`)).sort((x, y) => y.url.length - x.url.length)[0];
  return area ? area.needs.some((k) => decide(principal(roles), k).allowed) : null; // null: not a guarded area (checked in the browser)
};

test('every demo sign-in has a tour stop with a first view, three clicks and at least one proof of what it must not do (the Administrator sees everything: none); no stop for anyone else', () => {
  for (const s of DEMO_STAFF) {
    const t = tourFor(s.email);
    assert.ok(t, `${s.email} has a tour stop`);
    assert.ok(t.firstView.length > 15, `${s.email} first view`);
    assert.equal(t.clicks.length, 3);
    for (const c of t.clicks) assert.match(c.href, /^\/[a-z]/, `${s.email}: ${c.href}`);
    if (s.role !== 'administrator') assert.ok(t.mustNot.length >= 1, `${s.email} has a must-not`);
  }
  assert.equal(Object.keys(TOUR).length, DEMO_STAFF.length, 'one stop per person, no strays');
});

test('the catalogue keeps every promise: a "must not" page is refused by the person’s roles, a click on a protected page is granted', () => {
  const problems: string[] = [];
  for (const s of DEMO_STAFF) {
    const roles = [s.role, ...(s.alsoRoles ?? [])];
    const t = tourFor(s.email)!;
    for (const m of t.mustNot) {
      const o = opens(roles, m.href);
      if (o === null) problems.push(`${s.email}: must-not ${m.href} is not a guarded page (lib/authz/page-areas.ts)`);
      else if (o) problems.push(`${s.email} (${roles.join('+')}): must not "${m.label}", but the catalogue opens ${m.href}`);
      if (EVERYONE.includes(m.href)) problems.push(`${s.email}: ${m.href} is open to everyone`);
    }
    for (const c of t.clicks) if (opens(roles, c.href) === false) problems.push(`${s.email} (${roles.join('+')}): click "${c.label}" ${c.href} is refused by the catalogue`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the 15-minute order: ten steps, minutes in order up to 15, each a real demo sign-in (staff or customer) on a page it opens', () => {
  assert.equal(DIRECTOR_TOUR.length, 10);
  let last = 0;
  for (const step of DIRECTOR_TOUR) {
    const [a, b] = step.minute.split('–').map(Number) as [number, number];
    assert.ok(a === last && b > a, `${step.minute} follows ${last}`);
    last = b;
    const staff = DEMO_STAFF.find((s) => s.email.startsWith(`${step.as}@`));
    const customer = DEMO_CUSTOMERS.find((c) => c.email.startsWith(`${step.as}@`));
    assert.ok(staff || customer, `${step.as} is a demo sign-in`);
    if (staff) assert.notEqual(opens([staff.role, ...(staff.alsoRoles ?? [])], step.href), false, `${step.as} opens ${step.href}`);
  }
  assert.equal(last, 15);
});

test('docs/KEWALRAM_DEMO.md is the generated tour (run npm run demo:tour-doc after changing lib/demo/tour.ts or people.ts)', () => {
  assert.equal(readFileSync(join(ROOT, 'docs/KEWALRAM_DEMO.md'), 'utf8'), renderTourDoc());
});
