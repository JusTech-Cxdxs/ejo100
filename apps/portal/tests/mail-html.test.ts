/**
 * Mail shows an email's own layout only after it has been cleaned
 * (lib/mail/html.ts) and only inside a frame that runs nothing
 * (lib/mail/html-frame.ts); attachments download safely (lib/mail/attachments.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanCss, sanitizeMailHtml } from '../lib/mail/html';
import { mailFrameDocument } from '../lib/mail/html-frame';

const ROOT = join(__dirname, '..', '..');

test('scripts, handlers, forms, frames and javascript: links are removed', () => {
  const dirty = `<div onclick="steal()">Hi<script>alert(1)</script><iframe src="https://evil.test"></iframe>
    <form action="https://evil.test"><input name="p"></form><a href="javascript:alert(1)">x</a><a href="https://ok.test/a">ok</a>
    <img src="x" onerror="alert(1)"><svg><script>1</script></svg><meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test"></div>`;
  const r = sanitizeMailHtml(dirty)!;
  for (const bad of ['<script', 'onclick', 'onerror', '<iframe', '<form', '<input', 'javascript:', '<svg', '<meta', '<base']) assert.ok(!r.html.toLowerCase().includes(bad), bad);
  assert.match(r.html, /<a href="https:\/\/ok\.test\/a" target="_blank" rel="noopener noreferrer nofollow">ok<\/a>/);
});

test('remote pictures are held back (and trackers dropped); inline pictures come from the email itself', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const r = sanitizeMailHtml('<p>Logo <img src="https://cdn.test/logo.png" alt="Logo"> <img src="https://t.test/open.gif" width="1" height="1"> <img src="cid:pic1@x"></p>', [{ cid: '<pic1@x>', contentType: 'image/png', content: png }])!;
  assert.equal(r.remoteImages, 1);
  assert.match(r.html, /data-remote-src="https:\/\/cdn\.test\/logo\.png"/);
  assert.doesNotMatch(r.html, / src="https:\/\/cdn/);
  assert.doesNotMatch(r.html, /t\.test/);
  assert.match(r.html, /src="data:image\/png;base64,iVBORw0KGgo="/);
});

test('CSS cannot fetch anything or pin itself over the page', () => {
  assert.equal(cleanCss('@import url(https://x.test/a.css); a{color:red}').trim(), 'a{color:red}');
  assert.match(cleanCss('div{background:url("https://track.test/p.gif")}'), /background:none/);
  assert.match(cleanCss('div{background:url(data:image/png;base64,AAAA)}'), /data:image\/png/);
  assert.match(cleanCss('div{position: fixed; top:0}'), /position: static/);
  const r = sanitizeMailHtml('<style>@import "https://x.test/a.css"; p{color:#333}</style><p style="background-image:url(https://t.test/x.gif);color:red">Hello</p>')!;
  assert.doesNotMatch(r.html, /x\.test|t\.test/);
  assert.match(r.html, /Hello/);
});

test('the reading frame allows only inline styles and pictures; remote ones only when asked', () => {
  const html = '<img data-remote-src="https://cdn.test/a.png" alt="a"><p>Body</p>';
  const off = mailFrameDocument(html, false);
  assert.match(off, /img-src data:;/);
  assert.doesNotMatch(off, / src="https:\/\/cdn/);
  const on = mailFrameDocument(html, true);
  assert.match(on, /img-src data: https:;/);
  assert.match(on, / src="https:\/\/cdn\.test\/a\.png"/);
  assert.match(on, /default-src 'none'/);
  assert.equal(sanitizeMailHtml('   '), null);
  assert.equal(sanitizeMailHtml('<div><br></div>'), null);
});

test('the frame runs no scripts, and attachments download without running', () => {
  const frame = readFileSync(join(ROOT, 'components/mail/MailHtmlFrame.tsx'), 'utf8');
  assert.match(frame, /sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(frame, /allow-scripts/);
  const route = readFileSync(join(ROOT, 'app/api/mail/attachment/[id]/[index]/route.ts'), 'utf8');
  assert.match(route, /currentAssist/);
  assert.match(route, /sandbox/);
  const lib = readFileSync(join(ROOT, 'lib/mail/attachments.ts'), 'utf8');
  assert.match(lib, /account: \{ userId: o\.userId/);
});

test('review: no break-out of <style>, no sender-chosen picture addresses, no background loads, nothing cut off', () => {
  const evil = '<style>a{}</sty/**/le><img src=x onerror=alert(1)><form action="https://e"><input name=p></form><a href="javascript:alert(1)" target="_self">x</a></style><p>ok</p>';
  const r = sanitizeMailHtml(evil)!;
  // What tried to break out is now inert text inside the CSS: no live tag or link.
  for (const bad of ['<img', '<form', '<input', '<a ', '</sty le']) assert.ok(!r.html.includes(bad), bad);
  assert.match(r.html, /<\/style><p>ok<\/p>$/);
  const t = sanitizeMailHtml('<img data-remote-src="https://tracker.test/p.gif" width="1" height="1"><table background="https://bg.test/x.png"><tr><td style="background:u\\72l(https://t.test/a)">Hi</td></tr></table>')!;
  assert.doesNotMatch(t.html, /tracker\.test|bg\.test|url\(\s*['"]?https?:/i);
  assert.doesNotMatch(t.html, /\\/); // CSS escapes cannot spell url( any more
  assert.equal(t.remoteImages, 0);
  // Three large inline pictures: the layout is tried without them rather than cut.
  const big = Buffer.alloc(380_000, 7);
  const many = sanitizeMailHtml('<p>Start</p><img src="cid:a"><img src="cid:b"><img src="cid:c"><p>Please approve the invoice</p>', ['a', 'b', 'c'].map((cid) => ({ cid, contentType: 'image/png', content: big })))!;
  assert.match(many.html, /Please approve the invoice<\/p>$/);
  assert.ok(many.html.length <= 1_500_000);
});
