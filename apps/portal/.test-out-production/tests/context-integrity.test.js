"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const context_core_1 = require("../lib/support/context-core");
const customer_links_core_1 = require("../lib/customer-links-core");
const core_1 = require("../lib/support/core");
const monitor_core_1 = require("../lib/support/monitor-core");
const support_rules_1 = require("../lib/support-rules");
const core_2 = require("../lib/integrity/core");
const decisions_core_1 = require("../lib/insights/decisions-core");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (p) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, p), 'utf8');
const NOW = new Date('2026-10-16T10:00:00Z');
const SITE = 'https://dealer.example.com';
const L = { ...(0, customer_links_core_1.customerLinks)(SITE) };
const customer = (over = {}) => ({
    id: 'c1', name: 'Ada Obi',
    portal: { on: true, hasPassword: true, lastLoginAt: new Date('2026-10-10T09:00:00Z'), failedRecently: 0, lastFailedAt: null, resetRequestedAt: null, offReason: null, offAt: null, offBy: null },
    jobs: [{ id: 'jc1', number: 'JC-2026-000123', status: 'AWAITING_PARTS', vehicle: 'Toyota Hilux', plate: 'KJA-219XY', updatedAt: new Date('2026-10-15T09:00:00Z') }],
    services: [], warranties: [{ id: 'w1', number: 'WR-2026-000001', status: 'ACTIVE', subject: 'Battery', endsAt: new Date('2027-01-01T00:00:00Z') }], claims: [], errors: [], openRequests: 1,
    ...over,
});
const staff = (over = {}) => ({
    id: 'u1', name: 'Bayo Ade', active: true, roles: ['Store Officer'], platformTeam: false, branch: 'Isolo', department: null, lastLoginAt: new Date('2026-10-15T08:00:00Z'),
    failedRecently: 0, lastFailedAt: null, deactivatedReason: null, deactivatedAt: null,
    errors: [{ ref: '3553129217', path: '/workshop/parts-requests', message: 'Prisma error: unique constraint', at: new Date('2026-10-16T08:00:00Z') }],
    denied: [], work: 'Works in: branch Isolo.', guides: [{ title: 'Release parts', href: '/workshop/parts-requests', steps: ['Open the slip.', 'Press Release.'], youCanDoThis: true }],
    ...over,
});
const ctx = (over) => ({
    kind: 'customer', proven: true, provenHow: 'dmarc', customer: customer(), staff: null, customerLinks: (0, context_core_1.linksForCustomer)(customer(), L), staffLinks: [], login: (0, context_core_1.customerLoginDiagnosis)(customer(), NOW), ...over,
});
const triage = (over = {}) => ({ topic: 'job_status', priority: 'NORMAL', sentiment: 'neutral', language: 'en', needsRecords: true, confidence: 0.9, summary: '', ...over });
(0, node_test_1.test)('deep links go to the exact customer-portal page (never a dashboard anchor)', () => {
    strict_1.default.equal(L.jobCard('abc'), `${SITE}/customer-portal/dashboard/services/jc/abc`);
    strict_1.default.equal(L.service('x y'), `${SITE}/customer-portal/dashboard/services/vs/x%20y`);
    strict_1.default.equal((0, customer_links_core_1.customerRecordUrl)(SITE, 'VehicleService', 's1'), `${SITE}/customer-portal/dashboard/services/vs/s1`);
    strict_1.default.equal(L.forgotPassword, `${SITE}/customer-portal/forgot-password`);
    for (const f of ['lib/actions/workshop.ts', 'lib/actions/vehicle-service.ts', 'lib/actions/refunds.ts', 'lib/actions/sourcing.ts', 'lib/actions/vehicle-service-payment.ts', 'lib/actions/vehicle-service-estimate.ts']) {
        strict_1.default.doesNotMatch(read(f), /customer-portal\/dashboard#/, `${f} links to an anchor that does not exist`);
    }
});
(0, node_test_1.test)('who is writing: customer, colleague or both, and when we may use their records', () => {
    strict_1.default.equal((0, context_core_1.senderKind)(true, true), 'both');
    strict_1.default.equal((0, context_core_1.senderKind)(false, false), 'unknown');
    const base = { channel: 'EMAIL', authenticatedSender: true, verified: false, ticketCustomerId: null, requesterUserId: null, contactEmail: 'ada@x.ng', customerEmail: 'ADA@x.ng', staffEmail: null };
    strict_1.default.equal((0, context_core_1.provenSender)(base), 'dmarc');
    strict_1.default.equal((0, context_core_1.provenSender)({ ...base, authenticatedSender: false }), 'none', 'an unproven email never unlocks records');
    strict_1.default.equal((0, context_core_1.provenSender)({ ...base, customerEmail: 'other@x.ng' }), 'none', 'proven, but not the address on file');
    strict_1.default.equal((0, context_core_1.provenSender)({ ...base, channel: 'CUSTOMER_PORTAL', ticketCustomerId: 'c1', authenticatedSender: false }), 'signed_in');
    strict_1.default.equal((0, context_core_1.provenSender)({ ...base, requesterUserId: 'u1' }), 'own_request');
});
(0, node_test_1.test)('"I cannot log in": access off, no password, failed attempts — reasons for colleagues only', () => {
    const off = (0, context_core_1.customerLoginDiagnosis)(customer({ portal: { ...customer().portal, on: false, offReason: 'Owes for two jobs', offBy: 'Kemi', offAt: new Date('2026-10-01T00:00:00Z') } }), NOW);
    strict_1.default.equal(off.code, 'access_off');
    strict_1.default.ok(off.needsPerson);
    strict_1.default.match(off.forStaff, /Owes for two jobs/);
    strict_1.default.doesNotMatch(off.forSender, /Owes/, 'the internal reason never goes to the sender');
    strict_1.default.equal((0, context_core_1.customerLoginDiagnosis)(customer({ portal: { ...customer().portal, hasPassword: false } }), NOW).code, 'no_password');
    strict_1.default.equal((0, context_core_1.customerLoginDiagnosis)(customer({ portal: { ...customer().portal, failedRecently: 5 } }), NOW).code, 'locked_out_attempts');
    strict_1.default.equal((0, context_core_1.customerLoginDiagnosis)(null, NOW).code, 'no_account');
    const gone = (0, context_core_1.staffLoginDiagnosis)(staff({ active: false, deactivatedReason: 'Left the company' }), NOW);
    strict_1.default.equal(gone.code, 'deactivated');
    strict_1.default.doesNotMatch(gone.forSender, /Left the company/);
});
(0, node_test_1.test)('what Enyo is given: records and links only when proven; never internal reasons', () => {
    const proven = (0, context_core_1.senderFacts)(ctx({}), NOW);
    strict_1.default.match(proven.text, /JC-2026-000123/);
    strict_1.default.match(proven.text, /Waiting for parts/);
    strict_1.default.ok(proven.links.some((l) => l.url === L.jobCard('jc1')));
    const unproven = (0, context_core_1.senderFacts)(ctx({ proven: false, provenHow: 'none' }), NOW);
    strict_1.default.doesNotMatch(unproven.text, /JC-2026|Hilux|Battery/);
    strict_1.default.match(unproven.text, /could NOT be confirmed/);
    strict_1.default.equal(unproven.links.length, 3);
    const off = ctx({ customer: customer({ portal: { ...customer().portal, on: false, offReason: 'Secret reason' } }) });
    off.login = (0, context_core_1.customerLoginDiagnosis)(off.customer, NOW);
    strict_1.default.doesNotMatch((0, context_core_1.senderFacts)(off, NOW).text, /Secret reason/);
    // A colleague's own request: their role, errors, guides and portal links.
    const help = ctx({ kind: 'staff', provenHow: 'own_request', customer: null, staff: staff(), staffLinks: (0, context_core_1.linksForStaff)(staff(), 'https://portal.example.com'), login: (0, context_core_1.staffLoginDiagnosis)(staff(), NOW) });
    const t = (0, context_core_1.senderFacts)(help, NOW).text;
    strict_1.default.match(t, /colleague asking for help/);
    strict_1.default.match(t, /3553129217/);
    strict_1.default.match(t, /Release parts/);
    strict_1.default.ok((0, context_core_1.senderFacts)(help, NOW).links.some((l) => l.url === 'https://portal.example.com/workshop/parts-requests'));
    strict_1.default.deepEqual(Object.keys((0, context_core_1.contextSnapshot)(help)).sort(), ['how', 'kind', 'login', 'proven', 'records', 'staff']);
});
(0, node_test_1.test)('the colleague sees everything, with the staff page and the customer link for each record', () => {
    const v = (0, context_core_1.senderView)(ctx({}), { canSeeErrors: false, now: NOW });
    strict_1.default.equal(v.records[0].href, '/workshop/job-cards/jc1');
    strict_1.default.equal(v.records[0].customerUrl, L.jobCard('jc1'));
    const s = (0, context_core_1.senderView)(ctx({ kind: 'staff', staff: staff() }), { canSeeErrors: true, now: NOW });
    strict_1.default.equal(s.staff.errors[0].href, '/audit-logs/errors?ref=3553129217');
    strict_1.default.equal((0, context_core_1.senderView)(ctx({ kind: 'staff', staff: staff() }), { canSeeErrors: false }).staff.errors[0].href, null);
});
(0, node_test_1.test)('Enyo may answer a proven sender from their own records — never money, complaints or unproven senders', () => {
    strict_1.default.equal((0, context_core_1.recordsReadyFor)(ctx({}), 'job_status'), true);
    strict_1.default.equal((0, context_core_1.recordsReadyFor)(ctx({ proven: false }), 'job_status'), false);
    strict_1.default.equal((0, context_core_1.recordsReadyFor)(ctx({}), 'invoice_payment'), false);
    strict_1.default.equal((0, context_core_1.recordsReadyFor)(ctx({ customer: customer({ jobs: [] }) }), 'job_status'), false, 'nothing to answer from');
    const rules = { mode: 'AUTO', text: 'Where is my car?', threshold: 0.75, answerConfidence: 0.9, hasSources: true, repeatContact: false, autoReplyAllowed: true, senderVerified: true };
    strict_1.default.equal((0, core_1.aiDecision)({ ...rules, triage: triage(), recordsReady: true }).action, 'answer');
    strict_1.default.deepEqual((0, core_1.aiDecision)({ ...rules, triage: triage(), recordsReady: false }).reasons, ['needs_records']);
    strict_1.default.ok((0, core_1.aiDecision)({ ...rules, triage: triage(), recordsReady: true, text: 'I want a refund now' }).reasons.includes('money'));
    strict_1.default.ok((0, core_1.aiDecision)({ ...rules, triage: triage({ topic: 'account_access' }), recordsReady: true, personOnly: 'access_off' }).reasons.includes('access_off'));
});
(0, node_test_1.test)('links on our own sites must be exactly the ones given; record numbers must be in the facts', () => {
    const allowed = [L.jobCard('jc1'), L.forgotPassword];
    strict_1.default.deepEqual((0, core_1.unknownSpecifics)(`See ${L.jobCard('jc1')}.`, allowed, 'JC-2026-000123'), []);
    strict_1.default.deepEqual((0, core_1.unknownSpecifics)(`See ${L.jobCard('other')}`, allowed, ''), [L.jobCard('other')]);
    strict_1.default.deepEqual((0, core_1.unknownSpecifics)('Your JC-2026-000999 is ready', allowed, 'JC-2026-000123'), ['JC-2026-000999']);
    strict_1.default.deepEqual((0, core_1.unknownSpecifics)('Visit https://elsewhere.com/x', allowed, ''), [], 'other sites are unknownContacts’ job');
});
(0, node_test_1.test)('colleagues’ own help requests are private to the help team and support managers', () => {
    strict_1.default.equal((0, support_rules_1.staffHelpFence)(true, []), null);
    strict_1.default.deepEqual((0, support_rules_1.staffHelpFence)(false, []), { OR: [{ requesterUserId: null }] });
    strict_1.default.deepEqual((0, support_rules_1.staffHelpFence)(false, ['q1']), { OR: [{ requesterUserId: null }, { queueId: { in: ['q1'] } }] });
    const support = read('lib/actions/support.ts');
    strict_1.default.equal((support.match(/fenceStaffHelp\(ticketReachWhere/g) ?? []).length >= 12, true, 'every Support centre action applies the fence');
    const help = read('lib/actions/help.ts');
    for (const fn of ['listMyHelpRequests', 'getMyHelpRequest', 'replyToMyHelpRequest', 'answerMyHelpRequest']) {
        const body = help.slice(help.indexOf(`export async function ${fn}(`), help.indexOf('\nexport ', help.indexOf(`export async function ${fn}(`) + 10));
        strict_1.default.match(body, /requesterUserId: m\.id/, `${fn}: only the person's own requests`);
    }
    strict_1.default.match(help, /refuseDuringAssist\('help'\)/);
});
(0, node_test_1.test)('checking Enyo: drafts, verdicts, and the gap report says what to fix', () => {
    strict_1.default.equal((0, monitor_core_1.similarity)('the car is ready today', 'the car is ready today'), 1);
    strict_1.default.equal((0, monitor_core_1.draftUse)('Your vehicle is ready for collection today', 'Your vehicle is ready for collection today, thanks', true), 'USED');
    strict_1.default.equal((0, monitor_core_1.draftUse)('Your vehicle is ready for collection today', 'We need two more days for parts', false), 'IGNORED');
    const g = (0, monitor_core_1.gapReport)([
        { topic: 'warranty', handoverReason: 'no_knowledge,low_confidence' },
        { topic: 'warranty', handoverReason: 'no_knowledge' },
        { topic: 'job_status', handoverReason: 'money,needs_records' },
    ]);
    strict_1.default.equal(g.gaps[0].reason, 'no_knowledge');
    strict_1.default.equal(g.gaps[0].count, 2);
    strict_1.default.match(g.gaps[0].fix, /approve/);
    strict_1.default.ok(g.rightlyHuman.some((h) => h.reason === 'money'), 'money is rightly a person’s, not a gap');
    const m = (0, monitor_core_1.enyoMeasures)({ answered: 10, drafted: 20, reviewed: 5, good: 4, fixed: 1, wrong: 0, used: 8, edited: 6, ignored: 6, confirmed: 3, escalated: 1 });
    strict_1.default.equal(m.accuracy, 80);
    strict_1.default.equal(m.draftAcceptance, 70);
    const monitor = read('lib/actions/support-monitor.ts');
    strict_1.default.match(monitor, /status: 'PENDING'/, 'a correction waits for approval');
    strict_1.default.match(monitor, /RECORD_TOPICS\.includes\(topic\)/, 'answers about one customer’s records are never learned');
});
(0, node_test_1.test)('integrity statistics: robust z-scores, spikes, Benford, splits, names, hours', () => {
    strict_1.default.equal(Math.round((0, core_2.modifiedZ)(10, [1, 2, 2, 3, 2, 1, 2]) * 10) / 10 > 3.5, true);
    strict_1.default.equal((0, core_2.modifiedZ)(2, [1, 2, 2, 3, 2, 1, 2]) < 1, true);
    const quiet = new Array(60).fill(0).map((_, i) => (i % 3 === 0 ? 2 : 1));
    strict_1.default.equal((0, core_2.spike)(20, quiet).spike, true);
    strict_1.default.equal((0, core_2.spike)(3, quiet).spike, false, 'a few actions are never a spike');
    strict_1.default.deepEqual((0, core_2.dailySeries)([new Date(NOW.getTime() - 1000), new Date(NOW.getTime() - 86_400_000 - 1000)], 3, NOW), [0, 1, 1]);
    strict_1.default.equal((0, core_2.benford)(new Array(999).fill(123)), null, 'too few to say anything');
    const natural = [];
    for (let i = 0; i < 3000; i += 1)
        natural.push(10 ** (1 + 4 * ((i * 0.6180339887) % 1)));
    strict_1.default.equal((0, core_2.benford)(natural).band === 'close' || (0, core_2.benford)(natural).band === 'acceptable', true);
    strict_1.default.equal((0, core_2.benford)(new Array(2000).fill(0).map((_, i) => 5000 + i)).band, 'nonconformity');
    const t = (h) => new Date(NOW.getTime() + h * 3_600_000);
    const groups = (0, core_2.splitGroups)([{ id: 'a', at: t(0), amount: 90, by: 'u' }, { id: 'b', at: t(5), amount: 80, by: 'u' }, { id: 'c', at: t(30), amount: 70, by: 'u' }, { id: 'd', at: t(200), amount: 90, by: 'u' }], 100);
    strict_1.default.deepEqual(groups.map((g) => g.ids), [['a', 'b', 'c']]);
    strict_1.default.equal((0, core_2.sameName)('Mrs Ada Obi', 'ADA OBI'), true);
    strict_1.default.equal((0, core_2.sameName)('Chinedu Eze', 'Ada Obi'), false);
    const hours = { '1': ['08:00', '17:00'], '2': ['08:00', '17:00'], '3': ['08:00', '17:00'], '4': ['08:00', '17:00'], '5': ['08:00', '17:00'] };
    strict_1.default.equal((0, core_2.afterHours)(new Date('2026-10-16T12:00:00Z'), hours), false, 'Friday 1 pm Lagos');
    strict_1.default.equal((0, core_2.afterHours)(new Date('2026-10-16T22:30:00Z'), hours), true, 'Friday 11:30 pm Lagos');
    strict_1.default.equal((0, core_2.afterHours)(new Date('2026-10-17T12:00:00Z'), hours), true, 'Saturday (closed)');
    strict_1.default.equal((0, core_2.afterHours)(new Date('2026-10-16T12:00:00Z'), hours, ['2026-10-16']), true, 'a holiday');
    strict_1.default.equal((0, core_2.moneySeverity)(2_000_000), 'HIGH');
    strict_1.default.equal((0, core_2.moneySeverity)(5_000, 'MEDIUM'), 'MEDIUM');
});
(0, node_test_1.test)('integrity: nobody sees or decides an alert about themselves; Speak up can be anonymous', () => {
    const src = read('lib/actions/integrity.ts');
    strict_1.default.match(src, /OR: \[\{ subjectUserId: null \}, \{ subjectUserId: \{ not: r\.id \} \}\]/);
    strict_1.default.match(src, /Another reviewer must decide an alert about you/);
    strict_1.default.match(src, /reportedById: anonymous \? null : me\.id/);
    strict_1.default.match(src, /userId: anonymous \? null : me\.id, action: 'integrity\.speak_up'/);
    const journal = read('../../packages/database/src/audit-journal.ts');
    strict_1.default.match(journal, /'IntegrityAlert',/, 'the data journal never records who raised an anonymous concern');
    const labels = read('lib/notification-rules.ts');
    for (const a of ['integrity.alert_raised', 'integrity.speak_up', 'user.signed_in', 'user.sign_in_failed'])
        strict_1.default.ok(labels.includes(`'${a}'`), `${a} stays out of the activity feed`);
});
(0, node_test_1.test)('Enyo writes in the person\'s voice: own sent mail, with consent, removed with it', () => {
    const mail = read('lib/actions/mail.ts');
    strict_1.default.match(mail, /if \(box\.aiConsentAt\) await keepWritingSample/);
    strict_1.default.match(mail, /if \(!box\?\.aiConsentAt\) return \[\];/);
    strict_1.default.equal((mail.match(/mailStyleSample\.deleteMany\(\{ where: \{ userId: m\.id \} \}\)/g) ?? []).length, 2, 'withdrawn consent and disconnect remove the samples');
    strict_1.default.match(read('lib/mail/sync.ts'), /mailStyleSample\.deleteMany\(\{ where: \{ sentAt: \{ lt: before \} \} \}\)/);
});
(0, node_test_1.test)('decisions: process picture, readiness, and de-identified training rows', () => {
    const rows = [];
    for (let i = 0; i < 220; i += 1)
        rows.push({ id: `p${i}`, step: 'prs_store', rejected: i < 4, at: new Date(NOW.getTime() + i * 3_600_000 + 6 * 3_600_000), arrivedAt: new Date(NOW.getTime() + i * 3_600_000), amount: 0, lines: 3, requesterRole: 'technician', deciderRole: 'store-officer', reason: i < 4 ? 'Wrong part number' : null, branchId: 'b1' });
    for (let i = 0; i < 60; i += 1)
        rows.push({ id: `e${i}`, step: 'epr_manager', rejected: i % 3 === 0, at: NOW, arrivedAt: NOW, amount: 150_000, lines: 1, requesterRole: 'technician', deciderRole: 'workshop-manager', reason: i % 3 === 0 ? 'No quotation attached.' : null, branchId: 'b1' });
    const pics = (0, decisions_core_1.stepPictures)(rows);
    const store = pics.find((p) => p.step === 'prs_store');
    strict_1.default.equal(store.readiness.level, 'suggest');
    strict_1.default.equal(store.medianWaitH, 6);
    const epr = pics.find((p) => p.step === 'epr_manager');
    strict_1.default.equal(epr.readiness.level, 'guide');
    strict_1.default.equal(epr.reasons[0].reason, 'No quotation attached.');
    strict_1.default.equal((0, decisions_core_1.readiness)(10, 0.5, 2, null).level, 'too_few');
    strict_1.default.equal((0, decisions_core_1.reasonKey)('No quotation attached!!'), (0, decisions_core_1.reasonKey)('no quotation  attached'));
    const tr = (0, decisions_core_1.trainingRow)(rows[0], 'hash1');
    strict_1.default.deepEqual(Object.keys(tr).sort(), ['amount', 'decider_role', 'hour', 'lines', 'on', 'rejected', 'requester_role', 'row_id', 'step', 'wait_hours', 'weekday']);
    strict_1.default.equal(JSON.stringify(tr).includes('Wrong part'), false, 'reasons never leave the portal');
    const names = (0, decisions_core_1.featureNames)(['prs_store'], ['technician']);
    const v = (0, decisions_core_1.decisionFeatures)({ step: 'prs_store', requester_role: 'unknown-role', amount: 0, lines: 2, hour: 9, weekday: 1 }, ['prs_store'], ['technician']);
    strict_1.default.equal(v.length, names.length);
    strict_1.default.equal(v[names.indexOf('requester:other')], 1);
});
(0, node_test_1.test)('review fixes: private details stay private', () => {
    // A colleague emailing support (not their own help request): no errors, refused pages or habits go to the model.
    const email = (0, context_core_1.senderFacts)(ctx({ kind: 'staff', provenHow: 'dmarc', customer: null, staff: staff({ denied: [{ page: '/users', at: NOW }] }) }), NOW).text;
    strict_1.default.doesNotMatch(email, /3553129217|\/users|Works in/);
    // What a person does most never counts private actions.
    strict_1.default.match(read('lib/enyo/work-profile.ts'), /integrity\\.\|access\\.\|support\\.help_/);
    // The audit trail hides integrity entries from non-reviewers and alerts about the viewer.
    strict_1.default.match(read('lib/actions/audit-logs.ts'), /integrityAuditFence/);
    // Unproven senders get the same treatment whatever their account's state.
    strict_1.default.match(read('lib/support/server.ts'), /if \(!ctx\?\.proven \|\| !ctx\.login/);
    // Help requests are private from the first moment (one transaction).
    strict_1.default.match(read('lib/actions/help.ts'), /requesterUserId: m\.id, senderKind: 'staff'/);
    // 'use server' files export only async functions.
    for (const f of ['lib/actions/support-monitor.ts', 'lib/actions/integrity.ts', 'lib/actions/help.ts', 'lib/actions/workflow-insights.ts'])
        strict_1.default.doesNotMatch(read(f), /^export (const|let|class|function )/m, f);
});
