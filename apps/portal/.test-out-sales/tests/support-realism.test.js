"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const core_1 = require("../lib/support/core");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
(0, node_test_1.test)('phone numbers become international for Call and WhatsApp', () => {
    strict_1.default.equal((0, core_1.intlDigits)('0803 123 4567'), '2348031234567');
    strict_1.default.equal((0, core_1.intlDigits)('+234 803 123 4567'), '2348031234567');
    strict_1.default.equal((0, core_1.intlDigits)('00447700900123'), '447700900123');
    strict_1.default.equal((0, core_1.intlDigits)('12345'), null);
    strict_1.default.equal((0, core_1.intlDigits)(null), null);
});
(0, node_test_1.test)('colleagues are emailed: new owner, nobody free (leads), late (owner and leads)', () => {
    const n = read('lib/support/notify.ts');
    for (const f of ['export async function emailAssignee', 'export async function alertNobodyFree', 'export async function emailLate', 'export async function announceRouted'])
        strict_1.default.ok(n.includes(f), f);
    strict_1.default.match(n, /isLead: true/);
    strict_1.default.match(n, /nobody_free_alerted/, 'told once per request');
    strict_1.default.match(read('lib/support/intake.ts'), /await announceRouted\(created\.id\)/);
    strict_1.default.match(read('lib/support/automations.ts'), /if \(done\.count\) await announceRouted\(t\.id\)/);
    strict_1.default.match(read('lib/support/automations.ts'), /await emailLate\(t\.id\)/);
    strict_1.default.match(read('lib/actions/support.ts'), /if \(target && target !== me\.id\) announceLater\(t\.id, me\.id\)/);
    strict_1.default.match(read('lib/actions/help.ts'), /announceLater\(created\.id\)/);
});
(0, node_test_1.test)('settings are read first and edited on purpose', () => {
    for (const page of ['hours/page.tsx', 'enyo/page.tsx', 'follow-ups/page.tsx', 'teams/[id]/page.tsx', 'teams/page.tsx']) {
        const src = read(`app/(app)/settings/support/${page}`);
        strict_1.default.match(src, /<EditableSection /, page);
    }
    strict_1.default.match(read('lib/actions/support-form-handlers.ts'), /&edit=\$\{edit\}/, 'a failed save comes back open');
    strict_1.default.match(read('components/enyo/EnyoSettingsForm.tsx'), /Edit settings/);
    strict_1.default.match(read('app/(app)/organisation/people/page.tsx'), /\+ Add a person/);
});
(0, node_test_1.test)('each team has its own automatic reply text, plain words only', () => {
    const admin = read('lib/actions/support-admin.ts');
    strict_1.default.match(admin, /function cleanAck/);
    strict_1.default.match(admin, /no links or HTML/);
    strict_1.default.match(read('lib/support/intake.ts'), /teamMessage: own\?\.ackMessage \?\? null/);
});
