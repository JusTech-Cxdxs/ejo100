/**
 * Staff from SAP HR or a staff list (P7): the pure row check (a name, the
 * person's own work email, a branch, roles by name — never an administrator),
 * the branch a row names, and how the import is wired: accounts switched off
 * with an unusable password and nobody emailed until an Organisation
 * Administrator sends the invitations (each once, audited); undo to the bin
 * only for accounts never invited or used, never holding a password.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoMap, ENTITIES, mappingProblems } from '../lib/data-exchange/fields';
import { checkStaffRow, splitRoles } from '../lib/data-exchange/check-staff';
import { SNAPSHOT_ORDER, staffAccountEligibility } from '../lib/recycle-bin/rules';
import { DATA_INVENTORY } from '../lib/governance/data-inventory';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const H = ['PERNR', 'ENAME', 'Work email', 'Phone', 'Employee ID', 'Branch', 'Department', 'Roles'];
const m = autoMap('staff', H);
const row = (o: Partial<Record<(typeof H)[number], string>>) => H.map((h) => o[h] ?? '');

test('roles: separated by ; , | or lines, each once, at most ten', () => {
  assert.deepEqual(splitRoles('Technician; Front Desk'), ['Technician', 'Front Desk']);
  assert.deepEqual(splitRoles('Kit Inspector, Line Operator | line operator'), ['Kit Inspector', 'Line Operator']);
  assert.deepEqual(splitRoles(''), []);
});

test('a row: the SAP HR columns map themselves; name, own work email and branch required; administrators never by a file', () => {
  assert.deepEqual(mappingProblems('staff', m), []);
  const ok = checkStaffRow(row({ PERNR: '00010200', ENAME: 'Emeka  Okoro', 'Work email': 'Emeka.Okoro@staff.example.com', 'Employee ID': 'emp-0042', Branch: 'Isolo Branch', Department: 'Commercial Vehicle Workshop', Roles: 'Technician' }), m);
  assert.equal(ok.status, 'GOOD', JSON.stringify(ok.issues));
  assert.deepEqual(ok.values, { fullName: 'Emeka Okoro', email: 'emeka.okoro@staff.example.com', phone: null, employeeId: 'EMP-0042', personnelNumber: '10200', branch: 'Isolo Branch', department: 'Commercial Vehicle Workshop', roles: ['Technician'] });
  assert.deepEqual(ok.keys, ['email:emeka.okoro@staff.example.com', 'emp:EMP-0042']);
  const err = (o: Partial<Record<(typeof H)[number], string>>) => checkStaffRow(row(o), m).issues.filter((i) => i.level === 'error').map((i) => i.message);
  assert.deepEqual(err({ 'Work email': 'a@b.ng', Branch: 'Isolo' }), ['Full name is required.']);
  assert.deepEqual(err({ ENAME: 'A Person', Branch: 'Isolo' }), ['Work email is required: the person signs in with it and their invitation goes to it.']);
  assert.match(err({ ENAME: 'A Person', 'Work email': 'not-an-email', Branch: 'Isolo' })[0]!, /is not an email address/);
  assert.match(err({ ENAME: 'A Person', 'Work email': 'a@b.ng' })[0]!, /Branch is required/);
  for (const r of ['Administrator', 'Organisation Administrator', 'Branch Administrator', 'branch-administrator']) assert.match(err({ ENAME: 'A Person', 'Work email': 'a@b.ng', Branch: 'Isolo', Roles: `Technician; ${r}` })[0]!, /added by hand on the Users page, never by a file/, r);
  assert.match(err({ ENAME: 'A Person', 'Work email': 'a@b.ng', Branch: 'Isolo', 'Employee ID': 'EMP 99!' })[0]!, /is not an employee ID/);
  // Notes, not refusals: a shared mailbox, no role yet.
  const shared = checkStaffRow(row({ ENAME: 'Front Office', 'Work email': 'info@kewalram.example.com', Branch: 'Isolo', Roles: 'Front Desk' }), m);
  assert.equal(shared.status, 'WARNING');
  assert.match(shared.issues[0]!.message, /looks like a shared mailbox/);
  assert.match(checkStaffRow(row({ ENAME: 'New Person', 'Work email': 'new.person@staff.example.com', Branch: 'Isolo' }), m).issues[0]!.message, /No role: the person will see only their own account/);
});

test('wired in: switched off, unusable password, nobody emailed at load; invitations once each by an Organisation Administrator; undo never keeps a password', () => {
  const server = read('lib/data-exchange/staff-server.ts');
  assert.match(server, /isActive: false, accountType: 'EMPLOYEE'/);
  assert.match(server, /providerId: 'credential', password: unusable/);
  assert.doesNotMatch(server, /sendEmail|sendStaffAccessEmail|notify/, 'loading emails nobody');
  assert.match(server, /ROLES_NEVER_IMPORTED\.includes\(role\.slug\)/, 'administrator roles refused by slug too, whatever they are called');
  assert.match(server, /already has an EJO account elsewhere/, 'an address belongs to one person, never taken over from another organisation');
  const dx = read('lib/actions/data-exchange.ts');
  const inv = dx.slice(dx.indexOf('export async function sendStaffInvitations'), dx.indexOf('/** Where a record brought in by an import came from'));
  assert.match(inv, /refuseDuringAssist\('sendStaffInvitations'\)/);
  assert.match(inv, /requireOrganisationWideUsers\('sendStaffInvitations'\)/);
  assert.match(inv, /updateMany\(\{ where: \{ id: u\.id, invitedAt: null, isActive: false \}, data: \{ invitedAt: new Date\(\), isActive: true \} \}\)/, 'each person invited once (compare-and-set)');
  assert.match(inv, /sendStaffAccessEmail\(u\.id, 'welcome'\)/);
  assert.match(inv, /action: 'user\.invited'/);
  assert.match(dx, /if \(job\.entity === 'staff'\) await requireOrganisationWideUsers\('approveImport'\)/);
  assert.match(dx, /if \(entity === 'staff'\) await requireOrganisationWideUsers\('undoImportBatch'\)/);
  assert.equal(ENTITIES.staff.needs, 'admin.users.manage');
  assert.equal(ENTITIES.staff.branch, undefined, 'organisation-wide: a branch per row');
  // The open job cards and services find colleagues not yet invited (staff are loaded first).
  for (const f of ['lib/data-exchange/open-jobs-server.ts', 'lib/data-exchange/open-services-server.ts']) assert.match(read(f), /OR: \[\{ isActive: true \}, STAFF_AWAITING_INVITATION\]/, f);
  // The bin: only by an undone import, the person and their roles — never a password, a session or a link.
  assert.deepEqual(SNAPSHOT_ORDER.User, ['user', 'userRole']);
  assert.equal(staffAccountEligibility().eligible, false);
  assert.equal(DATA_INVENTORY.User?.recycleBin, 'IMPORT_UNDO');
  const bin = read('lib/recycle-bin/server.ts');
  assert.doesNotMatch(bin.slice(bin.indexOf('async function snapshotRows'), bin.indexOf('const LOCK')), /account\.find|session\.find|verification\.find/);
  assert.match(bin, /if \(snapshot\.entity === 'User'\) await tx\.account\.create\(\{ data: \{ userId: item\.entityId, accountId: item\.entityId, providerId: 'credential', password: await hashPassword/);
  assert.match(bin, /root\.isActive = false;/, 'a restored account comes back switched off');
  for (const f of ['scripts/predeploy/0021-staff-imports.sql', 'scripts/v-p7-staff-imports.sql']) {
    const sql = read(`../../${f}`);
    assert.match(sql, /ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP\(3\)/);
    assert.doesNotMatch(sql, /^\s*(DROP|DELETE|TRUNCATE|UPDATE) /im, 'additive only');
  }
});
