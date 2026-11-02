/**
 * D1 — the demo people (lib/demo/people.ts) and how they are made
 * (lib/demo/people-load.ts): every role on every branch, one account each,
 * on a reserved domain, with no password anywhere in the code; the plant
 * demo's people are the same accounts; the deploy makes them only when the
 * environment asks. The database behaviour (idempotent, never a password
 * changed, a demo person in a real organisation switched off) is proved in
 * e2e/demo-people.spec.ts against a real database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_CUSTOMERS, DEMO_DOMAIN, DEMO_PASSWORD_MIN, DEMO_STAFF, PLANT_DEMO_STAFF, demoPerson, isDemoEmail } from '../lib/demo/people';
import { demoPasswords } from '../lib/demo/people-load';
import { DEMO_PEOPLE } from '../lib/plant/demo/plan';
import { ROLE_GRANTS, ROLE_LABELS } from '../lib/authz/catalogue';
import { PLANT_DEPARTMENTS } from '../lib/branch-types';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** The roles the brief asks for, per place. */
const WANTED: Record<'HQ' | 'ISOLO' | 'AFPRINT', string[]> = {
  HQ: ['administrator', 'executive', 'it-administrator', 'finance-officer', 'customer-care-lead', 'broadcaster', 'scheduling-admin', 'calendar-user'],
  ISOLO: ['branch-administrator', 'workshop-manager', 'workshop-supervisor', 'technician', 'receptionist', 'branch-assistant', 'store-manager', 'store-officer', 'finance-officer', 'warranty-hod', 'warranty-officer', 'chief-security-officer', 'security-officer', 'customer-care', 'department-head'],
  AFPRINT: ['branch-administrator', 'plant-manager', 'production-supervisor', 'line-operator', 'kit-inspector', 'qc-inspector', 'qa-auditor', 'quality-supervisor', 'pdi-supervisor', 'pdi-inspector', 'store-officer', 'security-officer'],
};
const WORKSHOP_DEPARTMENTS = ['workshop', 'store', 'workshop-passenger', 'workshop-commercial'];

test('every role the brief names has a sign-in on its branch; two supervisors and two technicians at Isolo (passenger and commercial), two line operators or more', () => {
  for (const [branch, roles] of Object.entries(WANTED) as ['HQ' | 'ISOLO' | 'AFPRINT', string[]][]) {
    for (const role of roles) assert.ok(DEMO_STAFF.some((s) => s.branch === branch && s.role === role), `${role} on ${branch}`);
  }
  const isolo = (role: string) => DEMO_STAFF.filter((s) => s.branch === 'ISOLO' && s.role === role);
  assert.deepEqual(isolo('workshop-supervisor').map((s) => s.dept).sort(), ['workshop-commercial', 'workshop-passenger']);
  assert.deepEqual(isolo('technician').map((s) => s.dept).sort(), ['workshop-commercial', 'workshop-passenger']);
  assert.ok(DEMO_STAFF.filter((s) => s.branch === 'AFPRINT' && s.role === 'line-operator').length >= 2);
  assert.equal(demoPerson('workshop-manager').branch, 'ISOLO');
  assert.equal(demoPerson('finance-officer', 'HQ').email, `finance.hq@${DEMO_DOMAIN}`);
  assert.throws(() => demoPerson('master-administrator'), /No demo person/);
});

