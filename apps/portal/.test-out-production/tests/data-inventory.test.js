"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Architecture guard (Baseline v1, §8): every table in schema.prisma is
 * declared in the data inventory — owner, classification, lifecycle,
 * retention and AI access — and its declared owner column really exists.
 * Adding a table without deciding who owns it fails CI.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const data_inventory_1 = require("../lib/governance/data-inventory");
const SCHEMA = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '..', '..', '..', '..', 'packages', 'database', 'prisma', 'schema.prisma'), 'utf8');
const models = new Map();
for (const m of SCHEMA.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
    models.set(m[1], m[2].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('@@') && !l.startsWith('//')).map((l) => l.split(/\s+/)[0]));
}
(0, node_test_1.test)('every table is declared in the data inventory', () => {
    const missing = [...models.keys()].filter((m) => !(m in data_inventory_1.DATA_INVENTORY));
    strict_1.default.deepEqual(missing, [], `Declare these tables in lib/governance/data-inventory.ts (who owns them, how sensitive, how they end, how long kept, AI access):\n${missing.join('\n')}`);
});
(0, node_test_1.test)('the inventory has no tables that no longer exist', () => {
    const stale = Object.keys(data_inventory_1.DATA_INVENTORY).filter((m) => !models.has(m));
    strict_1.default.deepEqual(stale, [], `Remove from the data inventory: ${stale.join(', ')}`);
});
(0, node_test_1.test)("each table's declared owner column exists, and matches its tenancy", () => {
    const wrong = [];
    const expected = { ORGANISATION: 'organisationId', BRANCH: 'branchId', DEPARTMENT: 'departmentId' };
    for (const [name, e] of Object.entries(data_inventory_1.DATA_INVENTORY)) {
        const fields = models.get(name);
        if (!fields)
            continue;
        if (e.tenancy !== 'GLOBAL' && e.tenancy !== 'PLATFORM' && !e.owner)
            wrong.push(`${name}: ${e.tenancy} needs an owner column`);
        if (e.owner && !fields.includes(e.owner))
            wrong.push(`${name}: owner column "${e.owner}" not in the table`);
        if (expected[e.tenancy] && e.owner !== expected[e.tenancy] && !(name === 'Organisation' && e.owner === 'id'))
            wrong.push(`${name}: ${e.tenancy} tables are fenced by ${expected[e.tenancy]}`);
    }
    strict_1.default.deepEqual(wrong, [], wrong.join('\n'));
});
(0, node_test_1.test)('secrets are never available to AI, and financial / audit records are never deletable', () => {
    const bad = [];
    for (const [name, e] of Object.entries(data_inventory_1.DATA_INVENTORY)) {
        if (e.classification.includes('SECRET') && e.ai !== 'NEVER')
            bad.push(`${name}: secrets must be ai: NEVER`);
        if ((name === 'Payment' || name === 'Refund' || name === 'AuditLog' || name === 'GoodsReceipt') && e.lifecycle !== 'IMMUTABLE')
            bad.push(`${name}: must be IMMUTABLE`);
    }
    strict_1.default.deepEqual(bad, [], bad.join('\n'));
});
