import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contextSnapshot, customerLoginDiagnosis, linksForCustomer, linksForStaff, provenSender, recordsReadyFor, senderFacts, senderKind, senderView, staffLoginDiagnosis,
  type CustomerFacts, type SenderContext, type StaffFacts,
} from '../lib/support/context-core';
import { customerLinks, customerRecordUrl } from '../lib/customer-links-core';
import { aiDecision, unknownSpecifics, type Triage } from '../lib/support/core';
import { draftUse, enyoMeasures, gapReport, similarity } from '../lib/support/monitor-core';
import { staffHelpFence } from '../lib/support-rules';
import { afterHours, benford, dailySeries, modifiedZ, moneySeverity, sameName, spike, splitGroups } from '../lib/integrity/core';
import { decisionFeatures, featureNames, readiness, reasonKey, stepPictures, trainingRow, type DecisionRow } from '../lib/insights/decisions-core';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const NOW = new Date('2026-10-16T10:00:00Z');
const SITE = 'https://dealer.example.com';
const L = { ...customerLinks(SITE) };

const customer = (over: Partial<CustomerFacts> = {}): CustomerFacts => ({
  id: 'c1', name: 'Ada Obi',
  portal: { on: true, hasPassword: true, lastLoginAt: new Date('2026-10-10T09:00:00Z'), failedRecently: 0, lastFailedAt: null, resetRequestedAt: null, offReason: null, offAt: null, offBy: null },
  jobs: [{ id: 'jc1', number: 'JC-2026-000123', status: 'AWAITING_PARTS', vehicle: 'Toyota Hilux', plate: 'KJA-219XY', updatedAt: new Date('2026-10-15T09:00:00Z') }],
  services: [], warranties: [{ id: 'w1', number: 'WR-2026-000001', status: 'ACTIVE', subject: 'Battery', endsAt: new Date('2027-01-01T00:00:00Z') }], claims: [], errors: [], openRequests: 1,
  ...over,
});
const staff = (over: Partial<StaffFacts> = {}): StaffFacts => ({
  id: 'u1', name: 'Bayo Ade', active: true, roles: ['Store Officer'], platformTeam: false, branch: 'Isolo', department: null, lastLoginAt: new Date('2026-10-15T08:00:00Z'),
  failedRecently: 0, lastFailedAt: null, deactivatedReason: null, deactivatedAt: null,
  errors: [{ ref: '3553129217', path: '/workshop/parts-requests', message: 'Prisma error: unique constraint', at: new Date('2026-10-16T08:00:00Z') }],
  denied: [], work: 'Works in: branch Isolo.', guides: [{ title: 'Release parts', href: '/workshop/parts-requests', steps: ['Open the slip.', 'Press Release.'], youCanDoThis: true }],
  ...over,
});
const ctx = (over: Partial<SenderContext>): SenderContext => ({
  kind: 'customer', proven: true, provenHow: 'dmarc', customer: customer(), staff: null, customerLinks: linksForCustomer(customer(), L), staffLinks: [], login: customerLoginDiagnosis(customer(), NOW), ...over,
});
const triage = (over: Partial<Triage> = {}): Triage => ({ topic: 'job_status', priority: 'NORMAL', sentiment: 'neutral', language: 'en', needsRecords: true, confidence: 0.9, summary: '', ...over });

