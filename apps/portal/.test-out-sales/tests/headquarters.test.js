"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const hq_core_1 = require("../lib/hq-core");
const navigation_1 = require("../lib/authz/navigation");
const catalogue_1 = require("../lib/authz/catalogue");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (rel) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, rel), 'utf8');
const who = (roleSlugs, extra = {}) => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'a', departmentId: null, ...extra });
(0, node_test_1.test)('periods are Lagos calendar ranges; anything unknown is this month', () => {
    const now = new Date('2026-10-17T10:00:00+01:00');
    const m = (0, hq_core_1.hqPeriod)('this_month', now);
    strict_1.default.equal(m.from.toISOString(), new Date('2026-10-01T00:00:00+01:00').toISOString());
    strict_1.default.equal(m.to.toISOString(), new Date('2026-10-18T00:00:00+01:00').toISOString());
    const l = (0, hq_core_1.hqPeriod)('last_month', now);
    strict_1.default.equal(l.from.toISOString(), new Date('2026-09-01T00:00:00+01:00').toISOString());
    strict_1.default.equal(l.to.toISOString(), new Date('2026-10-01T00:00:00+01:00').toISOString());
    strict_1.default.equal((0, hq_core_1.hqPeriod)('this_quarter', now).from.toISOString(), new Date('2026-10-01T00:00:00+01:00').toISOString());
    strict_1.default.equal((0, hq_core_1.hqPeriod)('this_year', now).from.toISOString(), new Date('2026-01-01T00:00:00+01:00').toISOString());
    strict_1.default.equal((0, hq_core_1.hqPeriod)('drop table', now).key, 'this_month');
    strict_1.default.equal((0, hq_core_1.hqPeriod)('last_month', new Date('2026-01-10T10:00:00+01:00')).from.toISOString(), new Date('2025-12-01T00:00:00+01:00').toISOString());
});
(0, node_test_1.test)('branch health: action for old decisions or late customers; watch for queues and slow jobs', () => {
    const base = { id: 'b', name: 'B', staff: 3, opened: 1, finished: 1, collected: 0, inWorkshop: 2, ready: 0, waiting: 0, oldestWaitingHours: null, supportOpen: 0, supportLate: 0, turnaroundHours: 20 };
    strict_1.default.equal((0, hq_core_1.branchHealth)(base).tone, 'good');
    strict_1.default.equal((0, hq_core_1.branchHealth)({ ...base, waiting: 1, oldestWaitingHours: 50 }).tone, 'act');
    strict_1.default.equal((0, hq_core_1.branchHealth)({ ...base, supportLate: 1 }).tone, 'act');
    strict_1.default.equal((0, hq_core_1.branchHealth)({ ...base, ready: 5 }).tone, 'watch');
    strict_1.default.equal((0, hq_core_1.branchHealth)({ ...base, turnaroundHours: 100 }).tone, 'watch');
    strict_1.default.match((0, hq_core_1.branchHealth)({ ...base, supportLate: 2, ready: 6 }).reasons.join(' '), /2 customer requests past target.*6 vehicles/);
    strict_1.default.equal((0, hq_core_1.median)([5, 1, 3]), 3);
    strict_1.default.equal((0, hq_core_1.median)([1, 2, 3, 4]), 2.5);
    strict_1.default.equal((0, hq_core_1.median)([]), null);
});
(0, node_test_1.test)('the CSV export neutralises spreadsheet formulas and quotes every cell', () => {
    strict_1.default.equal((0, hq_core_1.csvCell)('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
    strict_1.default.equal((0, hq_core_1.csvCell)('+234 803'), `"'+234 803"`);
    strict_1.default.equal((0, hq_core_1.csvCell)('@SUM(A1)'), `"'@SUM(A1)"`);
    strict_1.default.equal((0, hq_core_1.csvCell)(-1200), '"-1200"');
    strict_1.default.equal((0, hq_core_1.csvCell)('Ikeja, Lagos'), '"Ikeja, Lagos"');
    const csv = (0, hq_core_1.toCsv)(['A', 'B'], [[1, null]]);
    strict_1.default.ok(csv.startsWith('\uFEFF"A","B"\r\n"1",""'));
});
(0, node_test_1.test)('Headquarters: leadership with the whole organisation in view; a branch manager is kept to the branch', () => {
    strict_1.default.ok((0, navigation_1.navigationFor)(who(['executive'])).some((i) => i.key === 'headquarters'));
    strict_1.default.ok((0, navigation_1.navigationFor)(who(['administrator'])).some((i) => i.key === 'headquarters'));
    strict_1.default.ok(!(0, navigation_1.navigationFor)(who(['workshop-manager'])).some((i) => i.key === 'headquarters'), 'branch scope: not in the menu');
    strict_1.default.ok(!(0, navigation_1.navigationFor)(who(['technician'])).some((i) => i.key === 'headquarters'));
    strict_1.default.equal((0, catalogue_1.decide)(who(['technician']), 'analytics.business.view').allowed, false);
    const page = read('app/(app)/headquarters/page.tsx');
    strict_1.default.match(page, /guardPage\('analytics\.business\.view'/);
    const action = read('lib/actions/headquarters.ts');
    strict_1.default.match(action, /await authorize\('analytics\.business\.view'/);
    strict_1.default.match(action, /businessUnit: \{ organisationId: org \}/, 'branches from the viewer\'s own organisation only');
    // Organisation-wide is the permission's scope, not the shape of the reach (which is a list of branch ids).
    strict_1.default.match(action, /const orgWide = p\.isSuperAdmin \|\| scopeFor\(p, 'analytics\.business\.view'\) === 'ALL'/);
    // Decisions waiting include service estimates; closed jobs never count; money is summed by the database.
    strict_1.default.match(action, /prisma\.serviceEstimate\.findMany/);
    strict_1.default.match(action, /jobCard: \{ \.\.\.inB, status: \{ notIn: \[\.\.\.CLOSED_JC\] \} \}/);
    strict_1.default.match(action, /prisma\.payment\.aggregate/);
    strict_1.default.doesNotMatch(action, /prisma\.payment\.findMany/);
    const route = read('app/(app)/headquarters/export/route.ts');
    strict_1.default.match(route, /getHeadquarters\(period\)/, 'the export runs the same checks as the page');
    strict_1.default.match(route, /'Cache-Control': 'no-store'/);
    strict_1.default.match(route, /headquarters\.exported/, 'every export is in the audit trail');
});
(0, node_test_1.test)('executives and IT administrators send notices; Users and Roles are read first, changed on purpose', () => {
    strict_1.default.equal((0, catalogue_1.decide)(who(['executive']), 'notifications.broadcast.send').allowed, true);
    strict_1.default.equal((0, catalogue_1.decide)(who(['it-administrator']), 'notifications.broadcast.send').allowed, true);
    strict_1.default.equal((0, catalogue_1.decide)(who(['technician']), 'notifications.broadcast.send').allowed, false);
    const users = read('app/(app)/users/page.tsx');
    strict_1.default.match(users, /redirect\('\/users\/new'\)/);
    strict_1.default.doesNotMatch(users, /<AddStaffForm/);
    strict_1.default.match(read('app/(app)/users/new/page.tsx'), /<AddStaffForm/);
    strict_1.default.match(read('app/(app)/roles/[id]/page.tsx'), /<EditableSection/);
    strict_1.default.match(read('lib/actions/roles-form-handlers.ts'), /\/roles\/\$\{id\}/);
});
(0, node_test_1.test)('dropdown lists float above the page (never clipped, never behind the next card)', () => {
    for (const f of ['components/FilterSelect.tsx', 'components/SearchableSelect.tsx', 'components/mail/RecipientField.tsx']) {
        const src = read(f);
        strict_1.default.match(src, /<Floating /, f);
        strict_1.default.doesNotMatch(src, /absolute[^"]*top-full[^"]*z-|absolute z-30 mt-1/, `${f}: no in-page absolute list`);
    }
    const fl = read('components/ui/Floating.tsx');
    strict_1.default.match(fl, /createPortal/);
    strict_1.default.match(fl, /position: 'fixed'/);
    strict_1.default.match(fl, /closest\('dialog\[open\]'\)/, 'inside a modal, drawn in the modal');
    // Clicks inside the floating list count as inside the field.
    strict_1.default.match(read('components/FilterSelect.tsx'), /!panel\.current\?\.contains\(t\)/);
    strict_1.default.match(read('components/SearchableSelect.tsx'), /!panelRef\.current\?\.contains/);
});