test('one account each: addresses on the reserved domain, unique; names and employee numbers unique and obviously demo; every role known to the catalogue; departments that exist on that branch; reporting lines resolve', () => {
  const emails = new Set<string>();
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const s of DEMO_STAFF) {
    assert.match(s.email, new RegExp(`^[a-z0-9.]+@${DEMO_DOMAIN.replace(/\./g, '\\.')}$`), s.email);
    assert.ok(!emails.has(s.email), `${s.email} twice`); emails.add(s.email);
    assert.ok(!ids.has(s.employeeId), `${s.employeeId} twice`); ids.add(s.employeeId);
    assert.ok(!names.has(s.name), `${s.name} twice`); names.add(s.name);
    assert.match(s.employeeId, /^DEMO-(HQ|WS|AP)-\d{3}$/);
    assert.equal(s.employeeId.slice(5, 7), s.branch === 'HQ' ? 'HQ' : s.branch === 'ISOLO' ? 'WS' : 'AP');
    for (const role of [s.role, ...(s.alsoRoles ?? [])]) { assert.ok(role in ROLE_LABELS, `${role} has a label`); assert.ok(role in ROLE_GRANTS, `${role} has grants`); }
    if (s.branch === 'HQ') assert.equal(s.dept, null, `${s.email}: headquarters has no department`);
    if (s.dept) assert.ok((s.branch === 'ISOLO' ? WORKSHOP_DEPARTMENTS : PLANT_DEPARTMENTS.map((d) => d.slug)).includes(s.dept), `${s.email}: ${s.dept} exists on ${s.branch}`);
    if (s.reportsTo) assert.ok(emails.has(s.reportsTo) || DEMO_STAFF.some((o) => o.email === s.reportsTo), `${s.email} reports to ${s.reportsTo}`);
    assert.ok(s.jobTitle.length > 3 && s.show.length > 20, `${s.email} has a title and a tour line`);
    if (s.previousEmail) assert.match(s.previousEmail, /@afprint-demo\.example$/);
  }
  assert.ok(isDemoEmail(`x@${DEMO_DOMAIN}`) && !isDemoEmail('x@kewalram.com') && !isDemoEmail(null));
  // Nobody at headquarters is tied to a branch: that is what makes them organisation-wide.
  assert.ok(DEMO_STAFF.filter((s) => s.branch === 'HQ').length >= 8);
});

test('the plant demo’s people ARE the demo organisation’s plant people: same keys, emails, numbers and departments; the first release’s addresses are remembered for the rename', () => {
  assert.equal(PLANT_DEMO_STAFF.length, DEMO_PEOPLE.length);
  for (const person of DEMO_PEOPLE) {
    const s = PLANT_DEMO_STAFF.find((x) => x.plantKey === person.key)!;
    assert.ok(s, person.key);
    assert.equal(s.email, person.email); assert.equal(s.employeeId, person.employeeId); assert.equal(s.name, person.fullName); assert.equal(s.role, person.role); assert.equal(s.dept, person.department);
    assert.equal(s.previousEmail, `${person.fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@afprint-demo.example`);
  }
  assert.deepEqual(DEMO_PEOPLE.map((p) => p.key), ['pm', 'prod', 'op1', 'op2', 'op3', 'op4', 'qc', 'qs', 'qa', 'kit1', 'kit2', 'pdi1', 'pdi2']);
});

test('four customer-portal sign-ins: an individual, a fleet company, a warranty customer and an Afprint-built vehicle’s owner — reserved addresses, no real numbers', () => {
  assert.deepEqual(DEMO_CUSTOMERS.map((c) => c.kind), ['INDIVIDUAL', 'FLEET', 'WARRANTY', 'PLANT']);
  for (const c of DEMO_CUSTOMERS) { assert.ok(isDemoEmail(c.email)); assert.match(c.phone, /^0800 000 \d{4}$/); assert.ok(c.address.includes('Lagos')); }
  assert.ok(DEMO_CUSTOMERS.find((c) => c.kind === 'FLEET')!.company);
  assert.equal(new Set(DEMO_CUSTOMERS.map((c) => c.email)).size, 4);
});

