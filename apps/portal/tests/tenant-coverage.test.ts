/**
 * "What you are supposed to see is what you see", checked on the source.
 * Every exported server action is an endpoint a signed-in browser can call
 * with any id, so each one must check the record, not only the person's role:
 *
 *  1. Reads that take an id check the record's branch / organisation.
 *  2. Writes that take an id check the record (branch, organisation or assignment).
 *  3. The security desk acts only on its own branch's records.
 *  4. Nobody can create an account from the internet; a deactivated person
 *     cannot sign in and is signed out at once.
 *  5. Lists are fenced to the person's organisation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const ACTIONS = join(ROOT, 'lib', 'actions');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const WRITE = /\b(?:prisma|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
const READ = /\bprisma\.\w+\.(find\w*|count|aggregate|groupBy)\(/;
const TAKES_ID = /\b\w*[iI]d\w*\s*:\s*string/;

type Fn = { file: string; name: string; sig: string; body: string };
function actions(): Fn[] {
  const out: Fn[] = [];
  for (const file of readdirSync(ACTIONS).filter((n) => n.endsWith('.ts') && !n.includes('form-handlers'))) {
    const src = readFileSync(join(ACTIONS, file), 'utf8');
    if (!src.slice(0, 300).includes("'use server'")) continue;
    for (const part of src.split('\nexport async function ').slice(1)) {
      const name = part.slice(0, part.indexOf('('));
      const sig = part.slice(0, part.indexOf(')') + 1);
      const end = part.indexOf('\nexport ');
      out.push({ file, name, sig, body: end === -1 ? part : part.slice(0, end) });
    }
  }
  return out;
}

/** Anything that checks the record (or scopes the query) counts as a fence. */
const READ_FENCES = [
  'seeJobCard', 'seeService', 'seeBranch', 'seeVehicle', 'seePart', 'seeTarget', 'jobOrServiceReach', 'partsOfMyOrganisation',
  'branchOwnedByMyOrganisation', 'myOrganisationBranches', 'reachWhere', 'canSeeRecord', 'seeOrNull', 'authorizeOn', 'orgWhere',
  'orgOwned', 'inMyOrganisation', 'actingOrgWhere', 'visibleOrNull', 'branchWithinReach', 'firstReach', 'historyVisible',
  'getAppointment(', 'requireJobCardApprover', 'managerApprovers', 'me()', 'requireStoreStaff',
  // Organisation structure (lib/actions/structure.ts): fenced to the person's organisation + authorize with the branch.
  'branchInMyOrg(', 'departmentInMyOrg(', 'orgFence(o)',
  'requireEligible', 'requireWarrantyStaff', 'requireWarrantyApprover', 'requireStaff', 'getSchedulingAccess', 'loadForChange',
  'loadForGroups', 'requireMasterAdmin', 'currentUserIsMasterAdmin', 'branchInMyOrganisationOrSystem', 'onMyDesk',
  'allows(', // with the record (branch / assignees) — e.g. canRequestRoadTestOn
  // Customers (lib/actions/crm.ts): the customer — or its address / contact / note — looked up inside the person's organisation (orgWhere).
  'fencedCustomer',
  // Enyo (lib/actions/enyo.ts): the person's own chats and facts, by user id AND the organisation the chat route stores them under.
  'myEnyoOrg(',
  // Integrity alerts: where { AND: [{ id }, visible(await integrityReviewer()) ] } — the reviewer's organisation, never about themselves.
  'integrityReviewer(',
  // People the organisation publishes: where { id, organisationId: profileOrg() } (the administrator's own organisation).
  'profileOrg(',
  // News & media: where { id, organisationId: newsOrg() } (the communications team's own organisation).
  'newsOrg(',
  // Data Exchange (lib/actions/data-exchange.ts): where { id, organisationId } of the person's own organisation (exchangeOrg).
  'myImportJob(',
  // Exports (lib/actions/exports.ts): where { id, organisationId } of the person's own organisation (the platform team: any).
  'myExportJob(',
  // Assembly plant (lib/actions/plant.ts): where { id, organisationId, branch reach } (myPdi / plantFence).
  'myPdi(', 'plantFence(',
];

/** Reads that need no record fence, with the reason. */
const READ_EXCEPTIONS: Record<string, string> = {
  'dashboard.ts:listActiveAnnouncements': 'compares the id with myOrganisationId() and returns nothing otherwise',
  'organisation.ts:getOrganisation': "the person's own organisation (platform team: the first)",
  'security.ts:getMe': 'the signed-in person only',
};

test('every read action that takes an id checks the record it reads', () => {
  const missing: string[] = [];
  for (const f of actions()) {
    if (WRITE.test(f.body) || !READ.test(f.body) || !TAKES_ID.test(f.sig)) continue;
    if (`${f.file}:${f.name}` in READ_EXCEPTIONS) continue;
    if (!READ_FENCES.some((k) => f.body.includes(k))) missing.push(`${f.file}: ${f.name}`);
  }
  assert.deepEqual(missing, [], `Reads by id with no record check:\n${missing.join('\n')}`);
});

