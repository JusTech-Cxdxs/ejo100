/** The Support centre's rules (lib/support/core.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addBusinessMinutes, aiDecision, autoReplyHeaders, DEFAULT_HOURS, DEFAULT_TARGETS, dueDates, extractEntities, isOpen, lagosParts, loopGuard, measures,
  newText, pickAssignee, priorityFromText, promiseLabel, readHours, readTargets, recipientMailbox, referencedIds, senderAuthenticated, sensitiveReasons,
  slaState, taggedSubject, ticketNumberIn, type Triage,
} from '../lib/support/core';

// Lagos is UTC+1: 08:00 Lagos = 07:00Z.
const L = (iso: string) => new Date(`${iso}+01:00`);

test('business hours: counting skips nights, Sundays and holidays (Lagos time)', () => {
  // Friday 16:30 + 60 business minutes → Saturday 09:30 (Sat opens 09:00).
  assert.equal(addBusinessMinutes(L('2026-10-16T16:30:00'), 60, DEFAULT_HOURS).toISOString(), L('2026-10-17T09:30:00').toISOString());
  // Saturday 12:30 + 60 → Monday 08:30 (Sat closes 13:00; Sunday closed).
  assert.equal(addBusinessMinutes(L('2026-10-17T12:30:00'), 60, DEFAULT_HOURS).toISOString(), L('2026-10-19T08:30:00').toISOString());
  // Before opening counts from opening.
  assert.equal(addBusinessMinutes(L('2026-10-19T06:00:00'), 30, DEFAULT_HOURS).toISOString(), L('2026-10-19T08:30:00').toISOString());
  // A holiday Monday is skipped.
  assert.equal(addBusinessMinutes(L('2026-10-17T12:30:00'), 60, DEFAULT_HOURS, ['2026-10-19']).toISOString(), L('2026-10-20T08:30:00').toISOString());
  assert.equal(isOpen(L('2026-10-18T10:00:00'), DEFAULT_HOURS), false);
  assert.equal(isOpen(L('2026-10-19T10:00:00'), DEFAULT_HOURS), true);
  assert.equal(lagosParts(L('2026-10-19T00:30:00')).weekday, 1);
});

test('targets: urgent counts every hour; others business hours; stored targets are checked', () => {
  const opened = L('2026-10-16T20:00:00');
  assert.equal(dueDates(opened, 'URGENT', DEFAULT_TARGETS, DEFAULT_HOURS).first.toISOString(), L('2026-10-16T20:30:00').toISOString());
  assert.equal(dueDates(opened, 'HIGH', DEFAULT_TARGETS, DEFAULT_HOURS).first.toISOString(), L('2026-10-17T11:00:00').toISOString());
  const t = readTargets({ HIGH: { first: 90, resolve: 'x' }, LOW: { first: 1 } });
  assert.equal(t.HIGH.first, 90);
  assert.equal(t.HIGH.resolve, DEFAULT_TARGETS.HIGH.resolve);
  assert.equal(t.LOW.first, DEFAULT_TARGETS.LOW.first);
  assert.deepEqual(readHours({ 1: ['09:00', '08:00'] }), DEFAULT_HOURS);
  assert.match(promiseLabel(L('2026-10-17T09:30:00'), L('2026-10-16T16:30:00')), /^by 9:30 am tomorrow$/);
});

test('SLA state', () => {
  const now = L('2026-10-16T10:00:00');
  assert.equal(slaState({ dueFirstResponseAt: L('2026-10-16T09:00:00'), firstResponseAt: null, status: 'OPEN' }, now), 'breached');
  assert.equal(slaState({ dueFirstResponseAt: L('2026-10-16T10:30:00'), firstResponseAt: null, status: 'OPEN' }, now), 'due_soon');
  assert.equal(slaState({ dueFirstResponseAt: L('2026-10-16T09:00:00'), firstResponseAt: L('2026-10-16T08:59:00'), status: 'OPEN' }, now), 'met');
  assert.equal(slaState({ dueFirstResponseAt: null, firstResponseAt: null, status: 'OPEN' }, now), 'none');
});

test('mail-loop protection: robots, lists, bounces and our own mail never get an automatic reply', () => {
  const own = ['support@kcg.ng'];
  assert.deepEqual(loopGuard({ headers: {}, from: 'ada@gmail.com', ownAddresses: own }), { autoReply: true, keep: true, reason: null });
  assert.equal(loopGuard({ headers: { 'auto-submitted': 'auto-replied' }, from: 'ada@gmail.com', ownAddresses: own }).autoReply, false);
  assert.equal(loopGuard({ headers: { 'auto-submitted': 'no' }, from: 'ada@gmail.com', ownAddresses: own }).autoReply, true);
  assert.equal(loopGuard({ headers: { precedence: 'bulk' }, from: 'news@shop.com', ownAddresses: own }).autoReply, false);
  assert.equal(loopGuard({ headers: { 'list-id': '<x.list>' }, from: 'a@b.com', ownAddresses: own }).autoReply, false);
  assert.equal(loopGuard({ headers: {}, from: 'no-reply@bank.com', ownAddresses: own }).autoReply, false);
  assert.equal(loopGuard({ headers: {}, from: 'MAILER-DAEMON@mx.google.com', ownAddresses: own }).keep, false);
  assert.equal(loopGuard({ headers: {}, from: 'Support@KCG.ng', ownAddresses: own }).keep, false);
  assert.equal(autoReplyHeaders('<a@b>')['Auto-Submitted'], 'auto-replied');
  assert.equal(senderAuthenticated({ 'authentication-results': 'mx.google.com; dkim=pass; spf=pass; dmarc=pass' }), true);
  assert.equal(senderAuthenticated({ 'authentication-results': 'spf=softfail; dkim=none; dmarc=fail' }), false);
});

test('threading: the ticket tag and Message-ID references', () => {
  assert.equal(taggedSubject('SUP-2026-000123', 'Re: [#SUP-2026-000123] Brakes'), '[#SUP-2026-000123] Re: Brakes');
  assert.equal(ticketNumberIn('Re: [#SUP-2026-000123] Brakes'), 'SUP-2026-000123');
  assert.equal(ticketNumberIn('Brakes', 'Ref SUP-2026-000007 thanks'), 'SUP-2026-000007');
  assert.equal(ticketNumberIn('Hello'), null);
  assert.deepEqual(referencedIds('<b@x>', '<a@x> <b@x>'), ['<b@x>', '<a@x>']);
  const route = recipientMailbox({ 'delivered-to': 'warranty+abc@kcg.ng' }, ['someone@else.com'], [], [{ id: 'w', address: 'warranty@kcg.ng' }, { id: 's', address: 'support@kcg.ng' }]);
  assert.equal(route, 'w');
  assert.equal(recipientMailbox({}, ['Support@kcg.ng'], [], [{ id: 's', address: 'support@kcg.ng' }]), 's');
});

test('only the new words of a reply are kept', () => {
  assert.equal(newText('Thanks, that worked.\n\nOn Mon, 12 Oct 2026 at 10:00, KCG Support <support@kcg.ng> wrote:\n> Please try…'), 'Thanks, that worked.');
  assert.equal(newText('Yes please\n\n-----Original Message-----\nFrom: x'), 'Yes please');
  assert.equal(newText('Ok\nFrom: KCG <s@k.ng>\nSent: Monday\nTo: me'), 'Ok');
  assert.equal(newText('Fine\n\nSent from my iPhone'), 'Fine');
  assert.equal(newText('Line one\n> quoted\nLine two'), 'Line one\n> quoted\nLine two');
});

test('vehicle-aware details: plates, VINs and record numbers', () => {
  const e = extractEntities('My Hilux LND 452 AB (old plate LA123-ABC, VIN JTFST22P300123456) — job JC-2026-000412.');
  assert.ok(e.plates.includes('LND-452AB'));
  assert.ok(e.plates.includes('LA123-ABC'));
  assert.deepEqual(e.vins, ['JTFST22P300123456']);
  assert.deepEqual(e.records, ['JC-2026-000412']);
});

const triage = (p: Partial<Triage> = {}): Triage => ({ topic: 'opening_hours', priority: 'NORMAL', sentiment: 'neutral', language: 'en', needsRecords: false, confidence: 0.9, summary: '', ...p });

test('Enyo answers by itself only for calm, general questions it is sure about, in AUTO queues', () => {
  const base = { mode: 'AUTO' as const, triage: triage(), text: 'What time do you open on Saturday?', threshold: 0.75, answerConfidence: 0.9, hasSources: true, repeatContact: false, autoReplyAllowed: true };
  assert.deepEqual(aiDecision(base), { action: 'answer', reasons: [] });
  assert.equal(aiDecision({ ...base, mode: 'SUGGEST' }).action, 'draft');
  assert.equal(aiDecision({ ...base, mode: 'OFF' }).action, 'none');
  assert.ok(aiDecision({ ...base, answerConfidence: 0.5 }).reasons.includes('low_confidence'));
  assert.ok(aiDecision({ ...base, triage: triage({ needsRecords: true }) }).reasons.includes('needs_records'));
  assert.ok(aiDecision({ ...base, text: 'I want a refund now' }).reasons.includes('money'));
  assert.ok(aiDecision({ ...base, text: 'Please let me speak to a person' }).reasons.includes('customer_asked'));
  assert.ok(aiDecision({ ...base, hasSources: false }).reasons.includes('no_knowledge'));
  assert.ok(aiDecision({ ...base, repeatContact: true }).reasons.includes('repeat_contact'));
  assert.equal(aiDecision({ ...base, autoReplyAllowed: false }).action, 'none');
  assert.equal(priorityFromText('The brake failure nearly caused an accident'), 'URGENT');
  assert.equal(priorityFromText('I am disappointed with the service'), 'HIGH');
  assert.equal(priorityFromText('Can I get the cost breakdown?'), 'NORMAL');
  assert.deepEqual(sensitiveReasons('Please press the button'), []);
});

test('control-centre measures', () => {
  const now = L('2026-10-16T12:00:00');
  const row = (o: Record<string, unknown>) => ({ createdAt: L('2026-10-16T08:00:00'), firstResponseAt: null, resolvedAt: null, dueFirstResponseAt: null, status: 'OPEN', channel: 'EMAIL', queueId: null, priority: 'NORMAL', aiOutcome: null, handoverReason: null, reopenCount: 0, csatScore: null, assignedToId: null, topic: null, ...o });
  const m = measures([
    row({ firstResponseAt: L('2026-10-16T08:30:00'), dueFirstResponseAt: L('2026-10-16T09:00:00'), status: 'RESOLVED', resolvedAt: L('2026-10-16T10:00:00'), aiOutcome: 'CONFIRMED', csatScore: 5 }),
    row({ firstResponseAt: L('2026-10-16T10:00:00'), dueFirstResponseAt: L('2026-10-16T09:00:00'), status: 'RESOLVED', resolvedAt: L('2026-10-16T11:00:00'), reopenCount: 1, csatScore: 2, handoverReason: 'money,complaint' }),
    row({ dueFirstResponseAt: L('2026-10-16T09:00:00'), aiOutcome: 'ESCALATED', handoverReason: 'customer_asked' }),
    row({ createdAt: L('2026-10-10T08:00:00'), status: 'WAITING_ON_CUSTOMER' }),
  ], now);
  assert.equal(m.total, 4);
  assert.equal(m.firstResponseMedianMin, 75);
  assert.equal(m.slaMet, 1);
  assert.equal(m.slaBreached, 2);
  assert.equal(m.aiAnswered, 2);
  assert.equal(m.aiResolutionRate, 0.5);
  assert.equal(m.csat, 0.5);
  assert.equal(m.reopenRate, 0.5);
  assert.equal(m.backlog.under1d, 1);
  assert.equal(m.backlog.d3to7, 1);
  assert.equal(m.handovers[0]!.count, 1);
});

test('the next ticket goes to the least busy colleague who is in and has room', () => {
  const t = (s: string) => new Date(s);
  assert.equal(pickAssignee([
    { userId: 'a', capacity: 5, away: false, lastAssignedAt: t('2026-10-16T09:00:00Z'), open: 2 },
    { userId: 'b', capacity: 5, away: false, lastAssignedAt: t('2026-10-16T08:00:00Z'), open: 2 },
    { userId: 'c', capacity: 5, away: true, lastAssignedAt: null, open: 0 },
    { userId: 'd', capacity: 1, away: false, lastAssignedAt: null, open: 1 },
  ]), 'b');
  assert.equal(pickAssignee([{ userId: 'a', capacity: 1, away: false, lastAssignedAt: null, open: 1 }]), null);
});

// ── Enyo's prompts and parsing; the emails; the wiring (read from source) ──
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { firstJson, hoursSentence, parseAnswer, parseTriage } from '../lib/support/ai-core';
import { renderSupportAcknowledgement, renderSupportReply, renderSupportSatisfaction } from '../lib/email-templates/support-centre';

const ROOT = join(__dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');

test('Enyo’s triage and answers are parsed safely', () => {
  assert.deepEqual(firstJson('Sure! ```json\n{"a": "x}", "b": {"c": 1}}\n``` done'), { a: 'x}', b: { c: 1 } });
  assert.equal(firstJson('no json here'), null);
  const t = parseTriage('{"topic":"job_status","priority":"HIGH","sentiment":"negative","language":"en","needsRecords":false,"confidence":1.7,"summary":"Ada asks when her car is ready"}')!;
  assert.equal(t.topic, 'job_status');
  assert.equal(t.needsRecords, true, 'record topics always need records');
  assert.equal(t.confidence, 1);
  assert.equal(parseTriage('{"topic":"nonsense"}')!.topic, 'other');
  const a = parseAnswer('{"reply":"We open 8am to 5pm.<untrusted>x</untrusted>","confidence":0.9,"used":["a1","zz"],"needsPerson":false}', ['a1'])!;
  assert.deepEqual(a.used, ['a1']);
  assert.doesNotMatch(a.reply, /untrusted/);
  assert.equal(parseAnswer('{"reply":"ok"}', []), null, 'too short to send');
  assert.equal(hoursSentence({ 1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'], 4: ['08:00', '17:00'], 5: ['08:00', '17:00'], 6: ['09:00', '13:00'] }), 'Monday–Friday 08:00–17:00; Saturday 09:00–13:00; closed on Sunday and on public holidays');
});

test('support emails: reference in the subject, reply marker, AI labelled with Solved / Person, everything escaped', () => {
  const common = { companyName: 'KCG Motors', logoUrl: 'https://x/logo.png', queueName: 'Warranty', number: 'SUP-2026-000001', subject: 'Brakes <b>', customerName: 'Ada', responseUrl: 'https://site/support/request/tok' };
  const ack = renderSupportAcknowledgement({ ...common, promise: 'by 9:30 am tomorrow', open: false });
  assert.match(ack.subject, /^\[#SUP-2026-000001\]/);
  assert.match(ack.html, /Please reply above this line/);
  assert.match(ack.html, /by 9:30 am tomorrow/);
  assert.match(ack.html, /Brakes &lt;b&gt;/);
  const ai = renderSupportReply({ ...common, body: 'We open at 8.\n\n<script>x</script>', by: 'ai', assistantName: 'Enyo', signature: null, statusLabel: 'Waiting for your reply' });
  assert.match(ai.html, /written by Enyo, our AI assistant/);
  assert.match(ai.html, /support\/request\/tok\?a=solved/);
  assert.match(ai.html, /support\/request\/tok\?a=person/);
  assert.doesNotMatch(ai.html, /<script>/);
  const human = renderSupportReply({ ...common, body: 'Hello', by: 'agent', assistantName: 'Enyo', signature: 'Tunde\nWarranty', statusLabel: 'Resolved' });
  assert.doesNotMatch(human.html, /AI assistant/);
  assert.match(renderSupportSatisfaction(common).html, /tok\?rate=5/);
});

test('wiring: intake, automations and the customer side keep the rules', () => {
  const intake = read('lib/support/intake.ts');
  assert.match(intake, /loopGuard\(\{ headers, from: fromAddress, ownAddresses \}\)/);
  assert.match(intake, /if \(fromAddress !== lower\(ticket\.contactEmail\) && fromAddress !== customerEmail\) ticket = null;/, 'a copied reference never threads into another customer’s ticket');
  assert.match(intake, /getMailboxLock\(FOLDER, \{ readOnly: true \}\)/, 'support mailboxes are read-only');
  assert.match(intake, /intakeKey/);
  const auto = read('lib/support/automations.ts');
  assert.match(auto, /updateMany\(\{ where: \{ id: row\.id, aiPendingAt: row\.aiPendingAt \}, data: \{ aiPendingAt: new Date\(Date\.now\(\) \+ LEASE_MS\) \} \}\)/, 'Enyo leases a ticket before reading it');
  assert.match(auto, /decision\.action === 'answer' && ai && !ai\.needsPerson && !ai\.unknownContacts\.length/);
  // The answer is claimed (compare-and-set) BEFORE the email is sent.
  assert.ok(auto.indexOf("where: { id: t.id, status: 'OPEN', firstResponseAt: null }") < auto.indexOf('const sent = await sendFromSupport'), 'claim before send');
  assert.match(auto, /senderVerified: t\.channel !== 'EMAIL' \|\| t\.authenticatedSender/, 'never an AI reply to a forged sender');
  // The customer never sees internal notes or Enyo's drafts.
  const data = read('../website/lib/customer-portal/data.ts');
  assert.match(data, /where: \{ visibility: 'PUBLIC', kind: \{ in: \['CUSTOMER', 'AGENT', 'AI'\] \} \}/);
  // The customer's page changes nothing on opening; buttons post.
  const page = read('../website/app/support/request/[token]/page.tsx');
  assert.doesNotMatch(page, /prisma\.supportTicket\.(update|updateMany)\(/);
  const respond = read('../website/lib/support-response.ts');
  assert.match(respond, /'use server'/);
  assert.match(respond, /TOKEN = \/\^\[A-Za-z0-9_-\]\{24,64\}\$\//);
  // Mailbox passwords are bound to the organisation and address.
  assert.match(read('lib/actions/support-admin.ts'), /encryptSecret\(s\.password, key, secretAad\(supportSecretOwner\(organisationId\), s\.address\)\)/);
  assert.match(read('lib/support/server.ts'), /userId: supportSecretOwner\(m\.organisationId\)/);
});

import { unknownContacts } from '../lib/support/core';
test('an AI reply naming a link, phone or email not in our details is never sent by itself', () => {
  const facts = 'Contact: phones 0803 555 0101; email care@kcg.ng; website https://kcg.ng';
  assert.deepEqual(unknownContacts('Call us on +234 803 555 0101 or write to care@kcg.ng, or see kcg.ng/support.', facts), []);
  assert.deepEqual(unknownContacts('Pay at evil-pay.com or call 0901 234 5678, email x@evil.io', facts).sort(), ['0901 234 5678', 'evil-pay.com', 'x@evil.io'].sort());
  assert.deepEqual(unknownContacts('We open at 8.30 am on weekdays.', facts), []);
});

test('a sender whose address is not proven never gets an AI answer', () => {
  const base = { mode: 'AUTO' as const, triage: triage(), text: 'What time do you open?', threshold: 0.75, answerConfidence: 0.95, hasSources: true, repeatContact: false, autoReplyAllowed: true };
  assert.equal(aiDecision({ ...base, senderVerified: true }).action, 'answer');
  const d = aiDecision({ ...base, senderVerified: false });
  assert.equal(d.action, 'draft');
  assert.ok(d.reasons.includes('unverified_sender'));
});
