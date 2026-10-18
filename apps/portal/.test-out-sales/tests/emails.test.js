"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Every email template, rendered with realistic and with hostile sample data:
 * nothing unescaped, no "undefined"/"null"/"NaN", the organisation in the
 * header, a plain-text part, absolute https links, one shared layout.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const email_fixtures_1 = require("./email-fixtures");
const layout_1 = require("../lib/email-templates/layout");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const TEMPLATES = (0, node_path_1.join)(ROOT, 'lib', 'email-templates');
function rendered(s) {
    const r = s.render();
    return typeof r === 'string' ? { subject: s.subject, html: r } : r;
}
const header = (h) => h.slice(h.indexOf('<!--t:skip-->'), h.indexOf('<!--/t:skip-->'));
const links = (h) => [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
(0, node_test_1.test)('every exported template has a sample', () => {
    const exported = (0, node_fs_1.readdirSync)(TEMPLATES)
        .filter((f) => f.endsWith('.ts') && f !== 'layout.ts')
        .flatMap((f) => [...(0, node_fs_1.readFileSync)((0, node_path_1.join)(TEMPLATES, f), 'utf8').matchAll(/export function (render\w+Email)\(/g)].map((m) => m[1]));
    const covered = new Set((0, email_fixtures_1.emailSamples)().map((s) => s.template));
    const missing = exported.filter((name) => !covered.has(name));
    strict_1.default.deepEqual(missing, [], `templates without a sample: ${missing.join(', ')}`);
    strict_1.default.ok(exported.length >= 80, `found ${exported.length} templates`);
});
(0, node_test_1.test)('realistic data: complete, specific, readable in HTML and plain text', () => {
    for (const s of (0, email_fixtures_1.emailSamples)()) {
        const { subject, html: out } = rendered(s);
        const text = (0, layout_1.htmlToText)(out);
        const where = s.name;
        strict_1.default.match(out, /^<!DOCTYPE html>/, `${where}: full document`);
        strict_1.default.doesNotMatch(text, /\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/, `${where}: placeholder text leaked`);
        strict_1.default.doesNotMatch(out, /\bundefined\b|\bNaN\b|\[object Object\]/, `${where}: placeholder in markup`);
        // The organisation is real text in the header, laid out like the portal wordmark.
        const head = header(out);
        strict_1.default.ok(head.includes('>Kewalram<') && head.includes('>Chanrai Group<'), `${where}: wordmark`);
        strict_1.default.ok(head.includes('alt="Kewalram Chanrai Group logo"'), `${where}: logo alt text`);
        strict_1.default.ok(out.includes('Powered by EJO 100'), `${where}: footer`);
        // A proper plain-text part: the heading, the greeting, no markup.
        strict_1.default.ok(text.length > 120, `${where}: text part`);
        strict_1.default.doesNotMatch(text, /<[a-z][^>]*>/i, `${where}: markup in text part`);
        strict_1.default.match(text, /Hello/, `${where}: greeting`);
        for (const l of links(out))
            strict_1.default.match(l, /^(https:\/\/|mailto:|tel:)/, `${where}: absolute https link (${l})`);
        for (const t of [subject ?? '', text]) {
            strict_1.default.doesNotMatch(t, EMOJI, `${where}: no emoji`);
            strict_1.default.doesNotMatch(t, /!/, `${where}: no exclamation marks`);
            strict_1.default.doesNotMatch(t, /\b1 (days|hours|parts|items|alerts)\b|\b(0|[2-9]) (day|hour|part|item|alert)\b(?!s)/, `${where}: plural`);
        }
        if (subject)
            strict_1.default.ok(subject.length <= 110, `${where}: subject is short`);
        // Customers only ever get links to the customer site, staff to the portal.
        const own = s.audience === 'customer' ? 'https://www.example.com' : 'https://portal.example.com';
        for (const l of links(out).filter((u) => u.startsWith('https://')))
            strict_1.default.ok(l.startsWith(own), `${where}: ${s.audience} link goes to ${l}`);
    }
});
(0, node_test_1.test)('hostile data: everything people type is escaped', () => {
    for (const s of (0, email_fixtures_1.emailSamples)({ hostile: true })) {
        const { html: out } = rendered(s);
        strict_1.default.ok(!out.includes('<script'), `${s.name}: unescaped <script>`);
        strict_1.default.ok(!out.includes('<b>bold</b>'), `${s.name}: unescaped markup`);
        strict_1.default.ok(out.includes('&lt;script&gt;') || out.includes('&lt;b&gt;'), `${s.name}: hostile input shown as text`);
        strict_1.default.doesNotMatch((0, layout_1.htmlToText)(out), /\bundefined\b|\bNaN\b/, s.name);
    }
});
(0, node_test_1.test)('security emails state the expiry and carry no password', () => {
    const byName = new Map((0, email_fixtures_1.emailSamples)().map((s) => [s.name, rendered(s)]));
    for (const name of ['staff-password-reset', 'customer-welcome', 'customer-access-link', 'staff-welcome']) {
        const m = byName.get(name);
        strict_1.default.match(m.html, /expires in <strong[^>]*>1 hour<\/strong>|72 hours/, `${name}: expiry`);
        strict_1.default.doesNotMatch(m.html, /temporary password|your password is/i, `${name}: never a password`);
    }
    strict_1.default.match(byName.get('staff-password-reset').html, /did not ask for this/);
    strict_1.default.match(byName.get('customer-access-link').html, /Any earlier link no longer works/);
});
(0, node_test_1.test)('the website keeps an identical copy of the layout', () => {
    const portal = (0, node_fs_1.readFileSync)((0, node_path_1.join)(TEMPLATES, 'layout.ts'), 'utf8');
    const site = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, '..', 'website', 'lib', 'email-templates', 'layout.ts'), 'utf8');
    strict_1.default.equal(site, portal, 'apps/website/lib/email-templates/layout.ts must match the portal copy');
});
(0, node_test_1.test)('layout: bulletproof button, dark mode, reduced-motion animation, preheader', () => {
    const out = rendered((0, email_fixtures_1.emailSamples)().find((s) => s.name === 'staff-job-card-approved')).html;
    strict_1.default.match(out, /<v:roundrect[^>]+href="https:\/\/portal\.example\.com\/workshop\/job-cards\/clx123"/, 'VML button for Outlook');
    strict_1.default.match(out, /<meta name="color-scheme" content="light dark"/);
    strict_1.default.match(out, /@media \(prefers-color-scheme: dark\)/);
    strict_1.default.match(out, /@media \(prefers-reduced-motion: no-preference\)/);
    strict_1.default.match(out, /class="ejo-preheader"[^>]*>[^<]*approved Job Card/);
    strict_1.default.doesNotMatch(out, /<img[^>]+(width="1"|height="1")/, 'no tracking pixel');
    const text = (0, layout_1.htmlToText)(out);
    strict_1.default.match(text, /Open Job Card:\nhttps:\/\/portal\.example\.com\/workshop\/job-cards\/clx123/);
    strict_1.default.match(text, /Job Card: JC-2026-000123/);
    strict_1.default.doesNotMatch(text, /Kewalram\nChanrai Group/, 'visual header left out of the text part');
});
(0, node_test_1.test)('formatting helpers: naira, Lagos dates, plurals, escaping', () => {
    strict_1.default.equal((0, layout_1.formatNaira)(12345), '₦12,345.00');
    strict_1.default.equal((0, layout_1.formatNaira)('-50.5'), '-₦50.50');
    strict_1.default.equal((0, layout_1.formatNaira)(Number.NaN), '₦0.00');
    // 23:30 UTC is already the next day in Lagos (UTC+1).
    strict_1.default.equal((0, layout_1.formatEmailDate)(new Date('2026-10-12T23:30:00Z')), '13 October 2026');
    strict_1.default.match((0, layout_1.formatEmailDateTime)(new Date('2026-10-12T13:05:00Z')), /^12 October 2026 at 2:05\s?pm$/i);
    strict_1.default.equal((0, layout_1.plural)(1, 'day'), '1 day');
    strict_1.default.equal((0, layout_1.plural)(3, 'day'), '3 days');
    strict_1.default.equal((0, layout_1.plural)(1250, 'km', 'km'), '1,250 km');
    strict_1.default.equal((0, layout_1.vehicleLabel)('Toyota Hilux', 'KJA-219-XY'), 'Toyota Hilux (KJA-219-XY)');
    strict_1.default.equal((0, layout_1.vehicleLabel)('', ''), 'your vehicle');
    strict_1.default.equal((0, layout_1.html) `<p>${'<i>'}</p>`.value, '<p>&lt;i&gt;</p>');
    strict_1.default.equal((0, layout_1.escapeHtml)(`"'&`), '&quot;&#39;&amp;');
    strict_1.default.equal((0, layout_1.details)([['Empty', null], ['Blank', '']]).value, '', 'rows without a value are dropped');
});
