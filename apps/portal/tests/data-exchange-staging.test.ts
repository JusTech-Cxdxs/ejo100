import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_STAGING_DAYS, releaseState, stagingDays } from '../lib/data-exchange/staging';
import { bytesText } from '../lib/data-exchange/status';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const day = 86_400_000;

test('the period: 30 days unless the organisation sets it; 0 keeps files for ever', () => {
  assert.equal(DEFAULT_STAGING_DAYS, 30);
  assert.equal(stagingDays(null), 30);
  assert.equal(stagingDays(undefined), 30);
  assert.equal(stagingDays(0), 0);
  assert.equal(stagingDays(7), 7);
  assert.equal(stagingDays(99999), 3650);
  assert.equal(stagingDays(-3), 0);
});

test('only a finished import is released, and Finance signs off first where it must', () => {
  const done = new Date('2026-10-01T10:00:00Z');
  const base = { entity: 'customers', status: 'COMPLETED', completedAt: done, signedOffAt: null, rowsReleasedAt: null };
  assert.deepEqual(releaseState(base, 30), { releasable: true, why: null, dueAt: new Date(+done + 30 * day) });
  assert.equal(releaseState({ ...base, status: 'LOADING' }, 30).releasable, false);
  assert.equal(releaseState({ ...base, status: 'UNDONE' }, 30).releasable, false);
  assert.equal(releaseState({ ...base, rowsReleasedAt: done }, 30).why, 'Already released.');
  assert.equal(releaseState(base, 0).dueAt, null, 'kept for ever: never released automatically');
  // Opening stock and invoice history: from Finance's confirmation, never before it.
  assert.equal(releaseState({ ...base, entity: 'stock' }, 30).why, 'Finance confirms the totals first.');
  const signed = new Date(+done + 5 * day);
  assert.equal(+releaseState({ ...base, entity: 'invoices', signedOffAt: signed }, 30).dueAt!, +signed + 30 * day);
});

test('releasing clears only what nothing needs; the report, rejects, possible duplicates and undo keep theirs', () => {
  const src = read('lib/data-exchange/staging-server.ts');
  const sql = src.slice(src.indexOf('UPDATE import_rows SET cells'), src.indexOf('LIMIT ${RELEASE_BATCH}'));
  assert.match(sql, /status NOT IN \('REJECTED', 'DUPLICATE', 'PENDING'\)/);
  assert.match(sql, /COALESCE\("matchedBy", ''\) <> 'phone'/);
  assert.match(sql, /NOT \(status = 'UPDATED' AND cardinality\(filled\) > 0\)/);
  assert.doesNotMatch(src, /importRow\.delete|DELETE FROM/);
  const actions = read('lib/actions/data-exchange.ts');
  assert.match(actions, /if \(job\.rowsReleasedAt\) throw new DataExchangeError\('This import’s file was released/);
  assert.match(actions, /export async function releaseImportRows\([\s\S]{0,400}await authorize\('dataexchange\.import\.approve'/);
  assert.match(actions, /export async function setImportStagingDays\([\s\S]{0,300}await authorize\('admin\.settings\.manage'/);
  assert.match(read('app/api/cron/pricing-alerts/route.ts'), /releaseExpiredStagedRows\(\)/);
});

test('sizes read as people read them', () => {
  assert.equal(bytesText(0), '0 B');
  assert.equal(bytesText(1536), '1.5 KB');
  assert.equal(bytesText(4_300_000), '4.1 MB');
  assert.equal(bytesText(537_870_336), '513 MB');
  assert.equal(bytesText(null), '—');
});
