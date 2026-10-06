/**
 * Architecture guard (Baseline v1, §8): every table in schema.prisma is
 * declared in the data inventory — owner, classification, lifecycle,
 * retention and AI access — and its declared owner column really exists.
 * Adding a table without deciding who owns it fails CI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_INVENTORY } from '../lib/governance/data-inventory';

const SCHEMA = readFileSync(join(__dirname, '..', '..', '..', '..', 'packages', 'database', 'prisma', 'schema.prisma'), 'utf8');
const models = new Map<string, string[]>();
for (const m of SCHEMA.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
  models.set(m[1]!, m[2]!.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('@@') && !l.startsWith('//')).map((l) => l.split(/\s+/)[0]!));
}

test('every table is declared in the data inventory', () => {
  const missing = [...models.keys()].filter((m) => !(m in DATA_INVENTORY));
  assert.deepEqual(missing, [], `Declare these tables in lib/governance/data-inventory.ts (who owns them, how sensitive, how they end, how long kept, AI access):\n${missing.join('\n')}`);
});

test('the inventory has no tables that no longer exist', () => {
  const stale = Object.keys(DATA_INVENTORY).filter((m) => !models.has(m));
  assert.deepEqual(stale, [], `Remove from the data inventory: ${stale.join(', ')}`);
});

test("each table's declared owner column exists, and matches its tenancy", () => {
  const wrong: string[] = [];
  const expected: Record<string, string> = { ORGANISATION: 'organisationId', BRANCH: 'branchId', DEPARTMENT: 'departmentId' };
  for (const [name, e] of Object.entries(DATA_INVENTORY)) {
    const fields = models.get(name);
    if (!fields) continue;
    if (e.tenancy !== 'GLOBAL' && e.tenancy !== 'PLATFORM' && !e.owner) wrong.push(`${name}: ${e.tenancy} needs an owner column`);
    if (e.owner && !fields.includes(e.owner)) wrong.push(`${name}: owner column "${e.owner}" not in the table`);
    if (expected[e.tenancy] && e.owner !== expected[e.tenancy] && !(name === 'Organisation' && e.owner === 'id')) wrong.push(`${name}: ${e.tenancy} tables are fenced by ${expected[e.tenancy]}`);
  }
  assert.deepEqual(wrong, [], wrong.join('\n'));
});

test('secrets are never available to AI, and financial / audit records are never deletable', () => {
  const bad: string[] = [];
  for (const [name, e] of Object.entries(DATA_INVENTORY)) {
    if (e.classification.includes('SECRET') && e.ai !== 'NEVER') bad.push(`${name}: secrets must be ai: NEVER`);
    if ((name === 'Payment' || name === 'Refund' || name === 'AuditLog' || name === 'GoodsReceipt') && e.lifecycle !== 'IMMUTABLE') bad.push(`${name}: must be IMMUTABLE`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});
