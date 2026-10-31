import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Compiled to apps/portal/.test-out/tests: two levels up is apps/portal.
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

test('undoing an import moves its records to the Recycle bin; it never deletes them outright', () => {
  const src = read('lib/actions/data-exchange.ts');
  const undo = src.slice(src.indexOf('export async function undoImportBatch('), src.indexOf('// ── Dashboard'));
  assert.match(undo, /moveManyToBinInTx\(tx, entity === 'customers' \? 'Customer' : 'CustomerVehicle', \[\.\.\.mine\], `Undo of import \$\{job\.number\}`, userId\)/);
  assert.doesNotMatch(undo, /tx\.customer\.deleteMany|tx\.customerVehicle\.deleteMany/);
  // Only what this import made.
  assert.match(undo, /importJobId: job\.id/);
  // A record that got work recorded meanwhile is kept and reported, not lost or retried for ever.
  assert.match(undo, /data: \{ status: 'KEPT' \}/);
});

test('the batch bin move keeps the single-delete snapshot and rules, one restorable item per record', () => {
  const src = read('lib/recycle-bin/server.ts');
  const fn = src.slice(src.indexOf('export async function moveManyToBinInTx('), src.indexOf('// ── Restore'));
  assert.match(fn, /lockExisting\(tx, LOCK\[entity\], ids\)/);
  // The same snapshot shape restore reads, built with orderedSnapshot.
  assert.match(fn, /orderedSnapshot\('Customer', \[/);
  assert.match(fn, /orderedSnapshot\('CustomerVehicle', \[/);
  // The same eligibility as a single delete: no jobs, services, warranties, claims, gate exits, road tests; never signed in.
  for (const k of ['jobCards: { none: {} }', 'vehicleServices: { none: {} }', 'warranties: { none: {} }', 'warrantyClaims: { none: {} }', 'gateExits: { none: {} }', 'roadTestPermits: { none: {} }', 'sessions: { none: {} }', 'lastLoginAt: null']) {
    assert.ok(fn.includes(k), k);
  }
  // The bin item comes first, then the delete.
  assert.ok(fn.indexOf('recycleBinItem.createMany') < fn.indexOf('tx.customer.deleteMany'));
  assert.ok(fn.indexOf('recycleBinItem.createMany') < fn.indexOf('tx.customerVehicle.deleteMany'));
});
