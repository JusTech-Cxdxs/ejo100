"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Work mailbox — what a person may type when connecting, the compose page's
 * pre-fill, and turning a parsed email into stored text (lib/mail/rules.ts,
 * lib/mail/parse-core.ts). Pure.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const rules_1 = require("../lib/mail/rules");
const parse_core_1 = require("../lib/mail/parse-core");
const net_1 = require("../lib/mail/net");
const gmail = { address: 'Ada@Company.com', displayName: 'Ada', imapHost: 'imap.gmail.com', imapPort: '993', imapSecurity: 'tls', smtpHost: 'smtp.gmail.com', smtpPort: '465', smtpSecurity: 'tls', username: '', password: 'abcd efgh ijkl mnop' };
(0, node_test_1.test)('connect: clean settings, or one plain message', () => {
    const r = (0, rules_1.validateConnect)(gmail);
    strict_1.default.ok(r.ok);
    if (r.ok) {
        strict_1.default.equal(r.value.address, 'ada@company.com');
        strict_1.default.equal(r.value.username, 'ada@company.com', 'username defaults to the address');
        strict_1.default.equal(r.value.imapPort, 993);
    }
    const msg = (o, opts = {}) => { const x = (0, rules_1.validateConnect)({ ...gmail, ...o }, opts); return x.ok ? null : x.message; };
    strict_1.default.match(msg({ address: 'not-an-email' }), /work email address/);
    strict_1.default.match(msg({ imapHost: 'imap gmail com' }), /incoming \(IMAP\) server/);
    strict_1.default.match(msg({ smtpHost: 'http://smtp.gmail.com' }), /outgoing \(SMTP\) server/);
    strict_1.default.match(msg({ imapPort: '22' }), /993/, 'only mail ports');
    strict_1.default.match(msg({ smtpPort: '3306' }), /465, 587/);
    strict_1.default.match(msg({ imapSecurity: 'none' }), /SSL\/TLS or STARTTLS/, 'no unencrypted connection in production');
    strict_1.default.match(msg({ password: '' }), /password/);
    strict_1.default.match(msg({ password: 'x'.repeat(600) }), /too long/);
    // Test servers (CI GreenMail): any port, no TLS.
    strict_1.default.equal(msg({ imapHost: 'localhost', imapPort: '3143', imapSecurity: 'none', smtpHost: 'localhost', smtpPort: '3025', smtpSecurity: 'none' }, { allowInsecure: true }), null);
});
(0, node_test_1.test)('Microsoft 365 / Outlook are explained, not attempted', () => {
    strict_1.default.equal((0, rules_1.isMicrosoftMailbox)('ada@outlook.com'), true);
    strict_1.default.equal((0, rules_1.isMicrosoftMailbox)('ada@hotmail.co.uk'), true);
    strict_1.default.equal((0, rules_1.isMicrosoftMailbox)('ada@company.com', 'outlook.office365.com'), true);
    strict_1.default.equal((0, rules_1.isMicrosoftMailbox)('ada@company.com', 'mail.company.com', 'smtp.office365.com'), true);
    strict_1.default.equal((0, rules_1.isMicrosoftMailbox)('ada@company.com', 'imap.gmail.com', 'smtp.gmail.com'), false);
    const r = (0, rules_1.validateConnect)({ ...gmail, address: 'ada@outlook.com' });
    strict_1.default.ok(!r.ok && /Sign in with Microsoft/.test(r.message));
});
(0, node_test_1.test)('stored security flag → connection', () => {
    strict_1.default.equal((0, rules_1.securityFromFlag)(true, false), 'tls');
    strict_1.default.equal((0, rules_1.securityFromFlag)(false, false), 'starttls', 'never plain in production');
    strict_1.default.equal((0, rules_1.securityFromFlag)(false, true), 'none');
});
(0, node_test_1.test)('addresses: valid ones kept (unique, lower-case, at most 20), others reported', () => {
    strict_1.default.deepEqual((0, rules_1.parseAddressList)('A@x.com, Bee <b@y.org>; c@z.ng\nA@X.COM'), { valid: ['a@x.com', 'b@y.org', 'c@z.ng'], invalid: [] });
    strict_1.default.deepEqual((0, rules_1.parseAddressList)('ok@x.com, nope, <evil>'), { valid: ['ok@x.com'], invalid: ['nope', '<evil>'] });
    strict_1.default.equal((0, rules_1.parseAddressList)(Array.from({ length: 30 }, (_, i) => `p${i}@x.com`).join(',')).valid.length, 20);
    strict_1.default.deepEqual((0, rules_1.parseAddressList)(undefined), { valid: [], invalid: [] });
});
(0, node_test_1.test)('compose pre-fill: checked, clipped, never sent by itself', () => {
    const p = (0, rules_1.parseComposePrefill)({ to: 'a@x.com, bad, b@y.com', cc: 'nope', subject: 'Hello\r\nBcc: evil@x.com', body: `Hi\r\n${'x'.repeat(30_000)}`, inReplyTo: 'ckmsg123456789' });
    strict_1.default.equal(p.to, 'a@x.com, b@y.com');
    strict_1.default.equal(p.cc, '');
    strict_1.default.equal(p.subject, 'Hello Bcc: evil@x.com', 'no header injection: one line');
    strict_1.default.equal(p.body.length, 20_000);
    strict_1.default.ok(!p.body.includes('\r'));
    strict_1.default.equal(p.inReplyTo, 'ckmsg123456789');
    strict_1.default.equal((0, rules_1.parseComposePrefill)({ inReplyTo: '../../etc' }).inReplyTo, undefined);
    strict_1.default.equal((0, rules_1.parseComposePrefill)({ inReplyTo: 'ckmsg123456789', all: '1' }).replyAll, true);
    strict_1.default.equal((0, rules_1.parseComposePrefill)({ forward: 'ckmsg123456789' }).forwardOf, 'ckmsg123456789');
    const href = (0, rules_1.composeHref)({ to: 'a@x.com', subject: 'Re: JC & you', body: 'Line', inReplyTo: 'ckmsg123456789', replyAll: true });
    strict_1.default.equal(href, '/mail/compose?to=a%40x.com&subject=Re%3A+JC+%26+you&body=Line&inReplyTo=ckmsg123456789&all=1');
    strict_1.default.deepEqual((0, rules_1.parseComposePrefill)(Object.fromEntries(new URL(`http://x${href}`).searchParams)), { to: 'a@x.com', cc: '', subject: 'Re: JC & you', body: 'Line', inReplyTo: 'ckmsg123456789', replyAll: true });
});
(0, node_test_1.test)('reply subjects and quoting', () => {
    strict_1.default.equal((0, rules_1.replySubject)('Re: RE: Fwd: Estimate', 'reply'), 'Re: Estimate');
    strict_1.default.equal((0, rules_1.replySubject)('Estimate', 'forward'), 'Fwd: Estimate');
    const q = (0, rules_1.quoteForReply)({ fromName: 'Ada', fromAddress: 'ada@x.com', when: 'Thu 15 Oct, 9:30 am', body: 'One\nTwo' });
    strict_1.default.equal(q, '\n\nOn Thu 15 Oct, 9:30 am, Ada <ada@x.com> wrote:\n> One\n> Two');
});
(0, node_test_1.test)('stored text: plain, clipped, with attachment names that a sender cannot fake', () => {
    strict_1.default.equal((0, parse_core_1.cleanBody)('a\r\nb\u0000c\u0007\n\n\n\n\nd'), 'a\nbc\n\n\nd');
    const long = (0, parse_core_1.cleanBody)('x'.repeat(100_010));
    strict_1.default.ok(long.startsWith('x'.repeat(100_000)) && /too long to show/.test(long));
    const forged = (0, parse_core_1.cleanBody)('Hello\nattachments\nvirus.exe1');
    strict_1.default.deepEqual((0, parse_core_1.splitAttachments)(forged).attachments, [], 'the private marker is removed from incoming text');
    const stored = (0, parse_core_1.withAttachments)('Body text', [{ name: 'invoice.pdf', size: 120_000 }, { name: 'photo\n.jpg', size: 2_000_000 }]);
    strict_1.default.deepEqual((0, parse_core_1.splitAttachments)(stored), { body: 'Body text', attachments: [{ name: 'invoice.pdf', size: 120_000 }, { name: 'photo .jpg', size: 2_000_000 }] });
    strict_1.default.deepEqual((0, parse_core_1.splitAttachments)('No attachments'), { body: 'No attachments', attachments: [] });
    strict_1.default.equal((0, parse_core_1.snippetOf)('> quoted\nHello   there\n'), 'Hello there');
    strict_1.default.equal((0, parse_core_1.snippetOf)('y'.repeat(300)).length, 200);
});
(0, node_test_1.test)('thread keys: first reference, then reply-to, then own id, then subject', () => {
    strict_1.default.equal((0, parse_core_1.threadKeyOf)({ messageId: '<c@x>', inReplyTo: '<b@x>', references: ['<a@x>', '<b@x>'] }), '<a@x>');
    strict_1.default.equal((0, parse_core_1.threadKeyOf)({ messageId: '<c@x>', inReplyTo: '<b@x>', references: '<a@x> <b@x>' }), '<a@x>');
    strict_1.default.equal((0, parse_core_1.threadKeyOf)({ messageId: '<c@x>', inReplyTo: 'b@x' }), '<b@x>');
    strict_1.default.equal((0, parse_core_1.threadKeyOf)({ messageId: '<c@x>' }), '<c@x>');
    strict_1.default.equal((0, parse_core_1.threadKeyOf)({ subject: 'RE: Fwd:  Brake  pads' }), 'subject:brake pads');
    strict_1.default.equal((0, parse_core_1.threadKeyOf)({ subject: 'Brake pads' }), (0, parse_core_1.threadKeyOf)({ subject: 'Re: brake pads' }));
});
(0, node_test_1.test)('parsed addresses → { address, name }', () => {
    strict_1.default.deepEqual((0, parse_core_1.flattenAddresses)({ value: [{ address: 'Ada@X.com', name: 'Ada' }, { address: 'b@y.com', name: '' }, { group: [{ address: 'g@z.com' }] }] }), [{ address: 'ada@x.com', name: 'Ada' }, { address: 'b@y.com' }, { address: 'g@z.com' }]);
    strict_1.default.deepEqual((0, parse_core_1.flattenAddresses)([{ value: [{ address: 'a@x.com' }] }, { value: [{ address: 'not an address' }] }]), [{ address: 'a@x.com' }]);
    strict_1.default.deepEqual((0, parse_core_1.flattenAddresses)(undefined), []);
});
(0, node_test_1.test)('the connection refuses private and internal addresses', () => {
    for (const ip of ['10.0.0.5', '172.16.3.1', '192.168.1.10', '127.0.0.1', '169.254.169.254', '100.64.1.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.1.2.3'])
        strict_1.default.equal((0, net_1.isPrivateAddress)(ip), true, ip);
    for (const ip of ['142.250.27.108', '8.8.8.8', '2a00:1450:4009:81f::200e', '172.32.0.1', '192.169.0.1'])
        strict_1.default.equal((0, net_1.isPrivateAddress)(ip), false, ip);
});