test('passwords come only from the environment: none → skipped; shorter than 8 → skipped with the reason; the customers fall back to the staff password; never printed', () => {
  assert.equal(DEMO_PASSWORD_MIN, 8);
  assert.deepEqual(demoPasswords({}), { staff: null, customer: null, problems: ['DEMO_STAFF_PASSWORD is not set: no staff sign-ins.', 'No customer password (DEMO_CUSTOMER_PASSWORD or DEMO_STAFF_PASSWORD): no customer-portal sign-ins.'] });
  const short = demoPasswords({ DEMO_STAFF_PASSWORD: 'abc' });
  assert.equal(short.staff, null); assert.equal(short.customer, null);
  assert.match(short.problems[0]!, /has 3 characters; it needs at least 8/);
  const ok = demoPasswords({ DEMO_STAFF_PASSWORD: ' Long-Enough-1 ' });
  assert.equal(ok.staff, 'Long-Enough-1'); assert.equal(ok.customer, 'Long-Enough-1'); assert.deepEqual(ok.problems, []);
  const both = demoPasswords({ DEMO_STAFF_PASSWORD: 'Long-Enough-1', DEMO_CUSTOMER_PASSWORD: 'Customers-Only-2' });
  assert.equal(both.customer, 'Customers-Only-2');
  for (const p of ['apps/portal/lib/demo/people.ts', 'apps/portal/lib/demo/people-load.ts', 'apps/portal/scripts/demo-people.ts', 'apps/portal/scripts/demo-reset.ts', 'scripts/db-push-if-vercel.js']) {
    const src = read(p);
    assert.ok(!/password\s*[:=]\s*['"`][^'"`]{3,}/i.test(src), `${p} holds no password literal`);
    assert.ok(!/console\.(log|warn|error)\([^)]*(staffPassword|customerPassword|DEMO_STAFF_PASSWORD\b[^)]*\$\{)/.test(src), `${p} never prints a password`);
  }
});

test('the loader keeps the rules in its code: only a demo organisation, a password already set is kept unless RESET_DEMO_PASSWORDS=yes, the first release’s plant accounts are renamed not doubled, stray demo people switched off, one audit entry', () => {
  const src = read('apps/portal/lib/demo/people-load.ts');
  assert.match(src, /if \(!org\.isDemo\) \{ r\.skipped =/);
  assert.match(src, /env\.RESET_DEMO_PASSWORDS === 'yes'/);
  assert.match(src, /else if \(reset\) \{\s*await prisma\.account\.update/);
  assert.match(src, /session\.deleteMany\(\{ where: \{ userId \} \}\)/);
  assert.match(src, /previousEmail/);
  assert.match(src, /disableStrayDemoPeople/);
  assert.match(src, /action: 'demo\.people_loaded'/);
  assert.match(src, /customerSession\.deleteMany/);
  // The plant demo's own loader renames too, and never switches a person back on.
  const plant = read('apps/portal/lib/plant/demo/load.ts');
  assert.match(plant, /previousEmail/);
  assert.ok(!/update: \{[^}]*isActive: true/.test(plant), 'the plant demo never re-enables an account');
});

test('the production build makes the demo people only when DEMO_STAFF_PASSWORD is set, after the schema, and never fails the deploy for them; the commands exist', () => {
  const deploy = read('scripts/db-push-if-vercel.js');
  assert.ok(deploy.indexOf('applyPostdeploySql();') < deploy.indexOf("if (process.env.DEMO_STAFF_PASSWORD)"));
  assert.match(deploy, /npx tsx apps\/portal\/scripts\/demo-people\.ts/);
  assert.match(deploy, /catch \(err\)[\s\S]*The app still deploys/);
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['demo:people'], 'npx tsx apps/portal/scripts/demo-people.ts');
  assert.equal(pkg.scripts['demo:reset'], 'npx tsx apps/portal/scripts/demo-reset.ts');
  const reset = read('apps/portal/scripts/demo-reset.ts');
  assert.match(reset, /loadDemoPeople\(prisma, org\.id/);
  assert.match(reset, /DEMO_RESET_CONFIRM/);
  // The schema column and its re-runnable SQL.
  assert.match(read('packages/database/prisma/schema.prisma'), /isDemo\s+Boolean\s+@default\(false\)/);
  assert.match(read('scripts/predeploy/0017-demo-organisation.sql'), /ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(read('scripts/v-d1-demo-people.sql'), /ADD COLUMN IF NOT EXISTS "isDemo"/);
});

test('docs/KEWALRAM_DEMO.md lists every demo sign-in (staff and customers) with its employee number, and never a password', () => {
  const doc = read('docs/KEWALRAM_DEMO.md');
  for (const s of DEMO_STAFF) { assert.ok(doc.includes(`\`${s.email}\``), s.email); assert.ok(doc.includes(s.employeeId), s.employeeId); assert.ok(doc.includes(s.name), s.name); }
  for (const c of DEMO_CUSTOMERS) assert.ok(doc.includes(`\`${c.email}\``), c.email);
  assert.ok(!/password\s*(is|:)\s*`[^`]+`/i.test(doc), 'no password written in the tour');
  assert.match(doc, /DEMO_STAFF_PASSWORD/);
});
