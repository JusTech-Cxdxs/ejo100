/**
 * Version-1 polish: employee IDs, the access description used in emails and
 * on the profile page, the welcome email, the version-1 menu, and the live
 * check (cheap, organisation-scoped, never a page render). Pure: no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { organisationCode, branchCode, employeeIdPrefix, formatEmployeeId, sequenceOf, uniqueBranchPrefixes } from '../lib/employee-id';
import { describeAccess } from '../lib/authz/describe-access';
import { PERMISSIONS, type Principal, type PermissionKey } from '../lib/authz/catalogue';
import { renderStaffAccessEmail, STAFF_RULES } from '../lib/email-templates/staff-access';
import { navigationFor } from '../lib/authz/navigation';
import { ROADMAP } from '../lib/roadmap';
import { SYSTEM_DEPARTMENT_SLUGS } from '../lib/structure-rules';
import { parseTheme, THEME_BOOT_SCRIPT } from '../lib/theme';
import { initialsOf, colourOf } from '../lib/avatar';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const who = (roleSlugs: string[], extra: Partial<Principal> = {}): Principal => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'b1', departmentId: null, ...extra });

test('employee IDs: organisation and branch codes', () => {
  assert.equal(organisationCode('Kewalram Nigeria'), 'KN');
  assert.equal(organisationCode('Kewalram Chanrai Group Limited'), 'KCG');
  assert.equal(organisationCode('Acme'), 'ACM');
  assert.equal(organisationCode('   '), 'EJO');
  assert.equal(branchCode('Isolo Branch'), 'ISO');
  assert.equal(branchCode('Victoria Island'), 'VI');
  assert.equal(branchCode('Ikeja Workshop'), 'IKE');
  assert.equal(branchCode('Anything', 'kwl-ws'), 'KWLW', 'the branch\'s own code wins (letters and digits only)');
  assert.equal(branchCode('Abuja', 'x'), 'ABU', 'a one-character own code is ignored');
  assert.equal(branchCode('Lekki <script>'), 'LS', 'only letters and digits survive');
  assert.equal(employeeIdPrefix('Kewalram Nigeria', 'Isolo Branch'), 'KN-ISO');
});

test('employee IDs: format and running number', () => {
  assert.equal(formatEmployeeId('KN-ISO', 7), 'KN-ISO-0007');
  assert.equal(formatEmployeeId('KN-ISO', 12345), 'KN-ISO-12345');
  assert.equal(sequenceOf('KN-ISO', 'KN-ISO-0042'), 42);
  assert.equal(sequenceOf('KN-ISO', 'KN-ISOX-0042'), null);
  assert.equal(sequenceOf('KN-ISO', 'KN-ISO-12a'), null);
  assert.equal(sequenceOf('KN-ISO', 'EMP-001'), null);
});

test('employee IDs: branches whose names give the same code are told apart, and existing ones never change', () => {
  const first = uniqueBranchPrefixes('Kewalram Nigeria', [{ id: 'a', name: 'Isolo' }, { id: 'b', name: 'Isolo Workshop' }, { id: 'c', name: 'Victoria Island' }]);
  assert.deepEqual([...first.values()], ['KN-ISO', 'KN-ISO2', 'KN-VI']);
  const later = uniqueBranchPrefixes('Kewalram Nigeria', [{ id: 'a', name: 'Isolo' }, { id: 'b', name: 'Isolo Workshop' }, { id: 'c', name: 'Victoria Island' }, { id: 'd', name: 'Isolo Branch' }]);
  assert.equal(later.get('a'), 'KN-ISO');
  assert.equal(later.get('b'), 'KN-ISO2');
  assert.equal(later.get('d'), 'KN-ISO3');
});

test('access description: exactly what the catalogue grants, with "added" grants marked', () => {
  const tech = describeAccess(who(['technician']));
  const keys = tech.flatMap((g) => g.lines.map((l) => l.key));
  assert.ok(keys.includes('workshop.job.work'));
  assert.ok(keys.includes('security.exit_pass.request'), 'the everyone baseline is listed');
  assert.ok(!keys.includes('admin.users.manage'));
  const work = tech.flatMap((g) => g.lines).find((l) => l.key === 'workshop.job.work')!;
  assert.equal(work.where, 'on work assigned to you');
  assert.equal(work.added, false);
  const extra = describeAccess(who(['technician'], { extraGrants: { 'warranty.view': 'BRANCH' } }));
  const w = extra.flatMap((g) => g.lines).find((l) => l.key === 'warranty.view')!;
  assert.equal(w.added, true);
  assert.equal(w.where, 'in your branch');
  for (const g of tech) for (const l of g.lines) assert.equal(l.label, PERMISSIONS[l.key as PermissionKey].label);
  assert.deepEqual(describeAccess(who([], { isSuperAdmin: true })), [{ module: 'Platform', lines: [] }]);
});

test('welcome email: employee ID, roles, branch, access, sign-in steps, the rules — and nothing unescaped', () => {
  const { subject, html } = renderStaffAccessEmail({
    kind: 'welcome', fullName: 'Ada <b>Obi</b>', email: 'ada@example.com', employeeId: 'KN-ISO-0007', companyName: 'Kewalram Nigeria',
    branchName: 'Isolo Branch', departmentName: 'Workshop', roles: ['Technician'], isPlatformTeam: false,
    access: describeAccess(who(['technician'])), setPasswordUrl: 'https://portal.example/api/auth/reset-password/tok?callbackURL=%2Freset-password', setPasswordHours: 72,
    signInUrl: 'https://portal.example/login', logoUrl: 'https://portal.example/images/logo/logo.png',
  });
  assert.match(subject, /Welcome/);
  assert.ok(html.includes('KN-ISO-0007'));
  assert.ok(html.includes('Technician'));
  assert.ok(html.includes('Isolo Branch'));
  assert.ok(html.includes('Set my password'));
  assert.ok(html.includes('72 hours'));
  assert.ok(html.includes('https://portal.example/login'));
  assert.ok(html.includes('on work assigned to you'));
  for (const r of STAFF_RULES) assert.ok(html.includes(r.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')), `rule missing: ${r.slice(0, 30)}`);
  assert.ok(!html.includes('<b>Obi</b>'), 'names are escaped');
  const upd = renderStaffAccessEmail({ kind: 'updated', fullName: 'Ada', email: 'ada@example.com', employeeId: null, companyName: 'K', branchName: null, departmentName: null, roles: [], isPlatformTeam: false, access: [], signInUrl: 'https://x/login', logoUrl: 'https://x/l.png', changeNote: 'You were given the role Store Officer.' });
  assert.match(upd.subject, /changed/);
  assert.ok(upd.html.includes('You were given the role Store Officer.'));
  assert.ok(!upd.html.includes('Set my password'), 'an access-changed email carries no password link');
});

test('version 1 menu: only live modules; everything planned is on the Roadmap, with a page each', () => {
  const admin = navigationFor(who(['administrator']));
  const master = navigationFor(who([], { isSuperAdmin: true }));
  for (const items of [admin, master]) for (const i of items) assert.equal(i.status, 'LIVE', `${i.key} is shown but not live`);
  assert.ok(admin.some((i) => i.key === 'structure'), 'the organisation structure is in the menu for administrators');
  assert.ok(!navigationFor(who(['technician'])).some((i) => i.key === 'structure'), 'but not for a technician');
  const keys = ROADMAP.map((m) => m.key);
  for (const k of ['hr', 'payroll', 'finance', 'procurement', 'suppliers', 'warehouse', 'manufacturing', 'documents', 'reports']) assert.ok(keys.includes(k), `${k} is on the roadmap`);
  assert.equal(new Set(keys).size, keys.length, 'roadmap keys are unique');
  for (const m of ROADMAP) {
    assert.ok(m.phases.length > 0 && m.phases.every((p) => p.items.length > 0), `${m.key} says what it will do`);
    for (const c of m.connects) assert.match(c.href, /^\/[a-z]/, `${m.key} links inside the portal`);
  }
  const hr = ROADMAP.find((m) => m.key === 'hr')!.phases.flatMap((p) => p.items).join(' ');
  for (const must of ['clock', 'QR', 'Lateness', 'Overtime', 'vehicle', 'Leave']) assert.match(hr, new RegExp(must, 'i'), `HR plan covers ${must}`);
  // Old addresses of planned modules lead to their roadmap page.
  const cfg = read('next.config.ts');
  for (const k of ['hr', 'payroll', 'finance']) assert.ok(cfg.includes(`'${k}'`), `/${k} redirects`);
  assert.equal(existsSync(join(ROOT, 'components', 'PagePlaceholder.tsx')), false);
});

test('organisation structure: workflow departments are protected', () => {
  for (const slug of ['workshop', 'workshop-passenger', 'workshop-commercial', 'store']) assert.ok(SYSTEM_DEPARTMENT_SLUGS.has(slug), `${slug} is a system department`);
  const src = read('lib/actions/structure.ts');
  assert.match(src, /cannot be switched off/, 'system departments are never switched off');
  assert.match(src, /move them to another department first/, 'a department with people is never switched off');
});

test('live check: a cheap organisation-scoped GET, never a page-posting server action on a 3-second loop', () => {
  const provider = read('components/NotificationProvider.tsx');
  assert.ok(provider.includes("fetch('/api/live/pulse'"), 'the change check is a plain GET');
  assert.ok(!/getNotificationPulse/.test(provider), 'no server action POST to the page every few seconds');
  const ms = (name: string) => Number(new RegExp(`const ${name} = ([0-9_]+)`).exec(provider)?.[1]?.replace(/_/g, ''));
  assert.ok(ms('PULSE_MS') >= 10000, 'checks no more often than every 10 seconds');
  assert.ok(ms('PULSE_WHEN_IDLE_MS') >= 60000);
  assert.ok(ms('PAGE_REFRESH_GAP_MS') >= 30000, 'pages refresh at most every 30 s on organisation changes');
  assert.ok(ms('HEAVY_PAGE_REFRESH_GAP_MS') >= 120000, 'analytics pages recompute at most every 2 minutes');
  assert.ok(ms('MIN_LOAD_GAP_MS') >= 30000, 'the notification summary is fetched at most every 30 s');
  assert.ok(provider.includes("visibilityState === 'hidden'"), 'hidden tabs never check');
  const route = read('app/api/live/pulse/route.ts');
  assert.ok(/isActive/.test(route) && /401/.test(route), 'signed-out or switched-off people get 401');
  const pulse = read('lib/live-pulse.ts');
  assert.ok(/organisationId/.test(pulse), 'scoped to the organisation');
});

test('theme: Light / Dark / System, applied before paint, never trusting the cookie blindly', () => {
  assert.equal(parseTheme('dark'), 'dark');
  assert.equal(parseTheme('light'), 'light');
  assert.equal(parseTheme('"><script>'), 'system');
  assert.equal(parseTheme(undefined), 'system');
  assert.ok(THEME_BOOT_SCRIPT.includes('(light|dark)'), 'the boot script accepts only the two values');
  assert.ok(read('app/layout.tsx').includes('THEME_BOOT_SCRIPT'));
  const css = read('app/globals.css');
  assert.ok(css.includes(":root[data-theme='dark']") && css.includes('prefers-color-scheme: dark'));
  assert.ok(read('components/Topbar.tsx').includes('<ThemeToggle'), 'the toggle is in the header on every page');
});

test('avatars: initials and a stable colour', () => {
  assert.equal(initialsOf('Ada Grace Obi'), 'AO');
  assert.equal(initialsOf('ada'), 'A');
  assert.equal(initialsOf('  '), '?');
  assert.equal(colourOf('ada obi'), colourOf('ada obi'));
});

test('deploys: pre-deploy SQL is additive and re-runnable, and runs before every production push', () => {
  const repo = join(ROOT, '..', '..');
  const dir = join(repo, 'scripts', 'predeploy');
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const files = readdirSync(dir).filter((f: string) => f.endsWith('.sql'));
  assert.ok(files.length > 0);
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE|RENAME)\b|ALTER\s+COLUMN[\s\S]*?\bTYPE\b/i, `${f} must be additive only`);
    for (const m of sql.matchAll(/\b(CREATE(?:\s+UNIQUE)?\s+INDEX|ADD\s+COLUMN|CREATE\s+TABLE)\b(?!\s+IF\s+NOT\s+EXISTS)/gi)) assert.fail(`${f}: "${m[0]}" must use IF NOT EXISTS`);
  }
  for (const f of readdirSync(join(repo, 'scripts', 'postdeploy')).filter((x: string) => x.endsWith('.sql'))) {
    const sql = readFileSync(join(repo, 'scripts', 'postdeploy', f), 'utf8').replace(/--.*$/gm, '');
    assert.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE)\b/i, `${f} must not remove anything`);
  }
  const rls = readFileSync(join(repo, 'scripts', 'postdeploy', '0001-rls-default-deny.sql'), 'utf8');
  assert.match(rls, /ENABLE ROW LEVEL SECURITY/);
  assert.match(rls, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon/);
  for (const s of ['db-push-if-render.js', 'db-push-if-vercel.js']) {
    const src = readFileSync(join(repo, 'scripts', s), 'utf8');
    assert.ok(src.indexOf('applyPostdeploySql();') > src.indexOf('execSync(`npx prisma db push'), `${s} applies row-level security after the push`);
    assert.ok(src.indexOf('applyPredeploySql();') > 0 && src.indexOf('applyPredeploySql();') < src.indexOf('execSync(`npx prisma db push'), `${s} runs the pre-deploy SQL first`);
    assert.doesNotMatch(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /--accept-data-loss/, `${s} never accepts data loss`);
  }
});
