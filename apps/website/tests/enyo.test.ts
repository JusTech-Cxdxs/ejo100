/**
 * Enyo on the website — the pure rules: a customer only ever finds their own
 * jobs (another customer's number reads exactly like "not found"), ticket
 * numbers, limits, the visitor cookie, the origin check, hand-over contact
 * details and the safe Markdown used to show answers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkHandoverContact, findOwnJob, isPlainId, isUniqueClashOn, isVisitorKey, lagosYear, newVisitorKey, nextStepFor, nextTicketNumber,
  normaliseJobNumber, NOT_FOUND_MESSAGE, originAllowed, plural, rateVerdict, readLimits, retryOnNumberClash, safeHref, TICKET_PATTERN,
} from '../lib/enyo/rules';
import { inline, parseMarkdown, plainText } from '../lib/enyo/markdown';

test('job numbers are read however they are typed', () => {
  assert.equal(normaliseJobNumber('JC-2026-000412'), 'JC-2026-000412');
  assert.equal(normaliseJobNumber(' jc 2026 412 '), 'JC-2026-000412');
  assert.equal(normaliseJobNumber('sv-2026-12'), 'SV-2026-000012');
  assert.equal(normaliseJobNumber('JC2026000412'), 'JC-2026-000412');
  for (const bad of ['', 'JC-26-1', 'WR-2026-000001', 'JC-2026-0000001', 'DROP TABLE', 12, null, undefined]) assert.equal(normaliseJobNumber(bad), null, String(bad));
});

test('ownership: only the customer\'s own list is ever searched; someone else\'s number is simply not there', () => {
  const mine = [{ number: 'JC-2026-000412', id: 'a' }, { number: 'SV-2026-000031', id: 'b' }];
  assert.equal(findOwnJob(mine, 'jc 2026 412')?.id, 'a');
  assert.equal(findOwnJob(mine, 'SV-2026-31')?.id, 'b');
  // Another customer's real number and a number that exists nowhere give the SAME answer.
  const othersReal = findOwnJob(mine, 'JC-2026-000413');
  const nowhere = findOwnJob(mine, 'JC-2099-999999');
  assert.equal(othersReal, null);
  assert.equal(nowhere, null);
  assert.equal(findOwnJob([], 'JC-2026-000412'), null);
  assert.equal(findOwnJob(mine, { number: 'JC-2026-000412' }), null, 'only text is accepted');
  // The single "not found" wording never hints at another customer.
  assert.doesNotMatch(NOT_FOUND_MESSAGE, /another|someone|other customer|belongs/i);
});

test('the next step reads in the customer\'s words', () => {
  const base = { kind: 'jc' as const, awaitingApproval: false, waitingForCollection: false, balance: null, estimateReady: false };
  assert.match(nextStepFor({ ...base, status: 'AWAITING_CUSTOMER_APPROVAL', awaitingApproval: true }), /minimum deposit/);
  assert.match(nextStepFor({ ...base, status: 'READY_FOR_COLLECTION', waitingForCollection: true, balance: 5000 }), /Settle the balance/);
  assert.match(nextStepFor({ ...base, status: 'READY_FOR_COLLECTION', waitingForCollection: true, balance: 0 }), /collect/);
  assert.match(nextStepFor({ ...base, status: 'CHECKED_IN' }), /estimate/);
  assert.match(nextStepFor({ ...base, status: 'CANCELLED' }), /refund/);
});

test('support ticket numbers: SUP-<Lagos year>-<6 digits>, latest + 1, a new year starts at 1', () => {
  assert.equal(nextTicketNumber(null, 2026), 'SUP-2026-000001');
  assert.equal(nextTicketNumber('SUP-2026-000041', 2026), 'SUP-2026-000042');
  assert.equal(nextTicketNumber('SUP-2025-000999', 2026), 'SUP-2026-000001');
  assert.match(nextTicketNumber('SUP-2026-000009', 2026), TICKET_PATTERN);
  assert.throws(() => nextTicketNumber('SUP-2026-999999', 2026));
  // 23:30 on 31 December UTC is already 1 January in Lagos (UTC+1).
  assert.equal(lagosYear(new Date('2026-12-31T23:30:00Z')), 2027);
  assert.equal(lagosYear(new Date('2026-12-31T22:30:00Z')), 2026);
});

test('two hand-overs at the same instant: the clash on "number" is retried, anything else is not', async () => {
  const clash = Object.assign(new Error('Unique constraint'), { code: 'P2002', meta: { target: ['number'] } });
  assert.equal(isUniqueClashOn(clash, 'number'), true);
  assert.equal(isUniqueClashOn({ code: 'P2002', meta: { target: 'support_tickets_number_key' } }, 'number'), true);
  assert.equal(isUniqueClashOn({ code: 'P2002', meta: { target: ['email'] } }, 'number'), false);
  assert.equal(isUniqueClashOn(new Error('boom'), 'number'), false);
  let calls = 0;
  const got = await retryOnNumberClash('number', async () => { calls += 1; if (calls < 3) throw clash; return 'SUP-2026-000003'; }, 10, async () => undefined);
  assert.equal(got, 'SUP-2026-000003');
  assert.equal(calls, 3);
  let other = 0;
  await assert.rejects(retryOnNumberClash('number', async () => { other += 1; throw new Error('database down'); }, 10, async () => undefined));
  assert.equal(other, 1);
  let always = 0;
  await assert.rejects(retryOnNumberClash('number', async () => { always += 1; throw clash; }, 4, async () => undefined));
  assert.equal(always, 4);
});

test('limits: customers per minute; visitors per minute and per day, by cookie and by address', () => {
  const l = readLimits({});
  assert.deepEqual(l, { customerPerMinute: 12, publicPerMinute: 6, publicPerDay: 60, ipPerMinute: 20, ipPerDay: 200 });
  assert.equal(readLimits({ ENYO_PUBLIC_PER_MINUTE: '3', ENYO_CUSTOMER_PER_MINUTE: 'lots' }).publicPerMinute, 3);
  assert.equal(readLimits({ ENYO_CUSTOMER_PER_MINUTE: 'lots' }).customerPerMinute, 12);
  assert.equal(rateVerdict('CUSTOMER', { perMinute: 11 }, l), null);
  assert.match(rateVerdict('CUSTOMER', { perMinute: 12 }, l)!, /wait a minute/);
  assert.equal(rateVerdict('PUBLIC', { perMinute: 5, perDay: 10, ipPerMinute: 5, ipPerDay: 10 }, l), null);
  assert.match(rateVerdict('PUBLIC', { perMinute: 6, perDay: 10 }, l)!, /wait a minute/);
  assert.match(rateVerdict('PUBLIC', { perMinute: 0, ipPerMinute: 20 }, l)!, /wait a minute/);
  assert.match(rateVerdict('PUBLIC', { perMinute: 0, perDay: 60 }, l)!, /today/);
  assert.match(rateVerdict('PUBLIC', { perMinute: 0, ipPerDay: 200 }, l)!, /today/);
  // Calm words: no codes, no "error", no "429".
  for (const m of [rateVerdict('CUSTOMER', { perMinute: 99 }, l)!, rateVerdict('PUBLIC', { perMinute: 0, perDay: 99 }, l)!]) assert.doesNotMatch(m, /error|429|limit exceeded/i);
});

test('the visitor cookie is random and carries nothing about the person', () => {
  const a = newVisitorKey();
  const b = newVisitorKey();
  assert.notEqual(a, b);
  assert.ok(isVisitorKey(a) && isVisitorKey(b));
  for (const bad of ['', 'v1.short', 'v2.abcdefghijklmnopqrstuvwxyzABCDEF', `v1.${'a'.repeat(31)};`, null, 7]) assert.equal(isVisitorKey(bad), false, String(bad));
  assert.equal(isPlainId('ckx1y2z3a4b5c6'), true);
  assert.equal(isPlainId('../../etc'), false);
  assert.equal(isPlainId("x' OR 1=1"), false);
});

test('origin check: only this website may post to the chat', () => {
  const allowed = ['https://www.example.ng', 'https://www.example.ng'];
  assert.equal(originAllowed('https://www.example.ng', allowed), true);
  assert.equal(originAllowed('https://WWW.example.ng', allowed), true);
  assert.equal(originAllowed('http://www.example.ng', allowed), false, 'the scheme must match');
  assert.equal(originAllowed('https://evil.example', allowed), false);
  assert.equal(originAllowed('https://www.example.ng.evil.example', allowed), false);
  assert.equal(originAllowed(null, allowed), false);
  assert.equal(originAllowed('null', allowed), false);
  assert.equal(originAllowed('http://localhost:3002', ['http://localhost:3002']), true);
});

test('hand-over contact: a name and a phone or email; nothing else is accepted', () => {
  assert.deepEqual(checkHandoverContact({ name: ' Ngozi  Eze ', phone: '0803 123 4567' }), { ok: true, contact: { name: 'Ngozi Eze', phone: '0803 123 4567', email: null } });
  assert.deepEqual(checkHandoverContact({ name: 'Ngozi', email: 'NGOZI@Example.com' }), { ok: true, contact: { name: 'Ngozi', phone: null, email: 'ngozi@example.com' } });
  assert.equal(checkHandoverContact({ name: 'Ngozi' }).ok, false);
  assert.equal(checkHandoverContact({ phone: '08031234567' }).ok, false);
  assert.equal(checkHandoverContact({ name: 'Ngozi', phone: 'call me' }).ok, false);
  assert.equal(checkHandoverContact({ name: 'Ngozi', email: 'not-an-email' }).ok, false);
  assert.equal(checkHandoverContact({ name: { first: 'x' }, phone: '08031234567' }).ok, false);
});

test('answers are shown from safe Markdown: no HTML, links only inside the site or https', () => {
  assert.equal(safeHref('/customer-portal/dashboard/services'), '/customer-portal/dashboard/services');
  assert.equal(safeHref('https://example.ng/x'), 'https://example.ng/x');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>', '//evil.example', 'http://example.ng', 'https://user:pw@example.ng', 'vbscript:x', '/a"onmouseover=x']) assert.equal(safeHref(bad), null, bad);

  const blocks = parseMarkdown('Your **Job Card** [JC-2026-000412](/customer-portal/dashboard/services/jc/abc) is *ready*.\n\n- Pay ₦12,500.00\n- Collect it\n\n1. One\n2. Two');
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0]!.t, 'p');
  assert.deepEqual(blocks[1], { t: 'ul', items: [[{ t: 'text', v: 'Pay ₦12,500.00' }], [{ t: 'text', v: 'Collect it' }]] });
  assert.equal(blocks[2]!.t, 'ol');
  const p = blocks[0]!.t === 'p' ? blocks[0]!.c : [];
  assert.ok(p.some((x) => x.t === 'link' && x.href === '/customer-portal/dashboard/services/jc/abc'));

  // A dangerous link keeps its words and loses the link.
  assert.deepEqual(inline('[click](javascript:alert(1))'), [{ t: 'text', v: 'click' }, { t: 'text', v: ')' }]);
  // HTML is just text.
  const html = parseMarkdown('<img src=x onerror=alert(1)><script>alert(1)</script>');
  assert.equal(plainText(html), '<img src=x onerror=alert(1)><script>alert(1)</script>');
  assert.ok(JSON.stringify(html).indexOf('"t":"link"') === -1);
  // snake_case stays intact; unclosed markers stay as typed.
  assert.equal(plainText(parseMarkdown('use job_status and **bold')), 'use job_status and **bold');
});

test('plurals', () => {
  assert.equal(plural(1, 'vehicle'), '1 vehicle');
  assert.equal(plural(2, 'vehicle'), '2 vehicles');
  assert.equal(plural(0, 'warranty', 'warranties'), '0 warranties');
});
