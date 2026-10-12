/**
 * The data journal (src/audit-journal.ts) under the integrity rules:
 *  • a compare-and-set write (updateMany on one id) keeps its before/after values;
 *  • a compare-and-set that lost (count 0) records nothing;
 *  • a transaction that rolls back records nothing; one that commits records
 *    its writes, right after the commit (never as a query inside it).
 * Uses a small stand-in for the Prisma client — no database or engine needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installAuditJournal, setAuditActor } from '../src/audit-journal';

type Params = { model?: string; action: string; args: Record<string, unknown>; runInTransaction: boolean; dataPath: string[] };
type Mw = (params: Params, next: (p: Params) => Promise<unknown>) => Promise<unknown>;

function fakeClient() {
  const rows: Record<string, Record<string, unknown>> = { 'jc-1': { id: 'jc-1', status: 'PENDING', title: 'A' } };
  const journal: Record<string, unknown>[] = [];
  const queriesInsideTx: string[] = [];
  let mw: Mw | null = null;
  let inTx = false;
  const exec = async (p: Params): Promise<unknown> => {
    if (p.runInTransaction && p.model === 'AuditLog') queriesInsideTx.push(p.action);
    if (p.model === 'AuditLog') {
      const data = p.args.data as Record<string, unknown> | Record<string, unknown>[];
      journal.push(...(Array.isArray(data) ? data : [data]));
      return { count: Array.isArray(data) ? data.length : 1 };
    }
    if (p.action === 'findUnique') { const r = rows[(p.args.where as { id: string }).id]; return r ? { ...r } : null; }
    if (p.action === 'updateMany') {
      const w = p.args.where as { id: string; status?: string };
      const r = rows[w.id];
      if (!r || (w.status !== undefined && r.status !== w.status)) return { count: 0 };
      Object.assign(r, p.args.data);
      return { count: 1 };
    }
    return null;
  };
  const call = (model: string, action: string, args: Record<string, unknown>) =>
    mw!({ model, action, args, runInTransaction: inTx, dataPath: [] }, exec);
  const delegate = (model: string) => ({
    findUnique: (args: Record<string, unknown>) => call(model, 'findUnique', args),
    updateMany: (args: Record<string, unknown>) => call(model, 'updateMany', args),
    create: (args: Record<string, unknown>) => call(model, 'create', args),
    createMany: (args: Record<string, unknown>) => call(model, 'createMany', args),
  });
  const client = {
    $use: (fn: Mw) => { mw = fn; },
    jobCard: delegate('JobCard'),
    auditLog: delegate('AuditLog'),
    user: { findUnique: async () => ({ organisationId: 'org-1' }) },
    organisation: { findMany: async () => [{ id: 'org-1' }] },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      inTx = true;
      try { return await fn({ jobCard: delegate('JobCard') }); } finally { inTx = false; }
    },
  };
  installAuditJournal(client as never);
  return { client: client as unknown as typeof client, rows, journal, queriesInsideTx };
}

test('a compare-and-set write keeps its before and after values', async () => {
  const { client, journal } = fakeClient();
  setAuditActor('u-1', 'test', 'org-1');
  await client.jobCard.updateMany({ where: { id: 'jc-1', status: 'PENDING' }, data: { status: 'APPROVED' } });
  const entry = journal.find((j) => j.action === 'data.updateMany');
  assert.ok(entry, 'journaled');
  const meta = entry.metadata as { before: { status: string }; after: { status: string }; count: number };
  assert.equal(meta.before.status, 'PENDING');
  assert.equal(meta.after.status, 'APPROVED');
  assert.equal(meta.count, 1);
  assert.equal(entry.entityId, 'jc-1');
});

test('a compare-and-set that lost the race records nothing', async () => {
  const { client, journal } = fakeClient();
  setAuditActor('u-1', 'test', 'org-1');
  const r = await client.jobCard.updateMany({ where: { id: 'jc-1', status: 'SOMETHING_ELSE' }, data: { status: 'APPROVED' } });
  assert.deepEqual(r, { count: 0 });
  assert.equal(journal.filter((j) => j.action === 'data.updateMany').length, 0);
});

test('a rolled-back transaction leaves nothing in the journal', async () => {
  const { client, journal } = fakeClient();
  setAuditActor('u-1', 'test', 'org-1');
  await assert.rejects(client.$transaction(async (tx: unknown) => {
    const t = tx as { jobCard: { updateMany: (a: unknown) => Promise<unknown> } };
    await t.jobCard.updateMany({ where: { id: 'jc-1', status: 'PENDING' }, data: { status: 'APPROVED' } });
    throw new Error('refused after the write');
  }), /refused/);
  await client.auditLog.create({ data: { action: 'business.entry' } }); // the next ordinary query
  assert.equal(journal.filter((j) => j.action === 'data.updateMany').length, 0);
});

test('a committed transaction is journaled once, after the commit, never from inside it', async () => {
  const { client, journal, queriesInsideTx } = fakeClient();
  setAuditActor('u-1', 'test', 'org-1');
  await client.$transaction(async (tx: unknown) => {
    const t = tx as { jobCard: { updateMany: (a: unknown) => Promise<unknown> } };
    await t.jobCard.updateMany({ where: { id: 'jc-1', status: 'PENDING' }, data: { status: 'APPROVED' } });
  });
  assert.equal(journal.filter((j) => j.action === 'data.updateMany').length, 1);
  assert.deepEqual(queriesInsideTx, []);
});

test('during an assisted session every entry names the colleague and the assistant', async () => {
  const { client, journal } = fakeClient();
  setAuditActor('colleague-1', 'portal', 'org-1', { assistedBy: { id: 'assistant-1', name: 'Ada Okafor' }, assistSessionId: 'as-1' });
  await client.jobCard.updateMany({ where: { id: 'jc-1', status: 'PENDING' }, data: { status: 'APPROVED' } });
  await client.$transaction(async (tx: unknown) => {
    const t = tx as { jobCard: { updateMany: (a: unknown) => Promise<unknown> } };
    await t.jobCard.updateMany({ where: { id: 'jc-1', status: 'APPROVED' }, data: { status: 'DONE' } });
  });
  const entries = journal.filter((j) => j.action === 'data.updateMany');
  assert.equal(entries.length, 2);
  for (const e of entries) {
    assert.equal(e.userId, 'colleague-1');
    const meta = e.metadata as { assistedBy?: { id: string; name: string }; assistSessionId?: string };
    assert.deepEqual(meta.assistedBy, { id: 'assistant-1', name: 'Ada Okafor' });
    assert.equal(meta.assistSessionId, 'as-1');
  }
  // Back to working alone: no assistant on the entry.
  setAuditActor('colleague-1', 'portal', 'org-1');
  await client.jobCard.updateMany({ where: { id: 'jc-1', status: 'DONE' }, data: { status: 'PENDING' } });
  const last = journal.filter((j) => j.action === 'data.updateMany').at(-1)!;
  assert.equal((last.metadata as { assistedBy?: unknown }).assistedBy, undefined);
});
