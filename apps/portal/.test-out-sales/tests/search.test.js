"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * The header search's query planner: every reference prefix is searchable
 * on its own, by full number and by its running number; names, plates and
 * phones go to the right fields; and nothing is skipped because a query has
 * no digits ("VX", "RT", "PRS").
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const search_plan_1 = require("../lib/search-plan");
const ROOT = (0, node_path_1.join)(__dirname, '..', '..');
(0, node_test_1.test)('"VX" is a prefix: the newest vehicle exits, plus names', () => {
    const p = (0, search_plan_1.planSearch)('VX');
    strict_1.default.equal(p.kind, 'prefix');
    strict_1.default.deepEqual(p.prefixes, ['VX']);
    strict_1.default.equal(p.textScope, 'all');
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, 'VX'), [{ startsWith: 'VX-' }]);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, 'JC'), [], 'other tables are not asked by number');
    strict_1.default.equal(p.take, 5);
});
(0, node_test_1.test)('"vx-2026" is that year’s vehicle exits, in any case', () => {
    const p = (0, search_plan_1.planSearch)('vx-2026');
    strict_1.default.equal(p.kind, 'reference');
    strict_1.default.deepEqual(p.prefixes, ['VX']);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, 'VX'), [{ startsWith: 'VX-2026' }, { startsWith: 'VX-', endsWith: '-002026' }]);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)((0, search_plan_1.planSearch)('VX 2026'), 'VX'), (0, search_plan_1.numberFilters)(p, 'VX'));
});
(0, node_test_1.test)('"V" (one letter) reaches every V-prefixed type, with fewer results', () => {
    const p = (0, search_plan_1.planSearch)('V');
    strict_1.default.equal(p.kind, 'prefix');
    strict_1.default.deepEqual([...p.prefixes].sort(), ['VIS', 'VP', 'VX']);
    strict_1.default.equal(p.short, true);
    strict_1.default.equal(p.take, 3);
    for (const x of ['VIS', 'VP', 'VX'])
        strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, x), [{ startsWith: `${x}-` }]);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, 'SV'), []);
});
(0, node_test_1.test)('"RT-2026-000003" is exactly that road test, typed any way', () => {
    for (const q of ['RT-2026-000003', 'rt-2026-000003', 'RT2026000003', 'rt 2026 000003', ' RT-2026-000003 ']) {
        const p = (0, search_plan_1.planSearch)(q);
        strict_1.default.equal(p.kind, 'reference', q);
        strict_1.default.deepEqual(p.prefixes, ['RT'], q);
        strict_1.default.equal(p.textScope, 'none', `${q}: a complete number needs no name search`);
        strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, 'RT'), [{ equals: 'RT-2026-000003' }], q);
        strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, 'EP'), [], q);
    }
});
(0, node_test_1.test)('a number being typed still finds it: "RT-2026-0000", "JC-2026-12"', () => {
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)((0, search_plan_1.planSearch)('RT-2026-0000'), 'RT'), [{ startsWith: 'RT-2026-0000' }, { equals: 'RT-2026-000000' }]);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)((0, search_plan_1.planSearch)('JC-2026-12'), 'JC'), [{ startsWith: 'JC-2026-12' }, { equals: 'JC-2026-000012' }]);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)((0, search_plan_1.planSearch)('VX-20'), 'VX'), [{ startsWith: 'VX-20' }, { startsWith: 'VX-', endsWith: '-000020' }]);
});
(0, node_test_1.test)('"000003" searches the running number of every type', () => {
    const p = (0, search_plan_1.planSearch)('000003');
    strict_1.default.equal(p.kind, 'number');
    strict_1.default.deepEqual(p.prefixes, search_plan_1.REFERENCE_PREFIXES);
    strict_1.default.equal(p.textScope, 'codes');
    for (const x of search_plan_1.REFERENCE_PREFIXES)
        strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, x), [{ startsWith: `${x}-`, endsWith: '-000003' }]);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)((0, search_plan_1.planSearch)('12'), 'GRN'), [{ startsWith: 'GRN-', endsWith: '-000012' }]);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)((0, search_plan_1.planSearch)('2026-000003'), 'DLV'), [{ equals: 'DLV-2026-000003' }]);
});
(0, node_test_1.test)('"KJA-219" is a plate, not a reference: names and codes, no number columns', () => {
    const p = (0, search_plan_1.planSearch)('KJA-219');
    strict_1.default.equal(p.kind, 'text');
    strict_1.default.equal(p.textScope, 'all');
    strict_1.default.equal(p.compact, 'KJA219');
    strict_1.default.deepEqual(p.codeForms, ['KJA-219', 'KJA219']);
    strict_1.default.deepEqual((0, search_plan_1.planSearch)('kja219gx').codeForms, ['kja219gx', 'KJA-219GX'], 'typed without the dash still finds KJA-219GX');
    for (const x of search_plan_1.REFERENCE_PREFIXES)
        strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, x), []);
});
(0, node_test_1.test)('"Ada" is a name', () => {
    const p = (0, search_plan_1.planSearch)('Ada');
    strict_1.default.equal(p.kind, 'text');
    strict_1.default.deepEqual(p.prefixes, []);
    strict_1.default.deepEqual(p.phones, []);
    strict_1.default.equal(p.take, 5);
});
(0, node_test_1.test)('"08031234567" is a phone (both local and international forms) and asks no name fields', () => {
    const p = (0, search_plan_1.planSearch)('08031234567');
    strict_1.default.equal(p.kind, 'number');
    strict_1.default.equal(p.textScope, 'codes');
    strict_1.default.ok(p.phones.includes('08031234567'));
    strict_1.default.ok(p.phones.includes('8031234567'), '+234 803… matches too');
    for (const x of search_plan_1.REFERENCE_PREFIXES)
        strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, x), [], 'too long to be a running number');
    strict_1.default.ok((0, search_plan_1.planSearch)('+2348031234567').phones.includes('08031234567'));
});
(0, node_test_1.test)('"PRS" is a prefix; "EP" also reaches EPR (it starts with EP), exact match first', () => {
    const prs = (0, search_plan_1.planSearch)('PRS');
    strict_1.default.equal(prs.kind, 'prefix');
    strict_1.default.deepEqual(prs.prefixes, ['PRS']);
    strict_1.default.deepEqual((0, search_plan_1.planSearch)('ep').prefixes, ['EP', 'EPR']);
    strict_1.default.deepEqual((0, search_plan_1.planSearch)('jc-').prefixes, ['JC']);
});
(0, node_test_1.test)('"epr 12" is EPR number …-000012 of any year', () => {
    const p = (0, search_plan_1.planSearch)('epr 12');
    strict_1.default.equal(p.kind, 'reference');
    strict_1.default.deepEqual(p.prefixes, ['EPR']);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, 'EPR'), [{ startsWith: 'EPR-', endsWith: '-000012' }]);
    strict_1.default.deepEqual((0, search_plan_1.numberFilters)(p, 'EP'), []);
});
(0, node_test_1.test)('empty and hostile input', () => {
    strict_1.default.equal((0, search_plan_1.planSearch)('').kind, 'empty');
    strict_1.default.equal((0, search_plan_1.planSearch)('   ').kind, 'empty');
    strict_1.default.equal((0, search_plan_1.planSearch)('a'.repeat(300)).q.length, 60);
    strict_1.default.equal((0, search_plan_1.planSearch)(`'%_\\`).kind, 'text');
});
(0, node_test_1.test)('the groups the query points at come first', () => {
    const p = (0, search_plan_1.planSearch)('VX');
    strict_1.default.ok((0, search_plan_1.groupRank)(p, 'Vehicle exits') < (0, search_plan_1.groupRank)(p, 'Pages'));
    strict_1.default.equal((0, search_plan_1.groupRank)((0, search_plan_1.planSearch)('Ada'), 'Vehicle exits'), (0, search_plan_1.groupRank)((0, search_plan_1.planSearch)('Ada'), 'Pages'));
});
(0, node_test_1.test)('one list of prefixes: the pattern, the URLs and every generator agree', () => {
    strict_1.default.equal(new Set(search_plan_1.REFERENCE_PREFIXES).size, search_plan_1.REFERENCE_PREFIXES.length);
    for (const x of search_plan_1.REFERENCE_PREFIXES)
        strict_1.default.ok(`${x}-2026-000001`.match(new RegExp(`^${search_plan_1.REFERENCE_PATTERN.source}$`)), x);
    // Every prefix a generator writes (`XX-${year}-` or nextNumber('XX')) is in the list.
    const src = (0, node_fs_1.readdirSync)((0, node_path_1.join)(ROOT, 'lib', 'actions')).filter((f) => f.endsWith('.ts')).map((f) => (0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'lib', 'actions', f), 'utf8')).join('\n');
    const generated = new Set([...src.matchAll(/`([A-Z]{2,3})-\$\{(?:year|lagosYear\(\))\}-`/g)].map((m) => m[1]));
    for (const m of src.matchAll(/nextNumber\('([A-Z]{2,3})'\)/g))
        generated.add(m[1]);
    strict_1.default.ok(generated.size >= 15, `found ${generated.size} generators`);
    for (const g of generated)
        strict_1.default.ok(search_plan_1.REFERENCE_PREFIXES.includes(g), `${g} is generated but not searchable`);
});
(0, node_test_1.test)('every record link points at a real page', () => {
    const app = (0, node_path_1.join)(ROOT, 'app', '(app)');
    for (const t of search_plan_1.REFERENCE_TYPES) {
        if (t.prefix === 'RF')
            continue; // opens on its Job Card / Vehicle Service
        const dir = (0, node_path_1.join)(app, (0, search_plan_1.referenceUrl)(t.prefix, '[id]'));
        strict_1.default.ok((0, node_fs_1.statSync)((0, node_path_1.join)(dir, 'page.tsx')).isFile(), `${t.prefix} → ${dir}`);
    }
});
(0, node_test_1.test)('highlighting finds the query however it was typed', () => {
    strict_1.default.deepEqual((0, search_plan_1.matchRanges)('VX-2026-000012', 'vx'), [[0, 2]]);
    strict_1.default.deepEqual((0, search_plan_1.matchRanges)('VX-2026-000012', 'vx2026'), [[0, 7]]);
    strict_1.default.deepEqual((0, search_plan_1.matchRanges)('RT-2026-000003', 'rt 3'), [[0, 2], [8, 14]]);
    strict_1.default.deepEqual((0, search_plan_1.matchRanges)('Ada Customer', 'cust'), [[4, 8]]);
    strict_1.default.deepEqual((0, search_plan_1.matchRanges)('Ada Customer', 'zzz'), []);
});
