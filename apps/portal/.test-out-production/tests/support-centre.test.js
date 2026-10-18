"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** The Support centre's rules (lib/support/core.ts). */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const core_1 = require("../lib/support/core");
// Lagos is UTC+1: 08:00 Lagos = 07:00Z.
const L = (iso) => new Date(`${iso}+01:00`);
(0, node_test_1.test)('business hours: counting skips nights, Sundays and holidays (Lagos time)', () => {
    // Friday 16:30 + 60 business minutes → Saturday 09:30 (Sat opens 09:00).
    strict_1.default.equal((0, core_1.addBusinessMinutes)(L('2026-10-16T16:30:00'), 60, core_1.DEFAULT_HOURS).toISOString(), L('2026-10-17T09:30:00').toISOString());
    // Saturday 12:30 + 60 → Monday 08:30 (Sat closes 13:00; Sunday closed).
    strict_1.default.equal((0, core_1.addBusinessMinutes)(L('2026-10-17T12:30:00'), 60, core_1.DEFAULT_HOURS).toISOString(), L('2026-10-19T08:30:00').toISOString());
    // Before opening counts from opening.
    strict_1.default.equal((0, core_1.addBusinessMinutes)(L('2026-10-19T06:00:00'), 30, core_1.DEFAULT_HOURS).toISOString(), L('2026-10-19T08:30:00').toISOString());
    // A holiday Monday is skipped.
    strict_1.default.equal((0, core_1.addBusinessMinutes)(L('2026-10-17T12:30:00'), 60, core_1.DEFAULT_HOURS, ['2026-10-19']).toISOString(), L('2026-10-20T08:30:00').toISOString());
    strict_1.default.equal((0, core_1.isOpen)(L('2026-10-18T10:00:00'), core_1.DEFAULT_HOURS), false);
    strict_1.default.equal((0, core_1.isOpen)(L('2026-10-19T10:00:00'), core_1.DEFAULT_HOURS), true);
    strict_1.default.equal((0, core_1.lagosParts)(L('2026-10-19T00:30:00')).weekday, 1);
});
(0, node_test_1.test)('targets: urgent counts every hour; others business hours; stored targets are checked', () => {
    const opened = L('2026-10-16T20:00:00');
    strict_1.default.equal((0, core_1.dueDates)(opened, 'URGENT', core_1.DEFAULT_TARGETS, core_1.DEFAULT_HOURS).first.toISOString(), L('2026-10-16T20:30:00').toISOString());
    strict_1.default.equal((0, core_1.dueDates)(opened, 'HIGH', core_1.DEFAULT_TARGETS, core_1.DEFAULT_HOURS).first.toISOString(), L('2026-10-17T11:00:00').toISOString());
    const t = (0, core_1.readTargets)({ HIGH: { first: 90, resolve: 'x' }, LOW: { first: 1 } });
    strict_1.default.equal(t.HIGH.first, 90);
    strict_1.default.equal(t.HIGH.resolve, core_1.DEFAULT_TARGETS.HIGH.resolve);
    strict_1.default.equal(t.LOW.first, core_1.DEFAULT_TARGETS.LOW.first);
    strict_1.default.deepEqual((0, core_1.readHours)({ 1: ['09:00', '08:00'] }), core_1.DEFAULT_HOURS);
    strict_1.default.match((0, core_1.promiseLabel)(L('2026-10-17T09:30:00'), L('2026-10-16T16:30:00')), /^by 9:30 am tomorrow$/);
});
(0, node_test_1.test)('SLA state', () => {
    const now = L('2026-10-16T10:00:00');
    strict_1.default.equal((0, core_1.slaState)({ dueFirstResponseAt: L('2026-10-16T09:00:00'), firstResponseAt: null, status: 'OPEN' }, now), 'breached');
    strict_1.default.equal((0, core_1.slaState)({ dueFirstResponseAt: L('2026-10-16T10:30:00'), firstResponseAt: null, status: 'OPEN' }, now), 'due_soon');
    strict_1.default.equal((0, core_1.slaState)({ dueFirstResponseAt: L('2026-10-16T09:00:00'), firstResponseAt: L('2026-10-16T08:59:00'), status: 'OPEN' }, now), 'met');
    strict_1.default.equal((0, core_1.slaState)({ dueFirstResponseAt: null, firstResponseAt: null, status: 'OPEN' }, now), 'none');
});
(0, node_test_1.test)('mail-loop protection: robots, lists, bounces and our own mail never get an automatic reply', () => {
    const own = ['support@kcg.ng'];
    strict_1.default.deepEqual((0, core_1.loopGuard)({ headers: {}, from: 'ada@gmail.com', ownAddresses: own }), { autoReply: true, keep: true, reason: null });
    strict_1.default.equal((0, core_1.loopGuard)({ headers: { 'auto-submitted': 'auto-replied' }, from: 'ada@gmail.com', ownAddresses: own }).autoReply, false);
    strict_1.default.equal((0, core_1.loopGuard)({ headers: { 'auto-submitted': 'no' }, from: 'ada@gmail.com', ownAddresses: own }).autoReply, true);
    strict_1.default.equal((0, core_1.loopGuard)({ headers: { precedence: 'bulk' }, from: 'news@shop.com', ownAddresses: own }).autoReply, false);
    strict_1.default.equal((0, core_1.loopGuard)({ headers: { 'list-id': '<x.list>' }, from: 'a@b.com', ownAddresses: own }).autoReply, false);
    strict_1.default.equal((0, core_1.loopGuard)({ headers: {}, from: 'no-reply@bank.com', ownAddresses: own }).autoReply, false);
    strict_1.default.equal((0, core_1.loopGuard)({ headers: {}, from: 'MAILER-DAEMON@mx.google.com', ownAddresses: own }).keep, false);
    strict_1.default.equal((0, core_1.loopGuard)({ headers: {}, from: 'Support@KCG.ng', ownAddresses: own }).keep, false);
    strict_1.default.equal((0, core_1.autoReplyHeaders)('<a@b>')['Auto-Submitted'], 'auto-replied');
    strict_1.default.equal((0, core_1.senderAuthenticated)({ 'authentication-results': 'mx.google.com; dkim=pass; spf=pass; dmarc=pass' }), true);
    strict_1.default.equal((0, core_1.senderAuthenticated)({ 'authentication-results': 'spf=softfail; dkim=none; dmarc=fail' }), false);
});
(0, node_test_1.test)('threading: the ticket tag and Message-ID references', () => {
    strict_1.default.equal((0, core_1.taggedSubject)('SUP-2026-000123', 'Re: [#SUP-2026-000123] Brakes'), '[#SUP-2026-000123] Re: Brakes');
    strict_1.default.equal((0, core_1.ticketNumberIn)('Re: [#SUP-2026-000123] Brakes'), 'SUP-2026-000123');
    strict_1.default.equal((0, core_1.ticketNumberIn)('Brakes', 'Ref SUP-2026-000007 thanks'), 'SUP-2026-000007');
    strict_1.default.equal((0, core_1.ticketNumberIn)('Hello'), null);
    strict_1.default.deepEqual((0, core_1.referencedIds)('<b@x>', '<a@x> <b@x>'), ['<b@x>', '<a@x>']);
    const route = (0, core_1.recipientMailbox)({ 'delivered-to': 'warranty+abc@kcg.ng' }, ['someone@else.com'], [], [{ id: 'w', address: 'warranty@kcg.ng' }, { id: 's', address: 'support@kcg.ng' }]);
    strict_1.default.equal(route, 'w');
    strict_1.default.equal((0, core_1.recipientMailbox)({}, ['Support@kcg.ng'], [], [{ id: 's', address: 'support@kcg.ng' }]), 's');
});
(0, node_test_1.test)('only the new words of a reply are kept', () => {
    strict_1.default.equal((0, core_1.newText)('Thanks, that worked.\n\nOn Mon, 12 Oct 2026 at 10:00, KCG Support <support@kcg.ng> wrote:\n> Please try…'), 'Thanks, that worked.');
    strict_1.default.equal((0, core_1.newText)('Yes please\n\n-----Original Message-----\nFrom: x'), 'Yes please');
    strict_1.default.equal((0, core_1.newText)('Ok\nFrom: KCG <s@k.ng>\nSent: Monday\nTo: me'), 'Ok');
    strict_1.default.equal((0, core_1.newText)('Fine\n\nSent from my iPhone'), 'Fine');
    strict_1.default.equal((0, core_1.newText)('Line one\n> quoted\nLine two'), 'Line one\n> quoted\nLine two');
});
(0, node_test_1.test)('vehicle-aware details: plates, VINs and record numbers', () => {
    const e = (0, core_1.extractEntities)('My Hilux LND 452 AB (old plate LA123-ABC, VIN JTFST22P300123456) — job JC-2026-000412.');
    strict_1.default.ok(e.plates.includes('LND-452AB'));
    strict_1.default.ok(e.plates.includes('LA123-ABC'));
    strict_1.default.deepEqual(e.vins, ['JTFST22P300123456']);
    strict_1.default.deepEqual(e.records, ['JC-2026-000412']);
});
const triage = (p = {}) => ({ topic: 'opening_hours', priority: 'NORMAL', sentiment: 'neutral', language: 'en', needsRecords: false, confidence: 0.9, summary: '', ...p });
(0, node_test_1.test)('Enyo answers by itself only for calm, general questions it is sure about, in AUTO queues', () => {
    const base = { mode: 'AUTO', triage: triage(), text: 'What time do you open on Saturday?', threshold: 0.75, answerConfidence: 0.9, hasSources: true, repeatContact: false, autoReplyAllowed: true };
    strict_1.default.deepEqual((0, core_1.aiDecision)(base), { action: 'answer', reasons: [] });
    strict_1.default.equal((0, core_1.aiDecision)({ ...base, mode: 'SUGGEST' }).action, 'draft');
    strict_1.default.equal((0, core_1.aiDecision)({ ...base, mode: 'OFF' }).action, 'none');
    strict_1.default.ok((0, core_1.aiDecision)({ ...base, answerConfidence: 0.5 }).reasons.includes('low_confidence'));
    strict_1.default.ok((0, core_1.aiDecision)({ ...base, triage: triage({ needsRecords: true }) }).reasons.includes('needs_records'));
    strict_1.default.ok((0, core_1.aiDecision)({ ...base, text: 'I want a refund now' }).reasons.includes('money'));
    strict_1.default.ok((0, core_1.aiDecision)({ ...base, text: 'Please let me speak to a person' }).reasons.includes('customer_asked'));
    strict_1.default.ok((0, core_1.aiDecision)({ ...base, hasSources: false }).reasons.includes('no_knowledge'));
    strict_1.default.ok((0, core_1.aiDecision)({ ...base, repeatContact: true }).reasons.includes('repeat_contact'));
    strict_1.default.equal((0, core_1.aiDecision)({ ...base, autoReplyAllowed: false }).action, 'none');
    strict_1.default.equal((0, core_1.priorityFromText)('The brake failure nearly caused an accident'), 'URGENT');
    strict_1.default.equal((0, core_1.priorityFromText)('I am disappointed with the service'), 'HIGH');
    strict_1.default.equal((0, core_1.priorityFromText)('Can I get the cost breakdown?'), 'NORMAL');
    strict_1.default.deepEqual((0, core_1.sensitiveReasons)('Please press the button'), []);
});
(0, node_test_1.test)('control-centre measures', () => {
    const now = L('2026-10-16T12:00:00');
    const row = (o) => ({ createdAt: L('2026-10-16T08:00:00'), firstResponseAt: null, resolvedAt: null, dueFirstResponseAt: null, status: 'OPEN', channel: 'EMAIL', queueId: null, priority: 'NORMAL', aiOutcome: null, handoverReason: null, reopenCount: 0, csatScore: null, assignedToId: null, topic: null, ...o });
    const m = (0, core_1.measures)([
        row({ firstResponseAt: L('2026-10-16T08:30:00'), dueFirstResponseAt: L('2026-10-16T09:00:00'), status: 'RESOLVED', resolvedAt: L('2026-10-16T10:00:00'), aiOutcome: 'CONFIRMED', csatScore: 5 }),
        row({ firstResponseAt: L('2026-10-16T10:00:00'), dueFirstResponseAt: L('2026-10-16T09:00:00'), status: 'RESOLVED', resolvedAt: L('2026-10-16T11:00:00'), reopenCount: 1, csatScore: 2, handoverReason: 'money,complaint' }),
        row({ dueFirstResponseAt: L('2026-10-16T09:00:00'), aiOutcome: 'ESCALATED', handoverReason: 'customer_asked' }),
        row({ createdAt: L('2026-10-10T08:00:00'), status: 'WAITING_ON_CUSTOMER' }),
    ], now);
    strict_1.default.equal(m.total, 4);
    strict_1.default.equal(m.firstResponseMedianMin, 75);
    strict_1.default.equal(m.slaMet, 1);
    strict_1.default.equal(m.slaBreached, 2);
    strict_1.default.equal(m.aiAnswered, 2);
    strict_1.default.equal(m.aiResolutionRate, 0.5);
    strict_1.default.equal(m.csat, 0.5);
    strict_1.default.equal(m.reopenRate, 0.5);
    strict_1.default.equal(m.backlog.under1d, 1);
    strict_1.default.equal(m.backlog.d3to7, 1);
    strict_1.default.equal(m.handovers[0].count, 1);
});
(0, node_test_1.test)('the next ticket goes to the least busy colleague who is in and has room', () => {
    const t = (s) => new Date(s);
    strict_1.default.equal((0, core_1.pickAssignee)([
        { userId: 'a', capacity: 5, away: false, lastAssignedAt: t('2026-10-16T09:00:00Z'), open: 2 },
        { userId: 'b', capacity: 5, away: false, lastAssignedAt: t('2026-10-16T08:00:00Z'), open: 2 },
        { userId: 'c', capacity: 5, away: true, lastAssignedAt: null, open: 0 },
        { userId: 'd', capacity: 1, away: false, lastAssignedAt: null, open: 1 },
    ]), 'b');
    strict_1.default.equal((0, core_1.pickAssignee)([{ userId: 'a', capacity: 1, away: false, lastAssignedAt: null, open: 1 }]), null);
});
// ── Enyo's prompts and parsing; the emails; the wiring (read from source) ──
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const ai_core_1 = require("../lib/support/ai-core");
const support_centre_1 = require("../lib/email-templates/support-centre");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (f) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, f), 'utf8');
(0, node_test_1.test)('Enyo’s triage and answers are parsed safely', () => {
    strict_1.default.deepEqual((0, ai_core_1.firstJson)('Sure! ```json\n{"a": "x}", "b": {"c": 1}}\n``` done'), { a: 'x}', b: { c: 1 } });
    strict_1.default.equal((0, ai_core_1.firstJson)('no json here'), null);
    const t = (0, ai_core_1.parseTriage)('{"topic":"job_status","priority":"HIGH","sentiment":"negative","language":"en","needsRecords":false,"confidence":1.7,"summary":"Ada asks when her car is ready"}');
    strict_1.default.equal(t.topic, 'job_status');
    strict_1.default.equal(t.needsRecords, true, 'record topics always need records');
    strict_1.default.equal(t.confidence, 1);
    strict_1.default.equal((0, ai_core_1.parseTriage)('{"topic":"nonsense"}').topic, 'other');
    const a = (0, ai_core_1.parseAnswer)('{"reply":"We open 8am to 5pm.<untrusted>x</untrusted>","confidence":0.9,"used":["a1","zz"],"needsPerson":false}', ['a1']);
    strict_1.default.deepEqual(a.used, ['a1']);
    strict_1.default.doesNotMatch(a.reply, /untrusted/);
    strict_1.default.equal((0, ai_core_1.parseAnswer)('{"reply":"ok"}', []), null, 'too short to send');
    strict_1.default.equal((0, ai_core_1.hoursSentence)({ 1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'], 4: ['08:00', '17:00'], 5: ['08:00', '17:00'], 6: ['09:00', '13:00'] }), 'Monday–Friday 08:00–17:00; Saturday 09:00–13:00; closed on Sunday and on public holidays');
});
(0, node_test_1.test)('support emails: reference in the subject, reply marker, AI labelled with Solved / Person, everything escaped', () => {
    const common = { companyName: 'KCG Motors', logoUrl: 'https://x/logo.png', queueName: 'Warranty', number: 'SUP-2026-000001', subject: 'Brakes <b>', customerName: 'Ada', responseUrl: 'https://site/support/request/tok' };
    const ack = (0, support_centre_1.renderSupportAcknowledgement)({ ...common, promise: 'by 9:30 am tomorrow', open: false });
    strict_1.default.match(ack.subject, /^\[#SUP-2026-000001\]/);
    strict_1.default.match(ack.html, /Please reply above this line/);
    strict_1.default.match(ack.html, /by 9:30 am tomorrow/);
    strict_1.default.match(ack.html, /Brakes &lt;b&gt;/);
    const ai = (0, support_centre_1.renderSupportReply)({ ...common, body: 'We open at 8.\n\n<script>x</script>', by: 'ai', assistantName: 'Enyo', signature: null, statusLabel: 'Waiting for your reply' });
    strict_1.default.match(ai.html, /written by Enyo, our AI assistant/);
    strict_1.default.match(ai.html, /support\/request\/tok\?a=solved/);
    strict_1.default.match(ai.html, /support\/request\/tok\?a=person/);
    strict_1.default.doesNotMatch(ai.html, /<script>/);
    const human = (0, support_centre_1.renderSupportReply)({ ...common, body: 'Hello', by: 'agent', assistantName: 'Enyo', signature: 'Tunde\nWarranty', statusLabel: 'Resolved' });
    strict_1.default.doesNotMatch(human.html, /AI assistant/);
    strict_1.default.match((0, support_centre_1.renderSupportSatisfaction)(common).html, /tok\?rate=5/);
});
(0, node_test_1.test)('wiring: intake, automations and the customer side keep the rules', () => {
    const intake = read('lib/support/intake.ts');
    strict_1.default.match(intake, /loopGuard\(\{ headers, from: fromAddress, ownAddresses \}\)/);
    strict_1.default.match(intake, /if \(fromAddress !== lower\(ticket\.contactEmail\) && fromAddress !== customerEmail\) ticket = null;/, 'a copied reference never threads into another customer’s ticket');
    strict_1.default.match(intake, /getMailboxLock\(FOLDER, \{ readOnly: true \}\)/, 'support mailboxes are read-only');
    strict_1.default.match(intake, /intakeKey/);
    const auto = read('lib/support/automations.ts');
    strict_1.default.match(auto, /updateMany\(\{ where: \{ id: row\.id, aiPendingAt: row\.aiPendingAt \}, data: \{ aiPendingAt: new Date\(Date\.now\(\) \+ LEASE_MS\) \} \}\)/, 'Enyo leases a ticket before reading it');
    strict_1.default.match(auto, /decision\.action === 'answer' && ai && !ai\.needsPerson && !ai\.unknownContacts\.length/);
    // The answer is claimed (compare-and-set) BEFORE the email is sent.
    strict_1.default.ok(auto.indexOf("where: { id: t.id, status: 'OPEN', firstResponseAt: null }") < auto.indexOf('const sent = await sendFromSupport'), 'claim before send');
    strict_1.default.match(auto, /senderVerified: t\.channel !== 'EMAIL' \|\| t\.authenticatedSender/, 'never an AI reply to a forged sender');
    // The customer never sees internal notes or Enyo's drafts.
    const data = read('../website/lib/customer-portal/data.ts');
    strict_1.default.match(data, /where: \{ visibility: 'PUBLIC', kind: \{ in: \['CUSTOMER', 'AGENT', 'AI'\] \} \}/);
    // The customer's page changes nothing on opening; buttons post.
    const page = read('../website/app/support/request/[token]/page.tsx');
    strict_1.default.doesNotMatch(page, /prisma\.supportTicket\.(update|updateMany)\(/);
    const respond = read('../website/lib/support-response.ts');
    strict_1.default.match(respond, /'use server'/);
    strict_1.default.match(respond, /TOKEN = \/\^\[A-Za-z0-9_-\]\{24,64\}\$\//);
    // Mailbox passwords are bound to the organisation and address.
    strict_1.default.match(read('lib/actions/support-admin.ts'), /encryptSecret\(s\.password, key, secretAad\(supportSecretOwner\(organisationId\), s\.address\)\)/);
    strict_1.default.match(read('lib/support/server.ts'), /userId: supportSecretOwner\(m\.organisationId\)/);
});
const core_2 = require("../lib/support/core");
(0, node_test_1.test)('an AI reply naming a link, phone or email not in our details is never sent by itself', () => {
    const facts = 'Contact: phones 0803 555 0101; email care@kcg.ng; website https://kcg.ng';
    strict_1.default.deepEqual((0, core_2.unknownContacts)('Call us on +234 803 555 0101 or write to care@kcg.ng, or see kcg.ng/support.', facts), []);
    strict_1.default.deepEqual((0, core_2.unknownContacts)('Pay at evil-pay.com or call 0901 234 5678, email x@evil.io', facts).sort(), ['0901 234 5678', 'evil-pay.com', 'x@evil.io'].sort());
    strict_1.default.deepEqual((0, core_2.unknownContacts)('We open at 8.30 am on weekdays.', facts), []);
});
(0, node_test_1.test)('a sender whose address is not proven never gets an AI answer', () => {
    const base = { mode: 'AUTO', triage: triage(), text: 'What time do you open?', threshold: 0.75, answerConfidence: 0.95, hasSources: true, repeatContact: false, autoReplyAllowed: true };
    strict_1.default.equal((0, core_1.aiDecision)({ ...base, senderVerified: true }).action, 'answer');
    const d = (0, core_1.aiDecision)({ ...base, senderVerified: false });
    strict_1.default.equal(d.action, 'draft');
    strict_1.default.ok(d.reasons.includes('unverified_sender'));
});
