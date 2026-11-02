/**
 * Free-plan fit: the database's space against its plan (Supabase Free: 500 MB),
 * and upload blocks that stay inside Next's 1 MB server-action limit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BYTES_PER_RECORD, IMPORT_CEILING, PAUSE_AT, importFits, importNeedsBytes, recordsThatFit, shouldPauseLoad, spaceLimitBytes, spaceOf, stagingFits } from '../lib/database-space-core';
import { BLOCK_BYTES, ROW_BYTES_MAX, jsonStringBytes, rowBytes } from '../lib/data-exchange/block-size';

const MB = 1024 * 1024;
const src = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');

test('the limit: 500 MB by default (the free plan), any number of MB, 0 switches the checks off', () => {
  assert.equal(spaceLimitBytes(undefined), 500 * MB);
  assert.equal(spaceLimitBytes(''), 500 * MB);
  assert.equal(spaceLimitBytes('8192'), 8192 * MB);
  assert.equal(spaceLimitBytes('0'), null);
  assert.equal(spaceLimitBytes('lots'), 500 * MB, 'a typo keeps the safe default');
  assert.equal(spaceLimitBytes('-5'), 500 * MB);
});

test('levels: fine below 80%, a warning from 80%, full from 95%; no limit means unlimited', () => {
  assert.equal(spaceOf(100 * MB, 500 * MB).level, 'ok');
  assert.equal(spaceOf(400 * MB, 500 * MB).level, 'warn');
  assert.equal(spaceOf(480 * MB, 500 * MB).level, 'full');
  assert.equal(spaceOf(480 * MB, null).level, 'unlimited');
  assert.equal(spaceOf(600 * MB, 500 * MB).freeBytes, 0);
});

test('an import is refused when it would take the database past 95%, with what to do and how many fit', () => {
  const space = spaceOf(200 * MB, 500 * MB);
  assert.deepEqual(importFits(space, 'parts', 50_000), { ok: true }, '50,000 parts (about 95 MB) fit in 300 MB');
  const big = importFits(space, 'parts', 800_000, 'parts');
  assert.equal(big.ok, false);
  if (!big.ok) {
    assert.match(big.message, /^Not enough database space\. Loading 800,000 parts needs about 1,526 MB/);
    assert.match(big.message, /200 MB of its 500 MB plan/);
    assert.match(big.message, /about 144,179 more parts fit/);
    assert.match(big.message, /bigger plan/);
  }
  assert.equal(recordsThatFit(space, 'parts'), Math.floor((500 * MB * IMPORT_CEILING - 200 * MB) / BYTES_PER_RECORD.parts!));
  assert.deepEqual(importFits(spaceOf(200 * MB, null), 'parts', 10_000_000), { ok: true }, 'no limit: never refused');
  assert.equal(importNeedsBytes('stock', 10), 10 * BYTES_PER_RECORD.stock!);
  assert.equal(importNeedsBytes('anything-new', 10), 30_000, 'an unknown kind is counted generously');
});

test('staging refuses a block only when the database is nearly full; a load pauses at 97%', () => {
  assert.deepEqual(stagingFits(spaceOf(100 * MB, 500 * MB), 5000), { ok: true });
  const full = stagingFits(spaceOf(475 * MB, 500 * MB), 5000);
  assert.equal(full.ok, false);
  assert.equal(shouldPauseLoad(spaceOf(500 * MB * PAUSE_AT - 1, 500 * MB)), false);
  assert.equal(shouldPauseLoad(spaceOf(500 * MB * PAUSE_AT, 500 * MB)), true);
  assert.equal(shouldPauseLoad(spaceOf(10_000 * MB, null)), false);
});

test('upload blocks are measured as the UTF-8 bytes of their JSON, so they stay under 1 MB in any language', () => {
  for (const s of ['', 'BRAKE PAD', 'Café', '刹车片 前', '😀 emoji', 'quote " and \\ backslash', 'tab\tnew\nline', '₦45,000']) {
    assert.ok(jsonStringBytes(s) >= Buffer.byteLength(JSON.stringify(s), 'utf8'), `${JSON.stringify(s)}: never under-counted`);
  }
  assert.equal(jsonStringBytes('abc'), Buffer.byteLength(JSON.stringify('abc')));
  assert.equal(jsonStringBytes('刹车片'), Buffer.byteLength(JSON.stringify('刹车片')));
  // A worst case block: Chinese descriptions, quotes, many columns — built the way the uploader builds it.
  const cells = ['8-97366-430-0', '刹车片 前轴 "原厂" Soueast S07 ' + '配件'.repeat(40), 'ZERS', 'PC', '45000.00', 'NGN', '₦ price "incl. VAT"'];
  const block: { rowNumber: number; cells: string[] }[] = [];
  let bytes = 0;
  for (let n = 2; n < 100_000 && block.length < 5000; n += 1) {
    const row = { rowNumber: n, cells };
    const size = rowBytes(row);
    if (block.length && bytes + size > BLOCK_BYTES) break;
    block.push(row); bytes += size;
  }
  const sent = Buffer.byteLength(JSON.stringify([`job-id-${'x'.repeat(25)}`, block]), 'utf8');
  assert.ok(sent < 1_000_000, `a full block is ${sent} bytes: under Next’s 1 MB`);
  assert.ok(bytes >= sent - 200, 'the estimate is not far below what is sent');
  assert.ok(ROW_BYTES_MAX < 1_000_000);
});

test('wired in: staging, sending for approval, approving, starting, each load step and resuming check the space', () => {
  const a = src('lib/actions/data-exchange.ts');
  assert.match(a, /const room = stagingFits\(await readDatabaseSpace\(\), data\.length\);\n\s*if \(!room\.ok\) return \{ received: 0, stop: room\.message \};/);
  const body = (name: string) => a.slice(a.indexOf(`export async function ${name}(`), a.indexOf('\nexport async function', a.indexOf(`export async function ${name}(`) + 10));
  assert.match(body('submitImportForApproval'), /refuseIfNoRoom\(job, await readDatabaseSpace\(\{ fresh: true \}\)\)/);
  assert.match(body('approveImport'), /refuseIfNoRoom\(job, await readDatabaseSpace\(\{ fresh: true \}\)\)/);
  assert.match(body('loadImportBatch'), /refuseIfNoRoom\(job, await readDatabaseSpace\(\{ fresh: true \}\)\)/);
  assert.match(body('loadImportBatch'), /if \(shouldPauseLoad\(space\)\)/);
  assert.match(body('resumeImport'), /if \(shouldPauseLoad\(space\)\) throw/);
  assert.match(body('getImportJob'), /room: \[/);
  const view = src('components/data-exchange/ImportJobView.tsx');
  assert.equal((view.match(/!job\.room\.ok\}/g) ?? []).length, 4, 'Send, Approve, Start loading and Resume wait for room');
  const up = src('components/data-exchange/ImportUploader.tsx');
  assert.match(up, /if \(res\.stop\) throw new Error\(res\.stop\);/);
  assert.match(up, /rowBytes\(row\)/);
  assert.doesNotMatch(up, /BLOCK_CHARS/);
});

test('Hobby plan: no function runs longer than 300 s, and the scheduled jobs run at most daily', () => {
  const { execSync } = require('node:child_process') as typeof import('node:child_process');
  const root = join(__dirname, '..', '..');
  const lines = execSync('grep -rhoE "export const maxDuration = [0-9]+" app', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  assert.ok(lines.length > 0);
  for (const l of lines) assert.ok(Number(l.split('=')[1]) <= 300, l);
  const v = JSON.parse(src('vercel.json')) as { crons?: { schedule: string }[] };
  for (const c of v.crons ?? []) {
    const [min, hour] = c.schedule.split(' ');
    assert.match(min!, /^\d+$/, `${c.schedule}: a fixed minute`);
    assert.match(hour!, /^\d+$/, `${c.schedule}: once a day (Hobby allows no more)`);
  }
});
