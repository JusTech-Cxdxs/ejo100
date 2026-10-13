/**
 * Every email template, rendered with realistic and with hostile sample data:
 * nothing unescaped, no "undefined"/"null"/"NaN", the organisation in the
 * header, a plain-text part, absolute https links, one shared layout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { emailSamples, type EmailSample } from './email-fixtures';
import { htmlToText, formatNaira, formatEmailDate, formatEmailDateTime, plural, html, escapeHtml, details, vehicleLabel } from '../lib/email-templates/layout';

const ROOT = join(__dirname, '..', '..');
const TEMPLATES = join(ROOT, 'lib', 'email-templates');

function rendered(s: EmailSample): { subject: string | undefined; html: string } {
  const r = s.render();
  return typeof r === 'string' ? { subject: s.subject, html: r } : r;
}

const header = (h: string) => h.slice(h.indexOf('<!--t:skip-->'), h.indexOf('<!--/t:skip-->'));
const links = (h: string) => [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&'));
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

test('every exported template has a sample', () => {
  const exported = readdirSync(TEMPLATES)
    .filter((f) => f.endsWith('.ts') && f !== 'layout.ts')
    .flatMap((f) => [...readFileSync(join(TEMPLATES, f), 'utf8').matchAll(/export function (render\w+Email)\(/g)].map((m) => m[1]!));
  const covered = new Set(emailSamples().map((s) => s.template));
  const missing = exported.filter((name) => !covered.has(name));
  assert.deepEqual(missing, [], `templates without a sample: ${missing.join(', ')}`);
  assert.ok(exported.length >= 80, `found ${exported.length} templates`);
});

test('realistic data: complete, specific, readable in HTML and plain text', () => {
  for (const s of emailSamples()) {
    const { subject, html: out } = rendered(s);
    const text = htmlToText(out);
    const where = s.name;
    assert.match(out, /^<!DOCTYPE html>/, `${where}: full document`);
    assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/, `${where}: placeholder text leaked`);
    assert.doesNotMatch(out, /\bundefined\b|\bNaN\b|\[object Object\]/, `${where}: placeholder in markup`);
    // The organisation is real text in the header, laid out like the portal wordmark.
    const head = header(out);
    assert.ok(head.includes('>Kewalram<') && head.includes('>Chanrai Group<'), `${where}: wordmark`);
    assert.ok(head.includes('alt="Kewalram Chanrai Group logo"'), `${where}: logo alt text`);
    assert.ok(out.includes('Powered by EJO 100'), `${where}: footer`);
    // A proper plain-text part: the heading, the greeting, no markup.
    assert.ok(text.length > 120, `${where}: text part`);
    assert.doesNotMatch(text, /<[a-z][^>]*>/i, `${where}: markup in text part`);
    assert.match(text, /Hello/, `${where}: greeting`);
    for (const l of links(out)) assert.match(l, /^(https:\/\/|mailto:|tel:)/, `${where}: absolute https link (${l})`);
    for (const t of [subject ?? '', text]) {
      assert.doesNotMatch(t, EMOJI, `${where}: no emoji`);
      assert.doesNotMatch(t, /!/, `${where}: no exclamation marks`);
      assert.doesNotMatch(t, /\b1 (days|hours|parts|items|alerts)\b|\b(0|[2-9]) (day|hour|part|item|alert)\b(?!s)/, `${where}: plural`);
    }
    if (subject) assert.ok(subject.length <= 110, `${where}: subject is short`);
    // Customers only ever get links to the customer site, staff to the portal.
    const own = s.audience === 'customer' ? 'https://www.example.com' : 'https://portal.example.com';
    for (const l of links(out).filter((u) => u.startsWith('https://'))) assert.ok(l.startsWith(own), `${where}: ${s.audience} link goes to ${l}`);
  }
});

test('hostile data: everything people type is escaped', () => {
  for (const s of emailSamples({ hostile: true })) {
    const { html: out } = rendered(s);
    assert.ok(!out.includes('<script'), `${s.name}: unescaped <script>`);
    assert.ok(!out.includes('<b>bold</b>'), `${s.name}: unescaped markup`);
    assert.ok(out.includes('&lt;script&gt;') || out.includes('&lt;b&gt;'), `${s.name}: hostile input shown as text`);
    assert.doesNotMatch(htmlToText(out), /\bundefined\b|\bNaN\b/, s.name);
  }
});

test('security emails state the expiry and carry no password', () => {
  const byName = new Map(emailSamples().map((s) => [s.name, rendered(s)]));
  for (const name of ['staff-password-reset', 'customer-welcome', 'customer-access-link', 'staff-welcome']) {
    const m = byName.get(name)!;
    assert.match(m.html, /expires in <strong[^>]*>1 hour<\/strong>|72 hours/, `${name}: expiry`);
    assert.doesNotMatch(m.html, /temporary password|your password is/i, `${name}: never a password`);
  }
  assert.match(byName.get('staff-password-reset')!.html, /did not ask for this/);
  assert.match(byName.get('customer-access-link')!.html, /Any earlier link no longer works/);
});

test('the website keeps an identical copy of the layout', () => {
  const portal = readFileSync(join(TEMPLATES, 'layout.ts'), 'utf8');
  const site = readFileSync(join(ROOT, '..', 'website', 'lib', 'email-templates', 'layout.ts'), 'utf8');
  assert.equal(site, portal, 'apps/website/lib/email-templates/layout.ts must match the portal copy');
});

test('layout: bulletproof button, dark mode, reduced-motion animation, preheader', () => {
  const out = rendered(emailSamples().find((s) => s.name === 'staff-job-card-approved')!).html;
  assert.match(out, /<v:roundrect[^>]+href="https:\/\/portal\.example\.com\/workshop\/job-cards\/clx123"/, 'VML button for Outlook');
  assert.match(out, /<meta name="color-scheme" content="light dark"/);
  assert.match(out, /@media \(prefers-color-scheme: dark\)/);
  assert.match(out, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(out, /class="ejo-preheader"[^>]*>[^<]*approved Job Card/);
  assert.doesNotMatch(out, /<img[^>]+(width="1"|height="1")/, 'no tracking pixel');
  const text = htmlToText(out);
  assert.match(text, /Open Job Card:\nhttps:\/\/portal\.example\.com\/workshop\/job-cards\/clx123/);
  assert.match(text, /Job Card: JC-2026-000123/);
  assert.doesNotMatch(text, /Kewalram\nChanrai Group/, 'visual header left out of the text part');
});

test('formatting helpers: naira, Lagos dates, plurals, escaping', () => {
  assert.equal(formatNaira(12345), '₦12,345.00');
  assert.equal(formatNaira('-50.5'), '-₦50.50');
  assert.equal(formatNaira(Number.NaN), '₦0.00');
  // 23:30 UTC is already the next day in Lagos (UTC+1).
  assert.equal(formatEmailDate(new Date('2026-10-12T23:30:00Z')), '13 October 2026');
  assert.match(formatEmailDateTime(new Date('2026-10-12T13:05:00Z')), /^12 October 2026 at 2:05\s?pm$/i);
  assert.equal(plural(1, 'day'), '1 day');
  assert.equal(plural(3, 'day'), '3 days');
  assert.equal(plural(1250, 'km', 'km'), '1,250 km');
  assert.equal(vehicleLabel('Toyota Hilux', 'KJA-219-XY'), 'Toyota Hilux (KJA-219-XY)');
  assert.equal(vehicleLabel('', ''), 'your vehicle');
  assert.equal(html`<p>${'<i>'}</p>`.value, '<p>&lt;i&gt;</p>');
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
  assert.equal(details([['Empty', null], ['Blank', '']]).value, '', 'rows without a value are dropped');
});
