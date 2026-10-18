"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Version-1 polish: employee IDs, the access description used in emails and
 * on the profile page, the welcome email, the version-1 menu, and the live
 * check (cheap, organisation-scoped, never a page render). Pure: no database.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const employee_id_1 = require("../lib/employee-id");
const describe_access_1 = require("../lib/authz/describe-access");
const catalogue_1 = require("../lib/authz/catalogue");
const staff_access_1 = require("../lib/email-templates/staff-access");
const navigation_1 = require("../lib/authz/navigation");
const roadmap_1 = require("../lib/roadmap");
const structure_rules_1 = require("../lib/structure-rules");
const theme_1 = require("../lib/theme");
const avatar_1 = require("../lib/avatar");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
const read = (p) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, p), 'utf8');
const who = (roleSlugs, extra = {}) => ({ userId: 'me', isSuperAdmin: false, roleSlugs, branchId: 'b1', departmentId: null, ...extra });
(0, node_test_1.test)('employee IDs: organisation and branch codes', () => {
    strict_1.default.equal((0, employee_id_1.organisationCode)('Kewalram Nigeria'), 'KN');
    strict_1.default.equal((0, employee_id_1.organisationCode)('Kewalram Chanrai Group Limited'), 'KCG');
    strict_1.default.equal((0, employee_id_1.organisationCode)('Acme'), 'ACM');
    strict_1.default.equal((0, employee_id_1.organisationCode)('   '), 'EJO');
    strict_1.default.equal((0, employee_id_1.branchCode)('Isolo Branch'), 'ISO');
    strict_1.default.equal((0, employee_id_1.branchCode)('Victoria Island'), 'VI');
    strict_1.default.equal((0, employee_id_1.branchCode)('Ikeja Workshop'), 'IKE');
    strict_1.default.equal((0, employee_id_1.branchCode)('Anything', 'kwl-ws'), 'KWLW', 'the branch\'s own code wins (letters and digits only)');
    strict_1.default.equal((0, employee_id_1.branchCode)('Abuja', 'x'), 'ABU', 'a one-character own code is ignored');
    strict_1.default.equal((0, employee_id_1.branchCode)('Lekki <script>'), 'LS', 'only letters and digits survive');
    strict_1.default.equal((0, employee_id_1.employeeIdPrefix)('Kewalram Nigeria', 'Isolo Branch'), 'KN-ISO');
});
(0, node_test_1.test)('employee IDs: format and running number', () => {
    strict_1.default.equal((0, employee_id_1.formatEmployeeId)('KN-ISO', 7), 'KN-ISO-0007');
    strict_1.default.equal((0, employee_id_1.formatEmployeeId)('KN-ISO', 12345), 'KN-ISO-12345');
    strict_1.default.equal((0, employee_id_1.sequenceOf)('KN-ISO', 'KN-ISO-0042'), 42);
    strict_1.default.equal((0, employee_id_1.sequenceOf)('KN-ISO', 'KN-ISOX-0042'), null);
    strict_1.default.equal((0, employee_id_1.sequenceOf)('KN-ISO', 'KN-ISO-12a'), null);
    strict_1.default.equal((0, employee_id_1.sequenceOf)('KN-ISO', 'EMP-001'), null);
});
(0, node_test_1.test)('employee IDs: branches whose names give the same code are told apart, and existing ones never change', () => {
    const first = (0, employee_id_1.uniqueBranchPrefixes)('Kewalram Nigeria', [{ id: 'a', name: 'Isolo' }, { id: 'b', name: 'Isolo Workshop' }, { id: 'c', name: 'Victoria Island' }]);
    strict_1.default.deepEqual([...first.values()], ['KN-ISO', 'KN-ISO2', 'KN-VI']);
    const later = (0, employee_id_1.uniqueBranchPrefixes)('Kewalram Nigeria', [{ id: 'a', name: 'Isolo' }, { id: 'b', name: 'Isolo Workshop' }, { id: 'c', name: 'Victoria Island' }, { id: 'd', name: 'Isolo Branch' }]);
    strict_1.default.equal(later.get('a'), 'KN-ISO');
    strict_1.default.equal(later.get('b'), 'KN-ISO2');
    strict_1.default.equal(later.get('d'), 'KN-ISO3');
});
(0, node_test_1.test)('access description: exactly what the catalogue grants, with "added" grants marked', () => {
    const tech = (0, describe_access_1.describeAccess)(who(['technician']));
    const keys = tech.flatMap((g) => g.lines.map((l) => l.key));
    strict_1.default.ok(keys.includes('workshop.job.work'));
    strict_1.default.ok(keys.includes('security.exit_pass.request'), 'the everyone baseline is listed');
    strict_1.default.ok(!keys.includes('admin.users.manage'));
    const work = tech.flatMap((g) => g.lines).find((l) => l.key === 'workshop.job.work');
    strict_1.default.equal(work.where, 'on work assigned to you');
    strict_1.default.equal(work.added, false);
    const extra = (0, describe_access_1.describeAccess)(who(['technician'], { extraGrants: { 'warranty.view': 'BRANCH' } }));
    const w = extra.flatMap((g) => g.lines).find((l) => l.key === 'warranty.view');
    strict_1.default.equal(w.added, true);
    strict_1.default.equal(w.where, 'in your branch');
    for (const g of tech)
        for (const l of g.lines)
            strict_1.default.equal(l.label, (0, describe_access_1.plainLabel)(catalogue_1.PERMISSIONS[l.key].label));
    strict_1.default.ok(!tech.flatMap((g) => g.lines).some((l) => / — |\(/.test(l.label)), 'labels are plain — no repeated scope or role hints');
    strict_1.default.deepEqual((0, describe_access_1.describeAccess)(who([], { isSuperAdmin: true })), [{ module: 'Platform', lines: [] }]);
});
(0, node_test_1.test)('welcome email: employee ID, roles, branch, access, sign-in steps, the rules — and nothing unescaped', () => {
    const { subject, html } = (0, staff_access_1.renderStaffAccessEmail)({
        kind: 'welcome', fullName: 'Ada <b>Obi</b>', email: 'ada@example.com', employeeId: 'KN-ISO-0007', companyName: 'Kewalram Nigeria',
        branchName: 'Isolo Branch', departmentName: 'Workshop', roles: ['Technician'], isPlatformTeam: false,
        access: (0, describe_access_1.describeAccess)(who(['technician'])), setPasswordUrl: 'https://portal.example/api/auth/reset-password/tok?callbackURL=%2Freset-password', setPasswordHours: 72,
        signInUrl: 'https://portal.example/login', logoUrl: 'https://portal.example/images/logo/logo.png',
    });
    strict_1.default.match(subject, /Welcome/);
    strict_1.default.ok(html.includes('KN-ISO-0007'));
    strict_1.default.ok(html.includes('Technician'));
    strict_1.default.ok(html.includes('Isolo Branch'));
    strict_1.default.ok(html.includes('Set my password'));
    strict_1.default.ok(html.includes('72 hours'));
    strict_1.default.ok(html.includes('https://portal.example/login'));
    strict_1.default.ok(html.includes('on work assigned to you'));
    for (const r of staff_access_1.STAFF_RULES)
        strict_1.default.ok(html.includes(r.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;')), `rule missing: ${r.slice(0, 30)}`);
    strict_1.default.ok(!html.includes('<b>Obi</b>'), 'names are escaped');
    const upd = (0, staff_access_1.renderStaffAccessEmail)({ kind: 'updated', fullName: 'Ada', email: 'ada@example.com', employeeId: null, companyName: 'K', branchName: null, departmentName: null, roles: [], isPlatformTeam: false, access: [], signInUrl: 'https://x/login', logoUrl: 'https://x/l.png', changeNote: 'You were given the role Store Officer.' });
    strict_1.default.match(upd.subject, /changed/);
    strict_1.default.ok(upd.html.includes('You were given the role Store Officer.'));
    strict_1.default.ok(!upd.html.includes('Set my password'), 'an access-changed email carries no password link');
});
(0, node_test_1.test)('version 1 menu: only live modules; everything planned is on the Roadmap, with a page each', () => {
    const admin = (0, navigation_1.navigationFor)(who(['administrator']));
    const master = (0, navigation_1.navigationFor)(who([], { isSuperAdmin: true }));
    for (const items of [admin, master])
        for (const i of items)
            strict_1.default.equal(i.status, 'LIVE', `${i.key} is shown but not live`);
    strict_1.default.ok(admin.some((i) => i.key === 'structure'), 'the organisation structure is in the menu for administrators');
    strict_1.default.ok(!(0, navigation_1.navigationFor)(who(['technician'])).some((i) => i.key === 'structure'), 'but not for a technician');
    const keys = roadmap_1.ROADMAP.map((m) => m.key);
    for (const k of ['hr', 'payroll', 'finance', 'procurement', 'suppliers', 'warehouse', 'manufacturing', 'documents', 'reports'])
        strict_1.default.ok(keys.includes(k), `${k} is on the roadmap`);
    strict_1.default.equal(new Set(keys).size, keys.length, 'roadmap keys are unique');
    for (const m of roadmap_1.ROADMAP) {
        strict_1.default.ok(m.phases.length > 0 && m.phases.every((p) => p.items.length > 0), `${m.key} says what it will do`);
        for (const c of m.connects)
            strict_1.default.match(c.href, /^\/[a-z]/, `${m.key} links inside the portal`);
    }
    const hr = roadmap_1.ROADMAP.find((m) => m.key === 'hr').phases.flatMap((p) => p.items).join(' ');
    for (const must of ['clock', 'QR', 'Lateness', 'Overtime', 'vehicle', 'Leave'])
        strict_1.default.match(hr, new RegExp(must, 'i'), `HR plan covers ${must}`);
    // Old addresses of planned modules lead to their roadmap page.
    const cfg = read('next.config.ts');
    for (const k of ['hr', 'payroll', 'finance'])
        strict_1.default.ok(cfg.includes(`'${k}'`), `/${k} redirects`);
    strict_1.default.equal((0, node_fs_1.existsSync)((0, node_path_1.join)(ROOT, 'components', 'PagePlaceholder.tsx')), false);
});
(0, node_test_1.test)('organisation structure: workflow departments are protected', () => {
    for (const slug of ['workshop', 'workshop-passenger', 'workshop-commercial', 'store'])
        strict_1.default.ok(structure_rules_1.SYSTEM_DEPARTMENT_SLUGS.has(slug), `${slug} is a system department`);
    const src = read('lib/actions/structure.ts');
    strict_1.default.match(src, /cannot be switched off/, 'system departments are never switched off');
    strict_1.default.match(src, /move them to another department first/, 'a department with people is never switched off');
});
(0, node_test_1.test)('live check: a cheap organisation-scoped GET, never a page-posting server action on a 3-second loop', () => {
    const provider = read('components/NotificationProvider.tsx');
    strict_1.default.ok(provider.includes("fetch('/api/live/pulse'"), 'the change check is a plain GET');
    strict_1.default.ok(!/getNotificationPulse/.test(provider), 'no server action POST to the page every few seconds');
    const ms = (name) => Number(new RegExp(`const ${name} = ([0-9_]+)`).exec(provider)?.[1]?.replace(/_/g, ''));
    strict_1.default.ok(ms('PULSE_MS') >= 10000, 'checks no more often than every 10 seconds');
    strict_1.default.ok(ms('PULSE_WHEN_IDLE_MS') >= 60000);
    strict_1.default.ok(ms('PAGE_REFRESH_GAP_MS') >= 30000, 'pages refresh at most every 30 s on organisation changes');
    strict_1.default.ok(ms('HEAVY_PAGE_REFRESH_GAP_MS') >= 120000, 'analytics pages recompute at most every 2 minutes');
    strict_1.default.ok(ms('MIN_LOAD_GAP_MS') >= 30000, 'the notification summary is fetched at most every 30 s');
    strict_1.default.ok(provider.includes("visibilityState === 'hidden'"), 'hidden tabs never check');
    const route = read('app/api/live/pulse/route.ts');
    strict_1.default.ok(/isActive/.test(route) && /401/.test(route), 'signed-out or switched-off people get 401');
    const pulse = read('lib/live-pulse.ts');
    strict_1.default.ok(/organisationId/.test(pulse), 'scoped to the organisation');
});
(0, node_test_1.test)('theme: Light / Dark / System, applied before paint, never trusting the cookie blindly', () => {
    strict_1.default.equal((0, theme_1.parseTheme)('dark'), 'dark');
    strict_1.default.equal((0, theme_1.parseTheme)('light'), 'light');
    strict_1.default.equal((0, theme_1.parseTheme)('"><script>'), 'system');
    strict_1.default.equal((0, theme_1.parseTheme)(undefined), 'system');
    strict_1.default.ok(theme_1.THEME_BOOT_SCRIPT.includes('(light|dark)'), 'the boot script accepts only the two values');
    strict_1.default.ok(read('app/layout.tsx').includes('THEME_BOOT_SCRIPT'));
    const css = read('app/globals.css');
    strict_1.default.ok(css.includes(":root[data-theme='dark']") && css.includes('prefers-color-scheme: dark'));
    strict_1.default.ok(read('components/Topbar.tsx').includes('<ThemeToggle'), 'the toggle is in the header on every page');
});
(0, node_test_1.test)('avatars: initials and a stable colour', () => {
    strict_1.default.equal((0, avatar_1.initialsOf)('Ada Grace Obi'), 'AO');
    strict_1.default.equal((0, avatar_1.initialsOf)('ada'), 'A');
    strict_1.default.equal((0, avatar_1.initialsOf)('  '), '?');
    strict_1.default.equal((0, avatar_1.colourOf)('ada obi'), (0, avatar_1.colourOf)('ada obi'));
});
(0, node_test_1.test)('deploys: pre-deploy SQL is additive and re-runnable, and runs before every production push', () => {
    const repo = (0, node_path_1.join)(ROOT, '..', '..');
    const dir = (0, node_path_1.join)(repo, 'scripts', 'predeploy');
    const { readdirSync } = require('node:fs');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
    strict_1.default.ok(files.length > 0);
    for (const f of files) {
        const sql = (0, node_fs_1.readFileSync)((0, node_path_1.join)(dir, f), 'utf8').replace(/--.*$/gm, '');
        strict_1.default.doesNotMatch(sql, /\b(DROP|DELETE|TRUNCATE|RENAME)\b|ALTER\s+COLUMN[\s\S]*?\bTYPE\b/i, `${f} must be additive only`);
        for (const m of sql.matchAll(/\b(CREATE(?:\s+UNIQUE)?\s+INDEX|ADD\s+COLUMN|CREATE\s+TABLE)\b(?!\s+IF\s+NOT\s+EXISTS)/gi))
            strict_1.default.fail(`${f}: "${m[0]}" must use IF NOT EXISTS`);
    }
    for (const f of readdirSync((0, node_path_1.join)(repo, 'scripts', 'postdeploy')).filter((x) => x.endsWith('.sql'))) {
        const sql = (0, node_fs_1.readFileSync)((0, node_path_1.join)(repo, 'scripts', 'postdeploy', f), 'utf8').replace(/--.*$/gm, '');
        // No statement that removes data or structure (trigger definitions may name the events they guard).
        strict_1.default.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN|SCHEMA|INDEX|TYPE|VIEW|FUNCTION|TRIGGER)\b|\bDELETE\s+FROM\b|^\s*TRUNCATE\b|\bALTER\s+TABLE[^;]*\bDISABLE\s+TRIGGER\b/im, `${f} must not remove anything`);
    }
    const rls = (0, node_fs_1.readFileSync)((0, node_path_1.join)(repo, 'scripts', 'postdeploy', '0001-rls-default-deny.sql'), 'utf8');
    strict_1.default.match(rls, /ENABLE ROW LEVEL SECURITY/);
    strict_1.default.match(rls, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon/);
    for (const s of ['db-push-if-render.js', 'db-push-if-vercel.js']) {
        const src = (0, node_fs_1.readFileSync)((0, node_path_1.join)(repo, 'scripts', s), 'utf8');
        strict_1.default.ok(src.indexOf('applyPostdeploySql();') > src.indexOf('execSync(`npx prisma db push'), `${s} applies row-level security after the push`);
        strict_1.default.ok(src.indexOf('applyPredeploySql();') > 0 && src.indexOf('applyPredeploySql();') < src.indexOf('execSync(`npx prisma db push'), `${s} runs the pre-deploy SQL first`);
        strict_1.default.doesNotMatch(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /--accept-data-loss/, `${s} never accepts data loss`);
    }
});
