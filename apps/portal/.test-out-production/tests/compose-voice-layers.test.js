"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Live email preview, voice notes and floating menus (UI rules that must hold). */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (f) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, f), 'utf8');
(0, node_test_1.test)('compose previews live beside the form, never runs scripts, and has no modal to lose work', () => {
    const page = read('app/(app)/mail/compose/page.tsx');
    strict_1.default.match(page, /<form id="mail-compose"/);
    strict_1.default.match(page, /<LiveMailPreview formId="mail-compose"/);
    const live = read('components/mail/LiveMailPreview.tsx');
    strict_1.default.match(live, /sandbox="allow-same-origin"/);
    strict_1.default.doesNotMatch(live, /allow-scripts/);
    strict_1.default.match(live, /renderPersonalMail\(/);
    strict_1.default.match(live, /Live preview is off for this message/);
    const field = read('components/mail/MailStyleField.tsx');
    strict_1.default.doesNotMatch(field, /role="dialog"|previewMyMail/);
});
(0, node_test_1.test)('voice notes: pause, resume, edit as text, send, cancel — nothing is sent without the person choosing', () => {
    const v = read('../../packages/enyo/src/ui/speechInput.ts');
    for (const f of ['const pause =', 'const resume =', 'const finish =', 'const cancel ='])
        strict_1.default.ok(v.includes(f), f);
    // A browser that stops by itself keeps the words (paused); it does not send.
    strict_1.default.match(v, /Paused by the person, or the browser stopped by itself: keep the words/);
    const panel = read('components/enyo/EnyoPanel.tsx');
    strict_1.default.match(panel, /Edit as text/);
    strict_1.default.match(panel, /if \(how === 'send'\) \{ void ask\(joinSpoken\(typed, heard\)/);
});
(0, node_test_1.test)('menus float above headers, tab bars and dialogs', () => {
    const layer = read('components/ui/FloatingLayer.tsx');
    strict_1.default.match(layer, /createPortal\(/);
    strict_1.default.match(layer, /z-\[80\]/);
    strict_1.default.match(read('components/print/PrintMenu.tsx'), /<FloatingLayer /);
    strict_1.default.match(read('components/enyo/RefineTextButton.tsx'), /<FloatingLayer /);
});
