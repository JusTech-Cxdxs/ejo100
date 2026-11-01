/**
 * Data Exchange — the staged copy of an import's file (server only, never a
 * 'use server' file). An import keeps every row of its file while it is
 * checked, approved and loaded. Once it is finished — and, for opening stock
 * and invoice history, its totals are signed off by Finance — the copy is
 * released after the organisation's period (30 days unless set otherwise; 0
 * keeps it for ever), or earlier by an approver.
 *
 * Releasing clears the file's cells from rows that no longer need them. What
 * stays: the import's summary and counts; every row's outcome (status, the
 * record it made, its notes) for the report; and the full row wherever it is
 * still needed — rejected and duplicate rows (to fix in Excel), possible
 * duplicates (to follow up), and rows whose filled-in fields an undo would
 * empty again. Undo keeps working; a released file is not reopened (it is
 * uploaded again instead).
 */
import { prisma } from '@ejo/database';
import { writeAuditLog } from '../workshop-core';
import { releaseState, stagingDays } from './staging';

export { DEFAULT_STAGING_DAYS, releaseState, stagingDays, type ReleaseState } from './staging';

/** Rows cleared per statement: short transactions on a busy database. */
const RELEASE_BATCH = 20_000;

/** Bytes the import's staged rows take now (the cells and the row overhead). */
export async function measureStagedBytes(jobId: string): Promise<number> {
  const [r] = await prisma.$queryRaw<{ bytes: bigint | number | null }[]>`
    SELECT COALESCE(SUM(pg_column_size(r.*)), 0)::bigint AS bytes FROM import_rows r WHERE r."jobId" = ${jobId}`;
  return Math.min(2_147_483_647, Number(r?.bytes ?? 0));
}

/** Measured and stored (for imports staged before sizes were recorded, or after a release). */
export async function refreshStagedBytes(jobId: string): Promise<number> {
  const bytes = await measureStagedBytes(jobId);
  await prisma.importJob.update({ where: { id: jobId }, data: { stagedBytes: bytes } });
  return bytes;
}

/**
 * Clears the cells of the rows that no longer need them, in short batches.
 * Kept whole: rejected, duplicate, possible duplicates (matched by phone),
 * and rows whose filled-in fields an undo empties again. Idempotent.
 */
export async function releaseStagedRows(jobId: string, actorId: string | null): Promise<{ rowsCleared: number; bytesBefore: number; bytesAfter: number }> {
  const bytesBefore = await measureStagedBytes(jobId);
  let rowsCleared = 0;
  for (;;) {
    const n = await prisma.$executeRaw`
      UPDATE import_rows SET cells = '[]'::jsonb
       WHERE id IN (
         SELECT id FROM import_rows
          WHERE "jobId" = ${jobId}
            AND cells <> '[]'::jsonb
            AND status NOT IN ('REJECTED', 'DUPLICATE', 'PENDING')
            AND COALESCE("matchedBy", '') <> 'phone'
            AND NOT (status = 'UPDATED' AND cardinality(filled) > 0)
          LIMIT ${RELEASE_BATCH})`;
    rowsCleared += n;
    if (n < RELEASE_BATCH) break;
  }
  const bytesAfter = await measureStagedBytes(jobId);
  await prisma.importJob.update({ where: { id: jobId }, data: { rowsReleasedAt: new Date(), rowsReleasedById: actorId, stagedBytes: bytesAfter } });
  return { rowsCleared, bytesBefore, bytesAfter };
}

/** The daily run: every finished import whose period has passed, in every organisation. Returns what was released. */
export async function releaseExpiredStagedRows(now = new Date(), limit = 50): Promise<{ imports: number; rowsCleared: number; bytesFreed: number }> {
  const orgs = await prisma.organisation.findMany({ select: { id: true, importStagingDays: true } });
  let imports = 0; let rowsCleared = 0; let bytesFreed = 0;
  for (const o of orgs) {
    const days = stagingDays(o.importStagingDays);
    if (days === 0) continue;
    const before = new Date(+now - days * 86_400_000);
    const due = await prisma.importJob.findMany({
      where: { organisationId: o.id, status: 'COMPLETED', rowsReleasedAt: null, completedAt: { lt: before } },
      orderBy: { completedAt: 'asc' }, take: limit,
      select: { id: true, number: true, entity: true, status: true, completedAt: true, signedOffAt: true, rowsReleasedAt: true },
    });
    for (const j of due) {
      const st = releaseState(j, days);
      if (!st.releasable || !st.dueAt || +st.dueAt > +now) continue;
      const r = await releaseStagedRows(j.id, null);
      imports += 1; rowsCleared += r.rowsCleared; bytesFreed += Math.max(0, r.bytesBefore - r.bytesAfter);
      await writeAuditLog({ userId: null, organisationId: o.id, action: 'data_exchange.rows_released', entityType: 'ImportJob', entityId: j.id, metadata: { number: j.number, by: 'schedule', afterDays: days, rowsCleared: r.rowsCleared, bytesBefore: r.bytesBefore, bytesAfter: r.bytesAfter } });
    }
  }
  return { imports, rowsCleared, bytesFreed };
}