test('deep links go to the exact customer-portal page (never a dashboard anchor)', () => {
  assert.equal(L.jobCard('abc'), `${SITE}/customer-portal/dashboard/services/jc/abc`);
  assert.equal(L.service('x y'), `${SITE}/customer-portal/dashboard/services/vs/x%20y`);
  assert.equal(customerRecordUrl(SITE, 'VehicleService', 's1'), `${SITE}/customer-portal/dashboard/services/vs/s1`);
  assert.equal(L.forgotPassword, `${SITE}/customer-portal/forgot-password`);
  for (const f of ['lib/actions/workshop.ts', 'lib/actions/vehicle-service.ts', 'lib/actions/refunds.ts', 'lib/actions/sourcing.ts', 'lib/actions/vehicle-service-payment.ts', 'lib/actions/vehicle-service-estimate.ts']) {
    assert.doesNotMatch(read(f), /customer-portal\/dashboard#/, `${f} links to an anchor that does not exist`);
  }
});

test('who is writing: customer, colleague or both, and when we may use their records', () => {
  assert.equal(senderKind(true, true), 'both');
  assert.equal(senderKind(false, false), 'unknown');
  const base = { channel: 'EMAIL', authenticatedSender: true, verified: false, ticketCustomerId: null, requesterUserId: null, contactEmail: 'ada@x.ng', customerEmail: 'ADA@x.ng', staffEmail: null };
  assert.equal(provenSender(base), 'dmarc');
  assert.equal(provenSender({ ...base, authenticatedSender: false }), 'none', 'an unproven email never unlocks records');
  assert.equal(provenSender({ ...base, customerEmail: 'other@x.ng' }), 'none', 'proven, but not the address on file');
  assert.equal(provenSender({ ...base, channel: 'CUSTOMER_PORTAL', ticketCustomerId: 'c1', authenticatedSender: false }), 'signed_in');
  assert.equal(provenSender({ ...base, requesterUserId: 'u1' }), 'own_request');
});

test('"I cannot log in": access off, no password, failed attempts — reasons for colleagues only', () => {
  const off = customerLoginDiagnosis(customer({ portal: { ...customer().portal, on: false, offReason: 'Owes for two jobs', offBy: 'Kemi', offAt: new Date('2026-10-01T00:00:00Z') } }), NOW);
  assert.equal(off.code, 'access_off');
  assert.ok(off.needsPerson);
  assert.match(off.forStaff, /Owes for two jobs/);
  assert.doesNotMatch(off.forSender, /Owes/, 'the internal reason never goes to the sender');
  assert.equal(customerLoginDiagnosis(customer({ portal: { ...customer().portal, hasPassword: false } }), NOW).code, 'no_password');
  assert.equal(customerLoginDiagnosis(customer({ portal: { ...customer().portal, failedRecently: 5 } }), NOW).code, 'locked_out_attempts');
  assert.equal(customerLoginDiagnosis(null, NOW).code, 'no_account');
  const gone = staffLoginDiagnosis(staff({ active: false, deactivatedReason: 'Left the company' }), NOW);
  assert.equal(gone.code, 'deactivated');
  assert.doesNotMatch(gone.forSender, /Left the company/);
});

test('what Enyo is given: records and links only when proven; never internal reasons', () => {
  const proven = senderFacts(ctx({}), NOW);
  assert.match(proven.text, /JC-2026-000123/);
  assert.match(proven.text, /Waiting for parts/);
  assert.ok(proven.links.some((l) => l.url === L.jobCard('jc1')));
  const unproven = senderFacts(ctx({ proven: false, provenHow: 'none' }), NOW);
  assert.doesNotMatch(unproven.text, /JC-2026|Hilux|Battery/);
  assert.match(unproven.text, /could NOT be confirmed/);
  assert.equal(unproven.links.length, 3);
  const off = ctx({ customer: customer({ portal: { ...customer().portal, on: false, offReason: 'Secret reason' } }) });
  off.login = customerLoginDiagnosis(off.customer, NOW);
  assert.doesNotMatch(senderFacts(off, NOW).text, /Secret reason/);
  // A colleague's own request: their role, errors, guides and portal links.
  const help = ctx({ kind: 'staff', provenHow: 'own_request', customer: null, staff: staff(), staffLinks: linksForStaff(staff(), 'https://portal.example.com'), login: staffLoginDiagnosis(staff(), NOW) });
  const t = senderFacts(help, NOW).text;
  assert.match(t, /colleague asking for help/);
  assert.match(t, /3553129217/);
  assert.match(t, /Release parts/);
  assert.ok(senderFacts(help, NOW).links.some((l) => l.url === 'https://portal.example.com/workshop/parts-requests'));
  assert.deepEqual(Object.keys(contextSnapshot(help)).sort(), ['how', 'kind', 'login', 'proven', 'records', 'staff']);
});

test('the colleague sees everything, with the staff page and the customer link for each record', () => {
  const v = senderView(ctx({}), { canSeeErrors: false, now: NOW });
  assert.equal(v.records[0]!.href, '/workshop/job-cards/jc1');
  assert.equal(v.records[0]!.customerUrl, L.jobCard('jc1'));
  const s = senderView(ctx({ kind: 'staff', staff: staff() }), { canSeeErrors: true, now: NOW });
  assert.equal(s.staff!.errors[0]!.href, '/audit-logs/errors?ref=3553129217');
  assert.equal(senderView(ctx({ kind: 'staff', staff: staff() }), { canSeeErrors: false }).staff!.errors[0]!.href, null);
});

test('Enyo may answer a proven sender from their own records — never money, complaints or unproven senders', () => {
  assert.equal(recordsReadyFor(ctx({}), 'job_status'), true);
  assert.equal(recordsReadyFor(ctx({ proven: false }), 'job_status'), false);
  assert.equal(recordsReadyFor(ctx({}), 'invoice_payment'), false);
  assert.equal(recordsReadyFor(ctx({ customer: customer({ jobs: [] }) }), 'job_status'), false, 'nothing to answer from');
  const rules = { mode: 'AUTO' as const, text: 'Where is my car?', threshold: 0.75, answerConfidence: 0.9, hasSources: true, repeatContact: false, autoReplyAllowed: true, senderVerified: true };
  assert.equal(aiDecision({ ...rules, triage: triage(), recordsReady: true }).action, 'answer');
  assert.deepEqual(aiDecision({ ...rules, triage: triage(), recordsReady: false }).reasons, ['needs_records']);
  assert.ok(aiDecision({ ...rules, triage: triage(), recordsReady: true, text: 'I want a refund now' }).reasons.includes('money'));
  assert.ok(aiDecision({ ...rules, triage: triage({ topic: 'account_access' }), recordsReady: true, personOnly: 'access_off' }).reasons.includes('access_off'));
});

test('links on our own sites must be exactly the ones given; record numbers must be in the facts', () => {
  const allowed = [L.jobCard('jc1'), L.forgotPassword];
  assert.deepEqual(unknownSpecifics(`See ${L.jobCard('jc1')}.`, allowed, 'JC-2026-000123'), []);
  assert.deepEqual(unknownSpecifics(`See ${L.jobCard('other')}`, allowed, ''), [L.jobCard('other')]);
  assert.deepEqual(unknownSpecifics('Your JC-2026-000999 is ready', allowed, 'JC-2026-000123'), ['JC-2026-000999']);
  assert.deepEqual(unknownSpecifics('Visit https://elsewhere.com/x', allowed, ''), [], 'other sites are unknownContacts’ job');
});

test('colleagues’ own help requests are private to the help team and support managers', () => {
  assert.equal(staffHelpFence(true, []), null);
  assert.deepEqual(staffHelpFence(false, []), { OR: [{ requesterUserId: null }] });
  assert.deepEqual(staffHelpFence(false, ['q1']), { OR: [{ requesterUserId: null }, { queueId: { in: ['q1'] } }] });
  const support = read('lib/actions/support.ts');
  assert.equal((support.match(/fenceStaffHelp\(ticketReachWhere/g) ?? []).length >= 12, true, 'every Support centre action applies the fence');
  const help = read('lib/actions/help.ts');
  for (const fn of ['listMyHelpRequests', 'getMyHelpRequest', 'replyToMyHelpRequest', 'answerMyHelpRequest']) {
    const body = help.slice(help.indexOf(`export async function ${fn}(`), help.indexOf('\nexport ', help.indexOf(`export async function ${fn}(`) + 10));
    assert.match(body, /requesterUserId: m\.id/, `${fn}: only the person's own requests`);
  }
  assert.match(help, /refuseDuringAssist\('help'\)/);
});

test('checking Enyo: drafts, verdicts, and the gap report says what to fix', () => {
  assert.equal(similarity('the car is ready today', 'the car is ready today'), 1);
  assert.equal(draftUse('Your vehicle is ready for collection today', 'Your vehicle is ready for collection today, thanks', true), 'USED');
  assert.equal(draftUse('Your vehicle is ready for collection today', 'We need two more days for parts', false), 'IGNORED');
  const g = gapReport([
    { topic: 'warranty', handoverReason: 'no_knowledge,low_confidence' },
    { topic: 'warranty', handoverReason: 'no_knowledge' },
    { topic: 'job_status', handoverReason: 'money,needs_records' },
  ]);
  assert.equal(g.gaps[0]!.reason, 'no_knowledge');
  assert.equal(g.gaps[0]!.count, 2);
  assert.match(g.gaps[0]!.fix, /approve/);
  assert.ok(g.rightlyHuman.some((h) => h.reason === 'money'), 'money is rightly a person’s, not a gap');
  const m = enyoMeasures({ answered: 10, drafted: 20, reviewed: 5, good: 4, fixed: 1, wrong: 0, used: 8, edited: 6, ignored: 6, confirmed: 3, escalated: 1 });
  assert.equal(m.accuracy, 80);
  assert.equal(m.draftAcceptance, 70);
  const monitor = read('lib/actions/support-monitor.ts');
  assert.match(monitor, /status: 'PENDING'/, 'a correction waits for approval');
  assert.match(monitor, /RECORD_TOPICS\.includes\(topic\)/, 'answers about one customer’s records are never learned');
});

test('integrity statistics: robust z-scores, spikes, Benford, splits, names, hours', () => {
  assert.equal(Math.round(modifiedZ(10, [1, 2, 2, 3, 2, 1, 2]) * 10) / 10 > 3.5, true);
  assert.equal(modifiedZ(2, [1, 2, 2, 3, 2, 1, 2]) < 1, true);
  const quiet = new Array(60).fill(0).map((_, i) => (i % 3 === 0 ? 2 : 1));
  assert.equal(spike(20, quiet).spike, true);
  assert.equal(spike(3, quiet).spike, false, 'a few actions are never a spike');
  assert.deepEqual(dailySeries([new Date(NOW.getTime() - 1000), new Date(NOW.getTime() - 86_400_000 - 1000)], 3, NOW), [0, 1, 1]);
  assert.equal(benford(new Array(999).fill(123)), null, 'too few to say anything');
  const natural: number[] = [];
  for (let i = 0; i < 3000; i += 1) natural.push(10 ** (1 + 4 * ((i * 0.6180339887) % 1)));
  assert.equal(benford(natural)!.band === 'close' || benford(natural)!.band === 'acceptable', true);
  assert.equal(benford(new Array(2000).fill(0).map((_, i) => 5000 + i))!.band, 'nonconformity');
  const t = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
  const groups = splitGroups([{ id: 'a', at: t(0), amount: 90, by: 'u' }, { id: 'b', at: t(5), amount: 80, by: 'u' }, { id: 'c', at: t(30), amount: 70, by: 'u' }, { id: 'd', at: t(200), amount: 90, by: 'u' }], 100);
  assert.deepEqual(groups.map((g) => g.ids), [['a', 'b', 'c']]);
  assert.equal(sameName('Mrs Ada Obi', 'ADA OBI'), true);
  assert.equal(sameName('Chinedu Eze', 'Ada Obi'), false);
  const hours = { '1': ['08:00', '17:00'] as [string, string], '2': ['08:00', '17:00'] as [string, string], '3': ['08:00', '17:00'] as [string, string], '4': ['08:00', '17:00'] as [string, string], '5': ['08:00', '17:00'] as [string, string] };
  assert.equal(afterHours(new Date('2026-10-16T12:00:00Z'), hours), false, 'Friday 1 pm Lagos');
  assert.equal(afterHours(new Date('2026-10-16T22:30:00Z'), hours), true, 'Friday 11:30 pm Lagos');
  assert.equal(afterHours(new Date('2026-10-17T12:00:00Z'), hours), true, 'Saturday (closed)');
  assert.equal(afterHours(new Date('2026-10-16T12:00:00Z'), hours, ['2026-10-16']), true, 'a holiday');
  assert.equal(moneySeverity(2_000_000), 'HIGH');
  assert.equal(moneySeverity(5_000, 'MEDIUM'), 'MEDIUM');
});

test('integrity: nobody sees or decides an alert about themselves; Speak up can be anonymous', () => {
  const src = read('lib/actions/integrity.ts');
  assert.match(src, /OR: \[\{ subjectUserId: null \}, \{ subjectUserId: \{ not: r\.id \} \}\]/);
  assert.match(src, /Another reviewer must decide an alert about you/);
  assert.match(src, /reportedById: anonymous \? null : me\.id/);
  assert.match(src, /userId: anonymous \? null : me\.id, action: 'integrity\.speak_up'/);
  const journal = read('../../packages/database/src/audit-journal.ts');
  assert.match(journal, /'IntegrityAlert',/, 'the data journal never records who raised an anonymous concern');
  const labels = read('lib/notification-rules.ts');
  for (const a of ['integrity.alert_raised', 'integrity.speak_up', 'user.signed_in', 'user.sign_in_failed']) assert.ok(labels.includes(`'${a}'`), `${a} stays out of the activity feed`);
});

test('Enyo writes in the person\'s voice: own sent mail, with consent, removed with it', () => {
  const mail = read('lib/actions/mail.ts');
  assert.match(mail, /if \(box\.aiConsentAt\) await keepWritingSample/);
  assert.match(mail, /if \(!box\?\.aiConsentAt\) return \[\];/);
  assert.equal((mail.match(/mailStyleSample\.deleteMany\(\{ where: \{ userId: m\.id \} \}\)/g) ?? []).length, 2, 'withdrawn consent and disconnect remove the samples');
  assert.match(read('lib/mail/sync.ts'), /mailStyleSample\.deleteMany\(\{ where: \{ sentAt: \{ lt: before \} \} \}\)/);
});

test('decisions: process picture, readiness, and de-identified training rows', () => {
  const rows: DecisionRow[] = [];
  for (let i = 0; i < 220; i += 1) rows.push({ id: `p${i}`, step: 'prs_store', rejected: i < 4, at: new Date(NOW.getTime() + i * 3_600_000 + 6 * 3_600_000), arrivedAt: new Date(NOW.getTime() + i * 3_600_000), amount: 0, lines: 3, requesterRole: 'technician', deciderRole: 'store-officer', reason: i < 4 ? 'Wrong part number' : null, branchId: 'b1' });
  for (let i = 0; i < 60; i += 1) rows.push({ id: `e${i}`, step: 'epr_manager', rejected: i % 3 === 0, at: NOW, arrivedAt: NOW, amount: 150_000, lines: 1, requesterRole: 'technician', deciderRole: 'workshop-manager', reason: i % 3 === 0 ? 'No quotation attached.' : null, branchId: 'b1' });
  const pics = stepPictures(rows);
  const store = pics.find((p) => p.step === 'prs_store')!;
  assert.equal(store.readiness.level, 'suggest');
  assert.equal(store.medianWaitH, 6);
  const epr = pics.find((p) => p.step === 'epr_manager')!;
  assert.equal(epr.readiness.level, 'guide');
  assert.equal(epr.reasons[0]!.reason, 'No quotation attached.');
  assert.equal(readiness(10, 0.5, 2, null).level, 'too_few');
  assert.equal(reasonKey('No quotation attached!!'), reasonKey('no quotation  attached'));
  const tr = trainingRow(rows[0]!, 'hash1');
  assert.deepEqual(Object.keys(tr).sort(), ['amount', 'decider_role', 'hour', 'lines', 'on', 'rejected', 'requester_role', 'row_id', 'step', 'wait_hours', 'weekday']);
  assert.equal(JSON.stringify(tr).includes('Wrong part'), false, 'reasons never leave the portal');
  const names = featureNames(['prs_store'], ['technician']);
  const v = decisionFeatures({ step: 'prs_store', requester_role: 'unknown-role', amount: 0, lines: 2, hour: 9, weekday: 1 }, ['prs_store'], ['technician']);
  assert.equal(v.length, names.length);
  assert.equal(v[names.indexOf('requester:other')], 1);
});

test('review fixes: private details stay private', () => {
  // A colleague emailing support (not their own help request): no errors, refused pages or habits go to the model.
  const email = senderFacts(ctx({ kind: 'staff', provenHow: 'dmarc', customer: null, staff: staff({ denied: [{ page: '/users', at: NOW }] }) }), NOW).text;
  assert.doesNotMatch(email, /3553129217|\/users|Works in/);
  // What a person does most never counts private actions.
  assert.match(read('lib/enyo/work-profile.ts'), /integrity\\.\|access\\.\|support\\.help_/);
  // The audit trail hides integrity entries from non-reviewers and alerts about the viewer.
  assert.match(read('lib/actions/audit-logs.ts'), /integrityAuditFence/);
  // Unproven senders get the same treatment whatever their account's state.
  assert.match(read('lib/support/server.ts'), /if \(!ctx\?\.proven \|\| !ctx\.login/);
  // Help requests are private from the first moment (one transaction).
  assert.match(read('lib/actions/help.ts'), /requesterUserId: m\.id, senderKind: 'staff'/);
  // 'use server' files export only async functions.
  for (const f of ['lib/actions/support-monitor.ts', 'lib/actions/integrity.ts', 'lib/actions/help.ts', 'lib/actions/workflow-insights.ts']) assert.doesNotMatch(read(f), /^export (const|let|class|function )/m, f);
});