const RECORD_CHECKS = [
  ...READ_FENCES, 'requireJobCardApprover', 'requireAssignedTechnician', 'requireEstimateContributor', 'requireJobCardCreatorOrSupervisor',
  'requireAssignedVehicleServiceTechnician', 'requireVehicleServiceStepRole', 'requireServiceEstimateContributor', 'homeBranch',
  'canDecide', 'headApproversFor', 'checkPair', 'requireBookFor', 'assertRoomIsMine', 'onMyDesk', 'ownBroadcast', 'editableRole',
  'actorOrg', 'inMyOrganisation(',
  // Enyo learned answers: where { id, organisationId: learnedOrg() } (the person's own organisation).
  'learnedOrg(',
  // Support centre set-up: where { id, organisationId: supportOrg() } (the person's own organisation).
  'supportOrg(',
];
/** authorize(key, { branchId … }) — a role check WITH the record's branch. */
const AUTHORIZE_WITH_RECORD = /\bauthorize\([^,]+,\s*\{\s*branchId/;
/** Writes checked another way, with the reason. */
const WRITE_EXCEPTIONS: Record<string, string> = {
  'organisation.ts:updateOrganisation': 'refuses any organisation but the person\'s own (me.organisationId !== organisationId)',
};

test('every write action that takes an id checks the record it changes', () => {
  const missing: string[] = [];
  for (const f of actions()) {
    if (!WRITE.test(f.body) || !TAKES_ID.test(f.sig)) continue;
    if (`${f.file}:${f.name}` in WRITE_EXCEPTIONS) continue;
    if (!RECORD_CHECKS.some((k) => f.body.includes(k)) && !AUTHORIZE_WITH_RECORD.test(f.body)) missing.push(`${f.file}: ${f.name}`);
  }
  assert.deepEqual(missing, [], `Writes by id with no record check:\n${missing.join('\n')}`);
});

test('every security write by id checks the desk branch or the organisation', () => {
  const src = read('lib/actions/security.ts');
  const missing: string[] = [];
  for (const part of src.split('\nexport async function ').slice(1)) {
    const name = part.slice(0, part.indexOf('('));
    const sig = part.slice(0, part.indexOf(')') + 1);
    const end = part.indexOf('\nexport ');
    const body = end === -1 ? part : part.slice(0, end);
    if (!TAKES_ID.test(sig) || !WRITE.test(body)) continue;
    if (!body.includes('onMyDesk(') && !body.includes('inMyOrganisation(')) missing.push(name);
  }
  assert.deepEqual(missing, [], `Security writes without a branch / organisation check:\n${missing.join('\n')}`);
});

test('the security desk acts only on its own branch: every desk action calls onMyDesk', () => {
  const src = read('lib/actions/security.ts');
  const missing: string[] = [];
  for (const part of src.split('\nexport async function ').slice(1)) {
    const name = part.slice(0, part.indexOf('('));
    const sig = part.slice(0, part.indexOf(')') + 1);
    const end = part.indexOf('\nexport ');
    const body = end === -1 ? part : part.slice(0, end);
    if (!/await require(Gate|FrontDesk|Chief)\(\)/.test(body) || !TAKES_ID.test(sig)) continue;
    if (name === 'recordDeliveryArrival' ? !body.includes("if (deliveryId) await onMyDesk(") : !body.includes('await onMyDesk(')) missing.push(name);
  }
  assert.deepEqual(missing, [], `Desk actions without the branch check:\n${missing.join('\n')}`);
  // Acting as the desk on someone else's booking / pass: the desk's own branch.
  assert.match(src, /export async function updateBooking\([\s\S]{0,1200}await onMyDesk\('visit', visitId, 'updateBooking'\)/);
  assert.match(src, /export async function cancelVisit\([\s\S]{0,1200}await onMyDesk\('visit', visitId, 'cancelVisit'\)/);
  assert.match(src, /export async function cancelContractorPass\([\s\S]{0,1200}await onMyDesk\('contractorPass', id, 'cancelContractorPass'\)/);
  for (const fn of ['confirmDeliveryReceived', 'cancelDelivery']) assert.match(src, new RegExp(`export async function ${fn}\\([\\s\\S]{0,400}onMyDesk\\('gateDelivery', id, '${fn}', true\\)`), fn);
});

test('nobody can create an account from the internet (staff or customer)', () => {
  assert.match(read('lib/auth.ts'), /emailAndPassword: \{[\s\S]{0,200}disableSignUp: true/);
  assert.match(readFileSync(join(ROOT, '..', 'website', 'lib', 'auth-customer.ts'), 'utf8'), /emailAndPassword: \{[\s\S]{0,300}disableSignUp: true/);
});

test('a deactivated person cannot sign in and is signed out at once', () => {
  const auth = read('lib/auth.ts');
  assert.match(auth, /databaseHooks: \{[\s\S]{0,200}session: \{[\s\S]{0,100}create: \{[\s\S]{0,100}before: async[\s\S]{0,200}isActive/);
  assert.match(read('lib/actions/workshop.ts'), /const sessionForRequest = cache\(async \(\) => \{[\s\S]{0,400}return u\?\.isActive \? session : null;/);
  assert.match(read('app/(app)/layout.tsx'), /if \(!user\?\.isActive\) redirect\('\/signed-out\?reason=inactive'\)/);
  // …which clears the browser's session cookies (no redirect loop with the middleware).
  const out = read('app/signed-out/route.ts');
  assert.match(out, /session_token/);
  assert.match(out, /maxAge: 0/);
  assert.match(read('middleware.ts'), /ALWAYS_PUBLIC = \[[^\]]*'\/signed-out'/);
  // A stale cookie with no session also goes through /signed-out (never /login ↔ /dashboard).
  assert.match(read('app/(app)/layout.tsx'), /if \(!session\?\.user\?\.id\) \{[\s\S]{0,250}redirect\('\/signed-out'\)/);
  const setActive = read('lib/actions/users-admin.ts');
  assert.match(setActive, /if \(!active\) await tx\.session\.deleteMany\(\{ where: \{ userId \} \}\)/, 'switching off removes every open session');
  assert.match(setActive, /You cannot switch off your own account/);
  assert.match(setActive, /platform owner's account cannot be switched off/);
});

test('adding a staff member never emails a password and stays inside the organisation', () => {
  const src = read('lib/actions/users-admin.ts');
  const create = src.slice(src.indexOf('export async function createStaffMember('), src.indexOf('export async function setStaffActive('));
  assert.match(create, /randomBytes\(32\)/, 'unusable random password until the person sets their own');
  assert.match(create, /sendStaffAccessEmail\(created\.id, 'welcome'\)/, 'a welcome with a set-your-password link is emailed');
  assert.match(create, /nextEmployeeId\(branch\.id\)/, 'the employee ID is issued by the server, never typed');
  assert.doesNotMatch(create, /input\.employeeId/, 'nobody chooses an employee ID');
  const onboarding = read('lib/staff-onboarding.ts');
  assert.match(onboarding, /createVerificationValue\(\{ value: userId, identifier: `reset-password:\$\{token\}`/, 'the link is the auth library\'s own one-time reset token');
  assert.match(onboarding, /randomBytes\((18|2[4-9]|3[0-2])\)/, 'an unguessable token (at least 144 bits)');
  assert.doesNotMatch(create, /temporaryPassword|generateSecurePassword/, 'no password is ever emailed');
  assert.match(create, /Choose a branch of your organisation/);
  assert.match(create, /You can only add people to your own branch/);
  assert.match(create, /Administrator roles are given by headquarters/);
  assert.match(create, /r\.isSuperAdmin \|\| r\.organisationId !== branchOrg/, 'never the platform role, never another organisation\'s role');
});

test('lists that used to read platform-wide are fenced', () => {
  assert.match(read('lib/actions/refunds.ts'), /export async function listAllRefunds[\s\S]{0,300}jobOrServiceReach\(\)/);
  assert.match(read('lib/actions/workshop.ts'), /export async function getWorkshopCustodySummary[\s\S]{0,1600}reachWhere\('workshop\.job_card\.view'\)/);
  const wf = read('lib/actions/workflow-actions.ts');
  assert.doesNotMatch(wf, /const T = 40;/, 'never "the newest 40 platform-wide, then filtered"');
  for (const m of wf.matchAll(/prisma\.(\w+)\.findMany\(\{ where: \{([^]*?)\}, take: T/g)) {
    assert.match(m[2]!, /reach/, `${m[1]} action items must be scoped to the person's reach`);
  }
  assert.match(read('lib/actions/visit-outcomes.ts'), /id: \{ in: ids \}, \.\.\.\(await reachWhere/);
  assert.match(read('lib/actions/scheduling.ts'), /export async function listRooms[\s\S]{0,300}branchOwnedByMyOrganisation\(\)/);
  assert.match(read('lib/actions/dashboard.ts'), /listActiveAnnouncements[\s\S]{0,300}mine !== organisationId\) return \[\]/);
});

test('staff lists (names and emails) are never handed out for another organisation\'s branch', () => {
  assert.match(read('lib/actions/store.ts'), /listEligibleStoreManagersForBranch[\s\S]{0,200}branchInMyOrganisationOrSystem/);
  assert.match(read('lib/actions/store.ts'), /listEligibleStoreOfficersForBranch[\s\S]{0,200}branchInMyOrganisationOrSystem/);
  assert.match(read('lib/actions/workshop.ts'), /listEligibleFinanceOfficersForBranch[\s\S]{0,200}branchInMyOrganisationOrSystem/);
  assert.match(read('lib/actions/workshop.ts'), /listEligibleManagersForBranch\(branchId: string\)[\s\S]{0,200}branchInMyOrganisationOrSystem/);
});

test('the Store is found per organisation, never "the first Store department anywhere"', () => {
  const store = read('lib/actions/store.ts');
  const fn = store.slice(store.indexOf('export async function getStoreBranchId('), store.indexOf('export async function getStoreBranchId(') + 600);
  assert.match(fn, /getStoreBranchIdForMe\(\)/);
  assert.doesNotMatch(fn, /department\.findFirst\(\{\s*where: \{ slug: 'store' \}/);
});
