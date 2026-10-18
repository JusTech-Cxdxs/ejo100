"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Mail shows an email's own layout only after it has been cleaned
 * (lib/mail/html.ts) and only inside a frame that runs nothing
 * (lib/mail/html-frame.ts); attachments download safely (lib/mail/attachments.ts).
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const html_1 = require("../lib/mail/html");
const html_frame_1 = require("../lib/mail/html-frame");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
(0, node_test_1.test)('scripts, handlers, forms, frames and javascript: links are removed', () => {
    const dirty = `<div onclick="steal()">Hi<script>alert(1)</script><iframe src="https://evil.test"></iframe>
    <form action="https://evil.test"><input name="p"></form><a href="javascript:alert(1)">x</a><a href="https://ok.test/a">ok</a>
    <img src="x" onerror="alert(1)"><svg><script>1</script></svg><meta http-equiv="refresh" content="0;url=https://evil.test"><base href="https://evil.test"></div>`;
    const r = (0, html_1.sanitizeMailHtml)(dirty);
    for (const bad of ['<script', 'onclick', 'onerror', '<iframe', '<form', '<input', 'javascript:', '<svg', '<meta', '<base'])
        strict_1.default.ok(!r.html.toLowerCase().includes(bad), bad);
    strict_1.default.match(r.html, /<a href="https:\/\/ok\.test\/a" target="_blank" rel="noopener noreferrer nofollow">ok<\/a>/);
});
(0, node_test_1.test)('remote pictures are held back (and trackers dropped); inline pictures come from the email itself', () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const r = (0, html_1.sanitizeMailHtml)('<p>Logo <img src="https://cdn.test/logo.png" alt="Logo"> <img src="https://t.test/open.gif" width="1" height="1"> <img src="cid:pic1@x"></p>', [{ cid: '<pic1@x>', contentType: 'image/png', content: png }]);
    strict_1.default.equal(r.remoteImages, 1);
    strict_1.default.match(r.html, /data-remote-src="https:\/\/cdn\.test\/logo\.png"/);
    strict_1.default.doesNotMatch(r.html, / src="https:\/\/cdn/);
    strict_1.default.doesNotMatch(r.html, /t\.test/);
    strict_1.default.match(r.html, /src="data:image\/png;base64,iVBORw0KGgo="/);
});
(0, node_test_1.test)('CSS cannot fetch anything or pin itself over the page', () => {
    strict_1.default.equal((0, html_1.cleanCss)('@import url(https://x.test/a.css); a{color:red}').trim(), 'a{color:red}');
    strict_1.default.match((0, html_1.cleanCss)('div{background:url("https://track.test/p.gif")}'), /background:none/);
    strict_1.default.match((0, html_1.cleanCss)('div{background:url(data:image/png;base64,AAAA)}'), /data:image\/png/);
    strict_1.default.match((0, html_1.cleanCss)('div{position: fixed; top:0}'), /position: static/);
    const r = (0, html_1.sanitizeMailHtml)('<style>@import "https://x.test/a.css"; p{color:#333}</style><p style="background-image:url(https://t.test/x.gif);color:red">Hello</p>');
    strict_1.default.doesNotMatch(r.html, /x\.test|t\.test/);
    strict_1.default.match(r.html, /Hello/);
});
(0, node_test_1.test)('the reading frame allows only inline styles and pictures; remote ones only when asked', () => {
    const html = '<img data-remote-src="https://cdn.test/a.png" alt="a"><p>Body</p>';
    const off = (0, html_frame_1.mailFrameDocument)(html, false);
    strict_1.default.match(off, /img-src data:;/);
    strict_1.default.doesNotMatch(off, / src="https:\/\/cdn/);
    const on = (0, html_frame_1.mailFrameDocument)(html, true);
    strict_1.default.match(on, /img-src data: https:;/);
    strict_1.default.match(on, / src="https:\/\/cdn\.test\/a\.png"/);
    strict_1.default.match(on, /default-src 'none'/);
    strict_1.default.equal((0, html_1.sanitizeMailHtml)('   '), null);
    strict_1.default.equal((0, html_1.sanitizeMailHtml)('<div><br></div>'), null);
});
(0, node_test_1.test)('the frame runs no scripts, and attachments download without running', () => {
    const frame = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'components/mail/MailHtmlFrame.tsx'), 'utf8');
    strict_1.default.match(frame, /sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"/);
    strict_1.default.doesNotMatch(frame, /allow-scripts/);
    const route = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'app/api/mail/attachment/[id]/[index]/route.ts'), 'utf8');
    strict_1.default.match(route, /currentAssist/);
    strict_1.default.match(route, /sandbox/);
    const lib = (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'lib/mail/attachments.ts'), 'utf8');
    strict_1.default.match(lib, /account: \{ userId: o\.userId/);
});
(0, node_test_1.test)('review: no break-out of <style>, no sender-chosen picture addresses, no background loads, nothing cut off', () => {
    const evil = '<style>a{}</sty/**/le><img src=x onerror=alert(1)><form action="https://e"><input name=p></form><a href="javascript:alert(1)" target="_self">x</a></style><p>ok</p>';
    const r = (0, html_1.sanitizeMailHtml)(evil);
    // What tried to break out is now inert text inside the CSS: no live tag or link.
    for (const bad of ['<img', '<form', '<input', '<a ', '</sty le'])
        strict_1.default.ok(!r.html.includes(bad), bad);
    strict_1.default.match(r.html, /<\/style><p>ok<\/p>$/);
    const t = (0, html_1.sanitizeMailHtml)('<img data-remote-src="https://tracker.test/p.gif" width="1" height="1"><table background="https://bg.test/x.png"><tr><td style="background:u\\72l(https://t.test/a)">Hi</td></tr></table>');
    strict_1.default.doesNotMatch(t.html, /tracker\.test|bg\.test|url\(\s*['"]?https?:/i);
    strict_1.default.doesNotMatch(t.html, /\\/); // CSS escapes cannot spell url( any more
    strict_1.default.equal(t.remoteImages, 0);
    // Three large inline pictures: the layout is tried without them rather than cut.
    const big = Buffer.alloc(380_000, 7);
    const many = (0, html_1.sanitizeMailHtml)('<p>Start</p><img src="cid:a"><img src="cid:b"><img src="cid:c"><p>Please approve the invoice</p>', ['a', 'b', 'c'].map((cid) => ({ cid, contentType: 'image/png', content: big })));
    strict_1.default.match(many.html, /Please approve the invoice<\/p>$/);
    strict_1.default.ok(many.html.length <= 1_500_000);
});
(0, node_test_1.test)('text views drop the bracketed picture addresses that HTML emails leave behind', async () => {
    const { stripImageRefs, cleanBody } = await Promise.resolve().then(() => __importStar(require('../lib/mail/parse-core')));
    strict_1.default.equal(stripImageRefs('Kewalram Chanrai Group [https://ejo100-website.vercel.app/images/logo/logo.png]\nHello'), 'Kewalram Chanrai Group\nHello');
    strict_1.default.equal(stripImageRefs('See [cid:image001.png@01DA] here'), 'See here');
    strict_1.default.equal(stripImageRefs('Read the terms [https://x.example/terms]'), 'Read the terms [https://x.example/terms]');
    strict_1.default.equal(cleanBody('Logo [https://cdn.x/a.PNG?v=2]\r\nBody'), 'Logo\nBody');
});
