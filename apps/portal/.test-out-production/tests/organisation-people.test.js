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
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const people_core_1 = require("../lib/organisation/people-core");
const citations_1 = require("../lib/enyo/citations");
const markdown_1 = require("../lib/enyo/markdown");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
(0, node_test_1.test)('people the organisation publishes: name and title required, https profile, no contact details', () => {
    const good = (0, people_core_1.checkProfile)({ name: '  Ada   Obi ', title: 'Director, Automobile Division', area: 'Automobile Division', bio: 'Leads the auto business.', profileUrl: 'https://www.linkedin.com/in/ada', isPublic: 'on' });
    strict_1.default.ok(good.ok);
    strict_1.default.deepEqual(good.ok && good.value, { name: 'Ada Obi', title: 'Director, Automobile Division', area: 'Automobile Division', bio: 'Leads the auto business.', profileUrl: 'https://www.linkedin.com/in/ada', isPublic: true });
    strict_1.default.equal((0, people_core_1.checkProfile)({ name: 'A', title: 'Director' }).ok, false);
    strict_1.default.equal((0, people_core_1.checkProfile)({ name: 'Ada Obi', title: '' }).ok, false);
    strict_1.default.equal((0, people_core_1.checkProfile)({ name: 'Ada Obi', title: 'Director', profileUrl: 'http://x.com' }).ok, false);
    strict_1.default.equal((0, people_core_1.checkProfile)({ name: 'Ada Obi', title: 'Director', profileUrl: 'javascript:alert(1)' }).ok, false);
    strict_1.default.equal((0, people_core_1.checkProfile)({ name: 'Ada Obi', title: 'Director', bio: 'Call 0803 123 4567' }).ok, false);
    strict_1.default.equal((0, people_core_1.checkProfile)({ name: 'Ada Obi', title: 'Director', bio: 'ada@example.com' }).ok, false);
    const staffOnly = (0, people_core_1.checkProfile)({ name: 'Ada Obi', title: 'Director' });
    strict_1.default.ok(staffOnly.ok && staffOnly.value.isPublic === false && staffOnly.value.profileUrl === null);
});
(0, node_test_1.test)('people: fenced to the administrator\'s organisation; only public ones reach the website', () => {
    const actions = read('lib/actions/public-profiles.ts');
    strict_1.default.match(actions, /authorize\(PERM/);
    for (const fn of ['savePublicProfile', 'removePublicProfile', 'movePublicProfile']) {
        const body = actions.split(`export async function ${fn}`)[1].split('\nexport ')[0];
        strict_1.default.match(body, /profileOrg\(/, fn);
        strict_1.default.match(body, /refuseDuringAssist\(/, fn);
        strict_1.default.doesNotMatch(body, /where: \{ id \}/, fn);
    }
    const website = read('../website/lib/enyo/company.ts');
    strict_1.default.match(website, /publicProfile\.findMany\(\{ where: \{ organisationId, isPublic: true \}/);
    const staff = read('lib/enyo/tools/organisation.ts');
    strict_1.default.match(staff, /organisationId: org/);
    strict_1.default.match(staff, /getPrincipal\(\)/);
    strict_1.default.match(read('lib/enyo/tools/index.ts'), /organisationTools/);
});
(0, node_test_1.test)('citation marks never reach the reader', () => {
    strict_1.default.equal((0, citations_1.stripCitationMarks)('Ada Obi leads the auto business【web_lookup†source】.'), 'Ada Obi leads the auto business.');
    const blocks = (0, markdown_1.parseMarkdown)('Hello 【1†source】 world');
    strict_1.default.doesNotMatch(JSON.stringify(blocks), /【/);
    strict_1.default.equal((0, citations_1.stripCitationMarks)('x【1†source】'), 'x');
    strict_1.default.equal(read('../website/lib/enyo/citations.ts').replace(/^.*\n/, ''), read('lib/enyo/citations.ts').replace(/^.*\n/, ''), 'the website strips the same marks');
});
(0, node_test_1.test)('support holidays: Nigerian calendar worked out every year, own days added, days opened anyway removed', async () => {
    const { holidayEntries, effectiveHolidays } = await Promise.resolve().then(() => __importStar(require('../lib/support/holidays')));
    const { nigerianHolidays, islamicHolidaysEstimated } = await Promise.resolve().then(() => __importStar(require('../lib/nigeria-calendar')));
    const y2026 = holidayEntries('NG', [], [], [2026]).map((e) => e.date);
    for (const d of ['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-06-12', '2026-10-01', '2026-12-25', '2026-12-26'])
        strict_1.default.ok(y2026.includes(d), d);
    // Christmas 2027 is a Saturday, Boxing Day a Sunday: Monday 27 and Tuesday 28 are given off (provisional).
    const h2027 = nigerianHolidays(2027, { observed: true });
    strict_1.default.equal(h2027.get('2027-12-27')?.provisional, true);
    strict_1.default.equal(h2027.get('2027-12-28')?.provisional, true);
    // Without "observed" the plain calendar is unchanged.
    strict_1.default.equal(nigerianHolidays(2027).has('2027-12-27'), false);
    // Years beyond the table: Islamic holidays are estimated from the Hijri calendar.
    const est = islamicHolidaysEstimated(2030).map(([, n]) => n);
    strict_1.default.ok(est.includes('Eid-el-Fitr') && est.includes('Eid-el-Kabir') && est.includes('Eid-el-Maulud'), est.join(','));
    strict_1.default.ok(nigerianHolidays(2030).size >= 12);
    // Own closed day added; a holiday the organisation opens on removed; no calendar → own days only.
    const eff = effectiveHolidays('NG', ['2026-11-20'], ['2026-12-26'], new Date('2026-10-16T09:00:00Z'));
    strict_1.default.ok(eff.includes('2026-11-20'));
    strict_1.default.ok(!eff.includes('2026-12-26'));
    strict_1.default.ok(eff.includes('2025-12-25') && eff.includes('2027-01-01'));
    strict_1.default.deepEqual(effectiveHolidays(null, ['2026-11-20', 'bad'], [], new Date('2026-10-16T09:00:00Z')), ['2026-11-20']);
});
(0, node_test_1.test)('support set-up: separate pages, each form saves only its own part', () => {
    const h = read('lib/actions/support-form-handlers.ts');
    for (const s of ["section === 'hours'", "section === 'holidays'", "section === 'enyo'", "section === 'followups'"])
        strict_1.default.ok(h.includes(s), s);
    const admin = read('lib/actions/support-admin.ts');
    strict_1.default.match(admin, /if \(input\.hours !== undefined\)/);
    for (const page of ['page.tsx', 'teams/page.tsx', 'teams/[id]/page.tsx', 'hours/page.tsx', 'enyo/page.tsx', 'follow-ups/page.tsx']) {
        const src = read(`app/(app)/settings/support/${page}`);
        strict_1.default.match(src, /guardPage\('support\.manage'/, page);
    }
    strict_1.default.doesNotMatch(read('app/(app)/settings/support/hours/page.tsx'), /YYYY-MM-DD, separated by commas/);
});
