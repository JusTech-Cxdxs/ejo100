"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Mail sent from the portal goes out in the organisation's letterhead (lib/email-templates/personal-mail.ts). */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const personal_mail_1 = require("../lib/email-templates/personal-mail");
const base = {
    subject: 'Quotation for <b>fleet</b> service',
    companyName: 'Kewalram Chanrai Group',
    logoUrl: 'https://portal.example.com/images/logo/email-logo.png',
    sender: { name: 'Ada <Okafor>', department: 'Workshop', branch: 'Isolo Branch', phone: '0803 123 4567', email: 'ada@kcg.example' },
    branchContact: { address: '12 Isolo Road, Lagos', phones: ['0800 000 0000'], email: 'isolo@kcg.example' },
};
(0, node_test_1.test)('the letterhead carries the organisation, the sender and the label; what was typed is escaped', () => {
    const out = (0, personal_mail_1.renderPersonalMail)({ ...base, style: 'urgent', body: 'Hello <script>alert(1)</script>,\n\nPlease see https://kcg.example/q?id=1 and write to fleet@kcg.example.\nThanks' });
    strict_1.default.doesNotMatch(out, /<script>alert/);
    strict_1.default.match(out, /&lt;script&gt;/);
    strict_1.default.match(out, /Kewalram/);
    strict_1.default.match(out, /Urgent/);
    strict_1.default.match(out, /Isolo Branch/);
    strict_1.default.match(out, /Ada &lt;Okafor&gt;/);
    strict_1.default.match(out, /href="https:\/\/kcg\.example\/q\?id=1"/);
    strict_1.default.match(out, /href="mailto:fleet@kcg\.example"/);
    strict_1.default.match(out, /Quotation for &lt;b&gt;fleet&lt;\/b&gt; service/);
    strict_1.default.match(out, /0803 123 4567/);
    for (const style of ['standard', 'action', 'info'])
        strict_1.default.match((0, personal_mail_1.renderPersonalMail)({ ...base, style, body: 'Hi' }), /<html/i);
});
(0, node_test_1.test)('a reply keeps the quoted original, set apart under the signature', () => {
    const body = 'Thanks, confirmed.\n\nOn 12 October 2026 at 2:05 pm, Tunde <t@x.example> wrote:\n> Can you confirm?\n> Regards';
    const { own, quoted } = (0, personal_mail_1.splitQuoted)(body);
    strict_1.default.equal(own, 'Thanks, confirmed.');
    strict_1.default.match(quoted, /^On 12 October/);
    const out = (0, personal_mail_1.renderPersonalMail)({ ...base, style: 'standard', body });
    strict_1.default.ok(out.indexOf('Thanks, confirmed.') < out.indexOf('Can you confirm?'));
    strict_1.default.ok(out.indexOf('ada@kcg.example') < out.indexOf('Can you confirm?'));
    strict_1.default.deepEqual((0, personal_mail_1.splitQuoted)('No quote here.'), { own: 'No quote here.', quoted: '' });
    strict_1.default.match((0, personal_mail_1.splitQuoted)('Fyi\n\n---------- Forwarded message ----------\nFrom: x').quoted, /^-{10} Forwarded/);
});
