/**
 * Work mailbox — what a person may type when connecting, the compose page's
 * pre-fill, and turning a parsed email into stored text (lib/mail/rules.ts,
 * lib/mail/parse-core.ts). Pure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeHref, isMicrosoftMailbox, parseAddressList, parseComposePrefill, quoteForReply, replySubject, securityFromFlag, validateConnect } from '../lib/mail/rules';
import { cleanBody, flattenAddresses, snippetOf, splitAttachments, threadKeyOf, withAttachments } from '../lib/mail/parse-core';
import { isPrivateAddress as isPrivateAddressForTest } from '../lib/mail/net';

const gmail = { address: 'Ada@Company.com', displayName: 'Ada', imapHost: 'imap.gmail.com', imapPort: '993', imapSecurity: 'tls', smtpHost: 'smtp.gmail.com', smtpPort: '465', smtpSecurity: 'tls', username: '', password: 'abcd efgh ijkl mnop' };

test('connect: clean settings, or one plain message', () => {
  const r = validateConnect(gmail);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.address, 'ada@company.com');
    assert.equal(r.value.username, 'ada@company.com', 'username defaults to the address');
    assert.equal(r.value.imapPort, 993);
  }
  const msg = (o: Record<string, unknown>, opts = {}) => { const x = validateConnect({ ...gmail, ...o }, opts); return x.ok ? null : x.message; };
  assert.match(msg({ address: 'not-an-email' })!, /work email address/);
  assert.match(msg({ imapHost: 'imap gmail com' })!, /incoming \(IMAP\) server/);
  assert.match(msg({ smtpHost: 'http://smtp.gmail.com' })!, /outgoing \(SMTP\) server/);
  assert.match(msg({ imapPort: '22' })!, /993/, 'only mail ports');
  assert.match(msg({ smtpPort: '3306' })!, /465, 587/);
  assert.match(msg({ imapSecurity: 'none' })!, /SSL\/TLS or STARTTLS/, 'no unencrypted connection in production');
  assert.match(msg({ password: '' })!, /password/);
  assert.match(msg({ password: 'x'.repeat(600) })!, /too long/);
  // Test servers (CI GreenMail): any port, no TLS.
  assert.equal(msg({ imapHost: 'localhost', imapPort: '3143', imapSecurity: 'none', smtpHost: 'localhost', smtpPort: '3025', smtpSecurity: 'none' }, { allowInsecure: true }), null);
});

test('Microsoft 365 / Outlook are explained, not attempted', () => {
  assert.equal(isMicrosoftMailbox('ada@outlook.com'), true);
  assert.equal(isMicrosoftMailbox('ada@hotmail.co.uk'), true);
  assert.equal(isMicrosoftMailbox('ada@company.com', 'outlook.office365.com'), true);
  assert.equal(isMicrosoftMailbox('ada@company.com', 'mail.company.com', 'smtp.office365.com'), true);
  assert.equal(isMicrosoftMailbox('ada@company.com', 'imap.gmail.com', 'smtp.gmail.com'), false);
  const r = validateConnect({ ...gmail, address: 'ada@outlook.com' });
  assert.ok(!r.ok && /Sign in with Microsoft/.test(r.message));
});

test('stored security flag → connection', () => {
  assert.equal(securityFromFlag(true, false), 'tls');
  assert.equal(securityFromFlag(false, false), 'starttls', 'never plain in production');
  assert.equal(securityFromFlag(false, true), 'none');
});

test('addresses: valid ones kept (unique, lower-case, at most 20), others reported', () => {
  assert.deepEqual(parseAddressList('A@x.com, Bee <b@y.org>; c@z.ng\nA@X.COM'), { valid: ['a@x.com', 'b@y.org', 'c@z.ng'], invalid: [] });
  assert.deepEqual(parseAddressList('ok@x.com, nope, <evil>'), { valid: ['ok@x.com'], invalid: ['nope', '<evil>'] });
  assert.equal(parseAddressList(Array.from({ length: 30 }, (_, i) => `p${i}@x.com`).join(',')).valid.length, 20);
  assert.deepEqual(parseAddressList(undefined), { valid: [], invalid: [] });
});

test('compose pre-fill: checked, clipped, never sent by itself', () => {
  const p = parseComposePrefill({ to: 'a@x.com, bad, b@y.com', cc: 'nope', subject: 'Hello\r\nBcc: evil@x.com', body: `Hi\r\n${'x'.repeat(30_000)}`, inReplyTo: 'ckmsg123456789' });
  assert.equal(p.to, 'a@x.com, b@y.com');
  assert.equal(p.cc, '');
  assert.equal(p.subject, 'Hello Bcc: evil@x.com', 'no header injection: one line');
  assert.equal(p.body.length, 20_000);
  assert.ok(!p.body.includes('\r'));
  assert.equal(p.inReplyTo, 'ckmsg123456789');
  assert.equal(parseComposePrefill({ inReplyTo: '../../etc' }).inReplyTo, undefined);
  assert.equal(parseComposePrefill({ inReplyTo: 'ckmsg123456789', all: '1' }).replyAll, true);
  assert.equal(parseComposePrefill({ forward: 'ckmsg123456789' }).forwardOf, 'ckmsg123456789');
  const href = composeHref({ to: 'a@x.com', subject: 'Re: JC & you', body: 'Line', inReplyTo: 'ckmsg123456789', replyAll: true });
  assert.equal(href, '/mail/compose?to=a%40x.com&subject=Re%3A+JC+%26+you&body=Line&inReplyTo=ckmsg123456789&all=1');
  assert.deepEqual(parseComposePrefill(Object.fromEntries(new URL(`http://x${href}`).searchParams)), { to: 'a@x.com', cc: '', subject: 'Re: JC & you', body: 'Line', inReplyTo: 'ckmsg123456789', replyAll: true });
});

test('reply subjects and quoting', () => {
  assert.equal(replySubject('Re: RE: Fwd: Estimate', 'reply'), 'Re: Estimate');
  assert.equal(replySubject('Estimate', 'forward'), 'Fwd: Estimate');
  const q = quoteForReply({ fromName: 'Ada', fromAddress: 'ada@x.com', when: 'Thu 15 Oct, 9:30 am', body: 'One\nTwo' });
  assert.equal(q, '\n\nOn Thu 15 Oct, 9:30 am, Ada <ada@x.com> wrote:\n> One\n> Two');
});

test('stored text: plain, clipped, with attachment names that a sender cannot fake', () => {
  assert.equal(cleanBody('a\r\nb\u0000c\u0007\n\n\n\n\nd'), 'a\nbc\n\n\nd');
  const long = cleanBody('x'.repeat(100_010));
  assert.ok(long.startsWith('x'.repeat(100_000)) && /too long to show/.test(long));
  const forged = cleanBody('Hello\nattachments\nvirus.exe1');
  assert.deepEqual(splitAttachments(forged).attachments, [], 'the private marker is removed from incoming text');
  const stored = withAttachments('Body text', [{ name: 'invoice.pdf', size: 120_000 }, { name: 'photo\n.jpg', size: 2_000_000 }]);
  assert.deepEqual(splitAttachments(stored), { body: 'Body text', attachments: [{ name: 'invoice.pdf', size: 120_000 }, { name: 'photo .jpg', size: 2_000_000 }] });
  assert.deepEqual(splitAttachments('No attachments'), { body: 'No attachments', attachments: [] });
  assert.equal(snippetOf('> quoted\nHello   there\n'), 'Hello there');
  assert.equal(snippetOf('y'.repeat(300)).length, 200);
});

test('thread keys: first reference, then reply-to, then own id, then subject', () => {
  assert.equal(threadKeyOf({ messageId: '<c@x>', inReplyTo: '<b@x>', references: ['<a@x>', '<b@x>'] }), '<a@x>');
  assert.equal(threadKeyOf({ messageId: '<c@x>', inReplyTo: '<b@x>', references: '<a@x> <b@x>' }), '<a@x>');
  assert.equal(threadKeyOf({ messageId: '<c@x>', inReplyTo: 'b@x' }), '<b@x>');
  assert.equal(threadKeyOf({ messageId: '<c@x>' }), '<c@x>');
  assert.equal(threadKeyOf({ subject: 'RE: Fwd:  Brake  pads' }), 'subject:brake pads');
  assert.equal(threadKeyOf({ subject: 'Brake pads' }), threadKeyOf({ subject: 'Re: brake pads' }));
});

test('parsed addresses → { address, name }', () => {
  assert.deepEqual(flattenAddresses({ value: [{ address: 'Ada@X.com', name: 'Ada' }, { address: 'b@y.com', name: '' }, { group: [{ address: 'g@z.com' }] }] }), [{ address: 'ada@x.com', name: 'Ada' }, { address: 'b@y.com' }, { address: 'g@z.com' }]);
  assert.deepEqual(flattenAddresses([{ value: [{ address: 'a@x.com' }] }, { value: [{ address: 'not an address' }] }]), [{ address: 'a@x.com' }]);
  assert.deepEqual(flattenAddresses(undefined), []);
});

test('the connection refuses private and internal addresses', () => {
  for (const ip of ['10.0.0.5', '172.16.3.1', '192.168.1.10', '127.0.0.1', '169.254.169.254', '100.64.1.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.1.2.3']) assert.equal(isPrivateAddressForTest(ip), true, ip);
  for (const ip of ['142.250.27.108', '8.8.8.8', '2a00:1450:4009:81f::200e', '172.32.0.1', '192.169.0.1']) assert.equal(isPrivateAddressForTest(ip), false, ip);
});
