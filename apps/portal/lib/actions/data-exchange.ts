'use server';

/**
 * Data Exchange — bringing existing records in from SAP and spreadsheets.
 *
 * The flow, for every kind of record (lib/data-exchange/fields.ts):
 *   1. upload   the browser reads the file and sends its rows in blocks
 *               (UPLOADING → UPLOADED); nothing live is touched;
 *   2. match    which column feeds which field (auto-matched, SAP names
 *               included; saved as reusable profiles);
 *   3. check    every row checked and matched to existing records, in
 *               batches (VALIDATING → VALIDATED); still nothing live;
 *   4. approve  a second person approves (AWAITING_APPROVAL → APPROVED) —
 *               the person who prepared it cannot, except the master
 *               administrator while roles are empty (audited);
 *   5. load     in batches, locked per import, idempotent, pausable
 *               (LOADING ⇄ PAUSED → COMPLETED);
 *   6. undo     removes exactly what the import created, and empties what it
 *               filled in — refused while anything has been built on it.
 *
 * Every step is in the audit trail; every read and write is fenced to the
 * person's own organisation (myImportJob / exchangeOrg).
 */
import { randomUUID } from 'node:crypto';
import { prisma, Prisma } from '@ejo/database';
import { allows, authorize, getPrincipal, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';
import { requireUser } from '@/lib/actions/workshop';
import { lagosYear } from '@/lib/utils/format-date';
import { highestSequence } from '@/lib/recycle-bin/numbers';
import { ENTITIES, autoMap, cleanMapping, isEntityKey, mappingProblems, profileFromMapping, type EntityKey, type Mapping } from '@/lib/data-exchange/fields';
import { moveManyToBinInTx } from '@/lib/recycle-bin/server';
import { checkCustomerRow, checkVehicleRow, phoneKey, type CustomerValues, type Issue, type VehicleValues } from '@/lib/data-exchange/check';

export type ImportStatus = 'UPLOADING' | 'UPLOADED' | 'VALIDATING' | 'VALIDATED' | 'AWAITING_APPROVAL' | 'APPROVED' | 'LOADING' | 'PAUSED' | 'COMPLETED' | 'UNDOING' | 'UNDONE' | 'CANCELLED' | 'FAILED';

class DataExchangeError extends Error {}

/** Blocks sent from the browser, rows per check / load batch, rows read per undo step. */
const MAX_BLOCK_ROWS = 5000;
const CHECK_BATCH = 2000;
const LOAD_BATCH = 1000;
const UNDO_BATCH = 500;
const MAX_COLUMNS = 400;
const MAX_CELL = 2000;
const MAX_FILE_ROWS = 1_100_000;
/** One load / check step must finish well inside a serverless function's time. */
const TX = { timeout: 55_000, maxWait: 15_000 } as const;

/** The person and the organisation they are acting for (the platform team: the branch they work in). */
async function exchangeOrg(): Promise<{ userId: string; organisationId: string; isSuperAdmin: boolean }> {
  const me = await requireUser();
  const p = await getPrincipal();
  const organisationId = p.organisationId ?? (await myOrganisationId());
  if (!organisationId) throw new DataExchangeError('Your account is not placed in an organisation yet.');
  return { userId: me.id, organisationId, isSuperAdmin: p.isSuperAdmin };
}

/** An import of the person's own organisation, or "not found" (never another organisation's). */
async function myImportJob(jobId: string) {
  const { organisationId } = await exchangeOrg();
  const job = typeof jobId === 'string' && jobId ? await prisma.importJob.findFirst({ where: { id: jobId, organisationId } }) : null;
  if (!job) throw new DataExchangeError('This import was not found.');
  return job;
}

async function canRun(): Promise<boolean> {
  return allows('dataexchange.import.run');
}
async function canApprove(): Promise<boolean> {
  return (await allows('dataexchange.import.approve')) && (await allows('crm.manage'));
}

async function nextImportNumber(): Promise<string> {
  const prefix = `IMP-${lagosYear()}-`;
  const rows = await prisma.importJob.findMany({ where: { number: { startsWith: prefix } }, select: { number: true }, orderBy: { number: 'desc' }, take: 1 });
  return `${prefix}${String(highestSequence(prefix, rows.map((r) => r.number)) + 1).padStart(6, '0')}`;
}

// Control characters (and characters Windows forbids) are taken out of a file name before it is stored.
// eslint-disable-next-line no-control-regex
const cleanFileName = (n: string) => String(n ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'import';

/** The master administrator may sign the second step while nobody else holds the role (audited, flagged by Integrity). */
async function secondSignatureAsMaster(userId: string, jobId: string): Promise<boolean> {
  const master = await prisma.userRole.findFirst({ where: { userId, role: { isSuperAdmin: true } }, select: { userId: true } });
  if (!master) return false;
  await writeAuditLog({ userId, action: 'separation_of_duties.waived', entityType: 'ImportJob', entityId: jobId, metadata: { step: 'import approval', by: 'master administrator' } });
  return true;
}

// ── Lists and one import ────────────────────────────────────────────────

export type ImportJobRow = {
  id: string; number: string; entity: EntityKey; fileName: string; status: ImportStatus; fileRows: number;
  goodRows: number; warningRows: number; rejectedRows: number; duplicateRows: number; createdRows: number; updatedRows: number; skippedRows: number;
  createdBy: string; createdAt: Date; approvedBy: string | null; completedAt: Date | null;
};

export async function listImportJobs(opts: { take?: number; before?: string } = {}): Promise<{ jobs: ImportJobRow[]; canRun: boolean; canApprove: boolean }> {
  const [run, approve] = await Promise.all([canRun(), canApprove()]);
  if (!run && !approve) await authorize('dataexchange.import.run', undefined, 'listImportJobs', 'Only the people who bring records into the system can see imports.');
  const { organisationId } = await exchangeOrg();
  const take = Math.min(Math.max(opts.take ?? 30, 1), 100);
  const jobs = await prisma.importJob.findMany({
    where: { organisationId, ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}) },
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, number: true, entity: true, fileName: true, status: true, fileRows: true, goodRows: true, warningRows: true, rejectedRows: true, duplicateRows: true, createdRows: true, updatedRows: true, skippedRows: true, createdAt: true, completedAt: true, createdBy: { select: { fullName: true } }, approvedBy: { select: { fullName: true } } },
  });
  return {
    canRun: run,
    canApprove: approve,
    jobs: jobs.map((j) => ({ ...j, entity: (isEntityKey(j.entity) ? j.entity : 'customers') as EntityKey, status: j.status as ImportStatus, createdBy: j.createdBy.fullName, approvedBy: j.approvedBy?.fullName ?? null })),
  };
}

export type ImportJobDetail = ImportJobRow & {
  headers: string[];
  mapping: Mapping | null;
  matchMode: 'ADD_ONLY' | 'FILL_BLANKS';
  sourceSystem: 'SAP' | 'LEGACY';
  possibleDuplicates: 'SKIP' | 'ADD';
  matchedRows: number;
  error: string | null;
  createdById: string;
  approvedAt: Date | null;
  submittedAt: Date | null;
  undoneAt: Date | null;
  preview: { rowNumber: number; cells: string[] }[];
  problems: { rowNumber: number; status: string; issues: Issue[]; matchedBy: string | null }[];
  possible: { rowNumber: number; cells: string[]; matchedId: string | null; matchedBy: string | null }[];
  progress: Record<string, number>;
  profiles: { id: string; name: string; mapping: Record<string, string> }[];
  sameFileBefore: { id: string; number: string; status: string } | null;
  me: { id: string; canRun: boolean; canApprove: boolean; isMaster: boolean };
};

export async function getImportJob(jobId: string): Promise<ImportJobDetail> {
  const [run, approve] = await Promise.all([canRun(), canApprove()]);
  if (!run && !approve) await authorize('dataexchange.import.run', undefined, 'getImportJob', 'Only the people who bring records into the system can see imports.');
  const job = await myImportJob(jobId);
  const me = await exchangeOrg();
  const entity = (isEntityKey(job.entity) ? job.entity : 'customers') as EntityKey;
  const [createdBy, approvedBy, preview, problems, possible, groups, profiles, sameFileBefore, master] = await Promise.all([
    prisma.user.findUnique({ where: { id: job.createdById }, select: { fullName: true } }),
    job.approvedById ? prisma.user.findUnique({ where: { id: job.approvedById }, select: { fullName: true } }) : null,
    prisma.importRow.findMany({ where: { jobId: job.id }, orderBy: { rowNumber: 'asc' }, take: 5, select: { rowNumber: true, cells: true } }),
    prisma.importRow.findMany({ where: { jobId: job.id, status: { in: ['REJECTED', 'DUPLICATE', 'WARNING'] } }, orderBy: [{ status: 'asc' }, { rowNumber: 'asc' }], take: 60, select: { rowNumber: true, status: true, issues: true, matchedBy: true } }),
    prisma.importRow.findMany({ where: { jobId: job.id, matchedBy: 'phone' }, orderBy: { rowNumber: 'asc' }, take: 30, select: { rowNumber: true, cells: true, matchedId: true, matchedBy: true } }),
    prisma.importRow.groupBy({ by: ['status'], where: { jobId: job.id }, _count: { _all: true } }),
    prisma.importMappingProfile.findMany({ where: { organisationId: me.organisationId, entity }, orderBy: { name: 'asc' }, take: 50, select: { id: true, name: true, mapping: true } }),
    prisma.importJob.findFirst({ where: { organisationId: me.organisationId, entity, fileSha256: job.fileSha256, id: { not: job.id }, status: { notIn: ['CANCELLED', 'UNDONE'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true } }),
    prisma.userRole.findFirst({ where: { userId: me.userId, role: { isSuperAdmin: true } }, select: { userId: true } }),
  ]);
  return {
    id: job.id, number: job.number, entity, fileName: job.fileName, status: job.status as ImportStatus, fileRows: job.fileRows,
    goodRows: job.goodRows, warningRows: job.warningRows, rejectedRows: job.rejectedRows, duplicateRows: job.duplicateRows, matchedRows: job.matchedRows,
    createdRows: job.createdRows, updatedRows: job.updatedRows, skippedRows: job.skippedRows,
    createdBy: createdBy?.fullName ?? 'Someone', createdById: job.createdById, createdAt: job.createdAt, approvedBy: approvedBy?.fullName ?? null, approvedAt: job.approvedAt,
    submittedAt: job.submittedAt, completedAt: job.completedAt, undoneAt: job.undoneAt, error: job.error,
    headers: Array.isArray(job.headers) ? (job.headers as unknown[]).map(String) : [],
    mapping: (job.mapping as Mapping | null) ?? null,
    matchMode: job.matchMode === 'FILL_BLANKS' ? 'FILL_BLANKS' : 'ADD_ONLY',
    sourceSystem: job.sourceSystem === 'LEGACY' ? 'LEGACY' : 'SAP',
    possibleDuplicates: job.possibleDuplicates === 'ADD' ? 'ADD' : 'SKIP',
    preview: preview.map((r) => ({ rowNumber: r.rowNumber, cells: (r.cells as unknown[]).map((c) => String(c ?? '')) })),
    problems: problems.map((r) => ({ rowNumber: r.rowNumber, status: r.status, issues: (r.issues as Issue[] | null) ?? [], matchedBy: r.matchedBy })),
    possible: possible.map((r) => ({ rowNumber: r.rowNumber, cells: (r.cells as unknown[]).map((c) => String(c ?? '')), matchedId: r.matchedId, matchedBy: r.matchedBy })),
    progress: Object.fromEntries(groups.map((g) => [g.status, g._count._all])),
    profiles: profiles.map((p) => ({ id: p.id, name: p.name, mapping: (p.mapping as Record<string, string>) ?? {} })),
    sameFileBefore,
    me: { id: me.userId, canRun: run, canApprove: approve, isMaster: Boolean(master) },
  };
}

// ── 1. Upload ───────────────────────────────────────────────────────────

/** Starts an import: the file's name, fingerprint, headers and row count, read in the browser. */
export async function createImportJob(input: { entity: string; fileName: string; fileSha256: string; headers: string[]; fileRows: number; sourceSystem?: string }): Promise<{ id: string; number: string; sameFileBefore: { number: string } | null }> {
  await authorize('dataexchange.import.run', undefined, 'createImportJob', 'Only the people who bring records into the system can start an import.');
  const { userId, organisationId } = await exchangeOrg();
  if (!isEntityKey(input.entity)) throw new DataExchangeError('Choose what the file holds.');
  const name = cleanFileName(input.fileName);
  if (!/\.(csv|txt|xlsx)$/i.test(name)) throw new DataExchangeError('Choose a CSV file or an Excel workbook (.xlsx). Macro workbooks (.xlsm) and old .xls files are not accepted — save as .xlsx or CSV.');
  const sha = String(input.fileSha256 ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new DataExchangeError('The file could not be read. Choose it again.');
  const headers = (Array.isArray(input.headers) ? input.headers : []).slice(0, MAX_COLUMNS).map((h, i) => String(h ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || `Column ${i + 1}`);
  if (!headers.length || headers.every((h) => /^Column \d+$/.test(h))) throw new DataExchangeError('The first row of the file must hold the column names (headers).');
  // The browser starts the import as soon as it has read the headers; the real count is set when the upload finishes.
  const fileRows = Math.max(0, Math.trunc(Number(input.fileRows)) || 0);
  if (fileRows > MAX_FILE_ROWS) throw new DataExchangeError(`The file has more than ${MAX_FILE_ROWS.toLocaleString('en-NG')} rows. Split it into smaller files.`);
  const entity = input.entity;
  const before = await prisma.importJob.findFirst({ where: { organisationId, entity, fileSha256: sha, status: { notIn: ['CANCELLED', 'UNDONE'] } }, orderBy: { createdAt: 'desc' }, select: { number: true } });
  let job: { id: string; number: string } | null = null;
  for (let attempt = 0; attempt < 4 && !job; attempt += 1) {
    try {
      job = await prisma.importJob.create({
        data: { number: await nextImportNumber(), organisationId, entity, fileName: name, fileSha256: sha, fileRows, headers, mapping: autoMap(entity, headers), sourceSystem: input.sourceSystem === 'LEGACY' ? 'LEGACY' : 'SAP', createdById: userId },
        select: { id: true, number: true },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err; // two imports started at the same moment: next number
    }
  }
  if (!job) throw new DataExchangeError('The import could not be started. Try again.');
  await writeAuditLog({ userId, action: 'data_exchange.started', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, entity: ENTITIES[entity].label, file: name, rows: fileRows, columns: headers.length, ...(before ? { sameFileAs: before.number } : {}) } });
  return { ...job, sameFileBefore: before };
}

/** One block of rows, as read in the browser (rowNumber = the line in the file; the header is line 1). Safe to send twice. */
export async function appendImportRows(jobId: string, rows: { rowNumber: number; cells: string[] }[]): Promise<{ received: number }> {
  await authorize('dataexchange.import.run', undefined, 'appendImportRows', 'Only the people who bring records into the system can upload a file.');
  const job = await myImportJob(jobId);
  if (job.status !== 'UPLOADING') throw new DataExchangeError('This import is no longer receiving rows.');
  if (!Array.isArray(rows) || rows.length > MAX_BLOCK_ROWS) throw new DataExchangeError(`Send at most ${MAX_BLOCK_ROWS} rows at a time.`);
  const width = Array.isArray(job.headers) ? (job.headers as unknown[]).length : 0;
  const data: Prisma.ImportRowCreateManyInput[] = [];
  for (const r of rows) {
    const n = Math.trunc(Number(r?.rowNumber));
    if (!Number.isFinite(n) || n < 2 || n > MAX_FILE_ROWS + 1 || !Array.isArray(r.cells)) continue;
    data.push({ jobId: job.id, rowNumber: n, cells: r.cells.slice(0, width).map((c) => String(c ?? '').slice(0, MAX_CELL)) });
  }
  if (!data.length) return { received: 0 };
  const res = await prisma.importRow.createMany({ data, skipDuplicates: true });
  return { received: res.count };
}

/** The whole file has been sent: count what arrived, and offer the column matching. */
export async function finishImportUpload(jobId: string): Promise<{ rows: number }> {
  await authorize('dataexchange.import.run', undefined, 'finishImportUpload', 'Only the people who bring records into the system can upload a file.');
  const job = await myImportJob(jobId);
  if (job.status !== 'UPLOADING') return { rows: job.fileRows };
  const rows = await prisma.importRow.count({ where: { jobId: job.id } });
  if (!rows) throw new DataExchangeError('No rows arrived. Choose the file again.');
  await prisma.importJob.updateMany({ where: { id: job.id, status: 'UPLOADING' }, data: { status: 'UPLOADED', fileRows: rows } });
  await writeAuditLog({ userId: job.createdById, action: 'data_exchange.uploaded', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, rows } });
  return { rows };
}

// ── 2. Match columns ────────────────────────────────────────────────────

/** Which column feeds which field, and how matches are treated. Any earlier checking is redone. */
export async function saveImportMapping(jobId: string, input: { mapping: Record<string, unknown>; matchMode?: string; sourceSystem?: string; possibleDuplicates?: string; saveAsProfile?: string }): Promise<{ problems: string[] }> {
  await authorize('dataexchange.import.run', undefined, 'saveImportMapping', 'Only the people who bring records into the system can match the columns.');
  const job = await myImportJob(jobId);
  const { userId, organisationId } = await exchangeOrg();
  if (!['UPLOADED', 'VALIDATING', 'VALIDATED'].includes(job.status)) throw new DataExchangeError('The columns can only be changed before the import is sent for approval.');
  const entity = job.entity as EntityKey;
  const headers = (job.headers as unknown[]).map(String);
  const mapping = cleanMapping(entity, input.mapping, headers.length);
  const problems = mappingProblems(entity, mapping);
  if (problems.length) return { problems };
  await prisma.$transaction(async (tx) => {
    const moved = await tx.importJob.updateMany({
      where: { id: job.id, status: job.status },
      data: {
        mapping, status: 'UPLOADED', error: null,
        matchMode: input.matchMode === 'FILL_BLANKS' ? 'FILL_BLANKS' : 'ADD_ONLY',
        sourceSystem: input.sourceSystem === 'LEGACY' ? 'LEGACY' : 'SAP',
        possibleDuplicates: input.possibleDuplicates === 'ADD' ? 'ADD' : 'SKIP',
        goodRows: 0, warningRows: 0, rejectedRows: 0, duplicateRows: 0, matchedRows: 0,
      },
    });
    if (!moved.count) throw new DataExchangeError('This import changed meanwhile. Refresh the page.');
    if (job.status !== 'UPLOADED') await tx.importRow.updateMany({ where: { jobId: job.id }, data: { status: 'PENDING', issues: Prisma.DbNull, matchedId: null, matchedBy: null, keys: [] } });
  }, TX);
  const profileName = String(input.saveAsProfile ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (profileName) {
    const saved = profileFromMapping(mapping, headers);
    await prisma.importMappingProfile.upsert({
      where: { organisationId_entity_name: { organisationId, entity, name: profileName } },
      create: { organisationId, entity, name: profileName, mapping: saved, createdById: userId },
      update: { mapping: saved },
    });
  }
  await writeAuditLog({ userId, action: 'data_exchange.columns_matched', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, fields: Object.values(mapping).filter((v) => v !== null).length, matchMode: input.matchMode === 'FILL_BLANKS' ? 'fill blanks' : 'add new only', ...(profileName ? { savedAs: profileName } : {}) } });
  return { problems: [] };
}

// ── 3. Check ────────────────────────────────────────────────────────────

type RowUpdate = { id: string; status: string; issues: Issue[] | null; matchedId: string | null; matchedBy: string | null; keys: string[] };

/** Many rows' results in one statement (parameterised arrays; no SQL is built as text). */
async function writeRowResults(tx: Prisma.TransactionClient, updates: RowUpdate[]): Promise<void> {
  if (!updates.length) return;
  const ids = updates.map((u) => u.id);
  const statuses = updates.map((u) => u.status);
  const issues = updates.map((u) => (u.issues && u.issues.length ? JSON.stringify(u.issues) : null));
  const matched = updates.map((u) => u.matchedId);
  const by = updates.map((u) => u.matchedBy);
  const keys = updates.map((u) => u.keys.join('\u001f'));
  await tx.$executeRaw`
    UPDATE import_rows AS r
       SET status = v.status, issues = v.issues::jsonb, "matchedId" = v.mid, "matchedBy" = v.mby,
           keys = CASE WHEN v.keys = '' THEN ARRAY[]::text[] ELSE string_to_array(v.keys, chr(31)) END
      FROM unnest(${ids}::text[], ${statuses}::text[], ${issues}::text[], ${matched}::text[], ${by}::text[], ${keys}::text[]) AS v(id, status, issues, mid, mby, keys)
     WHERE r.id = v.id`;
}

/** Existing customers of the organisation these keys point at (SAP number, email, phone). */
async function findCustomers(db: Prisma.TransactionClient | typeof prisma, organisationId: string, source: string, keys: { ext: string[]; email: string[]; phone: string[] }) {
  const [byExt, byEmail, byPhone] = await Promise.all([
    keys.ext.length ? db.customer.findMany({ where: { organisationId, externalSource: source, externalId: { in: keys.ext } }, select: { id: true, externalId: true } }) : [],
    keys.email.length ? db.customer.findMany({ where: { email: { in: keys.email } }, select: { id: true, email: true, organisationId: true } }) : [],
    keys.phone.length
      ? db.$queryRaw<{ id: string; k: string }[]>`
          SELECT id, right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) AS k FROM customers
           WHERE "organisationId" = ${organisationId}
             AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ANY(${keys.phone.map((p) => p.slice(-10))}::text[])`
      : [],
  ]);
  return {
    ext: new Map(byExt.map((c) => [String(c.externalId).toUpperCase(), c.id])),
    email: new Map(byEmail.map((c) => [String(c.email), { id: c.id, sameOrg: c.organisationId === organisationId }])),
    phone: new Map(byPhone.map((c) => [c.k, c.id])),
  };
}

/** Existing vehicles these keys point at (SAP number within the organisation, VIN, plate — the last two are unique on the platform). */
async function findVehicles(db: Prisma.TransactionClient | typeof prisma, organisationId: string, source: string, keys: { ext: string[]; vin: string[]; plate: string[] }) {
  const [byExt, byVin, byPlate] = await Promise.all([
    keys.ext.length ? db.customerVehicle.findMany({ where: { externalSource: source, externalId: { in: keys.ext }, customer: { organisationId } }, select: { id: true, externalId: true } }) : [],
    keys.vin.length ? db.customerVehicle.findMany({ where: { chassisNumber: { in: keys.vin } }, select: { id: true, chassisNumber: true, customer: { select: { organisationId: true } } } }) : [],
    keys.plate.length
      ? db.$queryRaw<{ id: string; k: string; org: string }[]>`
          SELECT v.id, upper(regexp_replace(v."plateNumber", '[\\s-]', '', 'g')) AS k, c."organisationId" AS org
            FROM customer_vehicles v JOIN customers c ON c.id = v."customerId"
           WHERE upper(regexp_replace(coalesce(v."plateNumber", ''), '[\\s-]', '', 'g')) = ANY(${keys.plate}::text[])`
      : [],
  ]);
  return {
    ext: new Map(byExt.map((v) => [String(v.externalId).toUpperCase(), v.id])),
    vin: new Map(byVin.map((v) => [String(v.chassisNumber), { id: v.id, sameOrg: v.customer.organisationId === organisationId }])),
    plate: new Map(byPlate.map((v) => [v.k, { id: v.id, sameOrg: v.org === organisationId }])),
  };
}

const keyVal = (keys: string[], kind: string) => keys.find((k) => k.startsWith(`${kind}:`))?.slice(kind.length + 1) ?? null;

/** Checks the next batch of rows (call until done). Nothing live is changed. */
export async function checkImportBatch(jobId: string): Promise<{ done: boolean; checked: number; total: number }> {
  await authorize('dataexchange.import.run', undefined, 'checkImportBatch', 'Only the people who bring records into the system can check a file.');
  const job = await myImportJob(jobId);
  if (!['UPLOADED', 'VALIDATING'].includes(job.status)) return { done: true, checked: job.fileRows, total: job.fileRows };
  const entity = job.entity as EntityKey;
  const mapping = (job.mapping as Mapping | null) ?? {};
  if (mappingProblems(entity, mapping).length) throw new DataExchangeError('Match the columns first.');
  if (job.status === 'UPLOADED') await prisma.importJob.updateMany({ where: { id: job.id, status: 'UPLOADED' }, data: { status: 'VALIDATING' } });

  const rows = await prisma.importRow.findMany({ where: { jobId: job.id, status: 'PENDING' }, orderBy: { rowNumber: 'asc' }, take: CHECK_BATCH, select: { id: true, rowNumber: true, cells: true } });
  if (rows.length) {
    const updates: RowUpdate[] = [];
    if (entity === 'customers') {
      const checked = rows.map((r) => ({ r, c: checkCustomerRow(r.cells as unknown[], mapping) }));
      const found = await findCustomers(prisma, job.organisationId, job.sourceSystem, {
        ext: checked.map((x) => keyVal(x.c.keys, 'ext')).filter((v): v is string => Boolean(v)),
        email: checked.map((x) => x.c.values?.email).filter((v): v is string => Boolean(v)),
        phone: checked.map((x) => keyVal(x.c.keys, 'phone')).filter((v): v is string => Boolean(v)),
      });
      for (const { r, c } of checked) {
        const issues = [...c.issues];
        let status: string = c.status;
        let matchedId: string | null = null;
        let matchedBy: string | null = null;
        const ext = keyVal(c.keys, 'ext');
        const email = c.values?.email ?? null;
        const ph = keyVal(c.keys, 'phone');
        if (status !== 'REJECTED') {
          if (ext && found.ext.has(ext)) { matchedId = found.ext.get(ext)!; matchedBy = 'ext'; }
          else if (email && found.email.has(email)) {
            const hit = found.email.get(email)!;
            if (hit.sameOrg) { matchedId = hit.id; matchedBy = 'email'; }
            else { issues.push({ field: 'email', level: 'warning', message: 'This email is already registered on the platform for another organisation, so the customer will be added without it.' }); status = 'WARNING'; }
          } else if (ph && found.phone.has(ph.slice(-10))) {
            matchedId = found.phone.get(ph.slice(-10))!; matchedBy = 'phone';
            issues.push({ field: 'phone', level: 'warning', message: 'Possibly an existing customer (same phone number, no matching customer number or email). See “Possible duplicates”.' });
            status = 'WARNING';
          }
        }
        updates.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
      }
    } else {
      const checked = rows.map((r) => ({ r, c: checkVehicleRow(r.cells as unknown[], mapping) }));
      const cust = await findCustomers(prisma, job.organisationId, job.sourceSystem, {
        ext: checked.map((x) => x.c.values?.customer.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)),
        email: checked.map((x) => x.c.values?.customer.email).filter((v): v is string => Boolean(v)),
        phone: checked.map((x) => x.c.values?.customer.phone).filter((v): v is string => Boolean(v)),
      });
      const veh = await findVehicles(prisma, job.organisationId, job.sourceSystem, {
        ext: checked.map((x) => keyVal(x.c.keys, 'ext')).filter((v): v is string => Boolean(v)),
        vin: checked.map((x) => keyVal(x.c.keys, 'vin')).filter((v): v is string => Boolean(v)),
        plate: checked.map((x) => keyVal(x.c.keys, 'plate')).filter((v): v is string => Boolean(v)),
      });
      for (const { r, c } of checked) {
        const issues = [...c.issues];
        let status: string = c.status;
        let matchedId: string | null = null;
        let matchedBy: string | null = null;
        if (status !== 'REJECTED' && c.values) {
          const k = c.values.customer;
          const owner = (k.externalId && cust.ext.get(k.externalId.toUpperCase())) || (k.email && cust.email.get(k.email)?.sameOrg ? cust.email.get(k.email)!.id : null) || (k.phone && cust.phone.get(k.phone.slice(-10))) || null;
          if (!owner) { issues.push({ field: 'customer', level: 'error', message: 'The customer was not found. Import the customers file first, or check the customer number, email or phone.' }); status = 'REJECTED'; }
          const ext = keyVal(c.keys, 'ext');
          const vin = keyVal(c.keys, 'vin');
          const plate = keyVal(c.keys, 'plate');
          const hit = (ext && veh.ext.has(ext) ? { id: veh.ext.get(ext)!, sameOrg: true, by: 'ext' } : null)
            ?? (vin && veh.vin.has(vin) ? { ...veh.vin.get(vin)!, by: 'vin' } : null)
            ?? (plate && veh.plate.has(plate) ? { ...veh.plate.get(plate)!, by: 'plate' } : null);
          if (status !== 'REJECTED' && hit) {
            if (!hit.sameOrg) { issues.push({ field: hit.by === 'plate' ? 'plateNumber' : 'chassisNumber', level: 'error', message: `This ${hit.by === 'plate' ? 'plate' : 'chassis number'} is already registered on the platform for another organisation.` }); status = 'REJECTED'; }
            else { matchedId = hit.id; matchedBy = hit.by; }
          }
        }
        updates.push({ id: r.id, status, issues, matchedId, matchedBy, keys: c.keys });
      }
    }
    await prisma.$transaction(async (tx) => { await writeRowResults(tx, updates); }, TX);
  }

  const pending = await prisma.importRow.count({ where: { jobId: job.id, status: 'PENDING' } });
  if (pending > 0) return { done: false, checked: job.fileRows - pending, total: job.fileRows };

  // The whole file is checked: the second copy of the same customer or vehicle in the file is a duplicate (the first one loads).
  await prisma.$transaction(async (tx) => {
    const strong = entity === 'customers' ? ['ext', 'email'] : ['ext', 'vin', 'plate'];
    const dups = await tx.$queryRaw<{ id: string; first: number; key: string }[]>`
      WITH k AS (
        SELECT r.id, r."rowNumber", unnest(r.keys) AS key FROM import_rows r WHERE r."jobId" = ${job.id} AND r.status IN ('GOOD', 'WARNING')
      ), f AS (
        SELECT key, min("rowNumber") AS first FROM k WHERE split_part(key, ':', 1) = ANY(${strong}::text[]) GROUP BY key HAVING count(*) > 1
      )
      SELECT DISTINCT ON (k.id) k.id, f.first, k.key FROM k JOIN f ON f.key = k.key WHERE k."rowNumber" > f.first ORDER BY k.id, f.first`;
    if (dups.length) {
      const words: Record<string, string> = { ext: 'customer number', email: 'email', vin: 'chassis number', plate: 'plate' };
      const existing = await tx.importRow.findMany({ where: { id: { in: dups.map((d) => d.id) } }, select: { id: true, issues: true, keys: true, matchedId: true, matchedBy: true } });
      const byId = new Map(existing.map((e) => [e.id, e]));
      await writeRowResults(tx, dups.map((d) => {
        const e = byId.get(d.id)!;
        const kind = d.key.split(':')[0]!;
        return { id: d.id, status: 'DUPLICATE', matchedId: e.matchedId, matchedBy: e.matchedBy, keys: e.keys, issues: [...((e.issues as Issue[] | null) ?? []), { field: kind, level: 'error', message: `Same ${words[kind] ?? kind} as row ${d.first} of the file; only the first is loaded.` }] };
      }));
    }
    const counts = await tx.importRow.groupBy({ by: ['status'], where: { jobId: job.id }, _count: { _all: true } });
    const n = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
    const matched = await tx.importRow.count({ where: { jobId: job.id, matchedId: { not: null }, status: { in: ['GOOD', 'WARNING'] } } });
    await tx.importJob.updateMany({ where: { id: job.id, status: 'VALIDATING' }, data: { status: 'VALIDATED', goodRows: n('GOOD'), warningRows: n('WARNING'), rejectedRows: n('REJECTED'), duplicateRows: n('DUPLICATE'), matchedRows: matched } });
  }, TX);
  const after = await prisma.importJob.findUnique({ where: { id: job.id }, select: { goodRows: true, warningRows: true, rejectedRows: true, duplicateRows: true, matchedRows: true } });
  await writeAuditLog({ userId: (await exchangeOrg()).userId, action: 'data_exchange.checked', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, ...after } });
  return { done: true, checked: job.fileRows, total: job.fileRows };
}

// ── 4. Approval ─────────────────────────────────────────────────────────

export async function submitImportForApproval(jobId: string): Promise<void> {
  await authorize('dataexchange.import.run', undefined, 'submitImportForApproval', 'Only the people who bring records into the system can send an import for approval.');
  const job = await myImportJob(jobId);
  const { userId } = await exchangeOrg();
  if (job.status !== 'VALIDATED') throw new DataExchangeError('Check the file first.');
  if (job.goodRows + job.warningRows === 0) throw new DataExchangeError('No row of this file can be loaded. Fix the rejected rows and upload the file again.');
  const res = await prisma.importJob.updateMany({ where: { id: job.id, status: 'VALIDATED' }, data: { status: 'AWAITING_APPROVAL', submittedAt: new Date(), error: null } });
  if (!res.count) throw new DataExchangeError('This import changed meanwhile. Refresh the page.');
  await writeAuditLog({ userId, action: 'data_exchange.submitted', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, toLoad: job.goodRows + job.warningRows, rejected: job.rejectedRows + job.duplicateRows } });
}

export async function approveImport(jobId: string): Promise<void> {
  await refuseDuringAssist('approveImport');
  await authorize('dataexchange.import.approve', undefined, 'approveImport', 'Only a manager or administrator can approve an import.');
  await authorize('crm.manage', undefined, 'approveImport', 'Only a manager or administrator can approve an import.');
  const job = await myImportJob(jobId);
  const { userId } = await exchangeOrg();
  if (job.status !== 'AWAITING_APPROVAL') throw new DataExchangeError('This import is not waiting for approval.');
  if (job.createdById === userId && !(await secondSignatureAsMaster(userId, job.id))) {
    throw new DataExchangeError('You prepared this import, so another manager or administrator must approve it.');
  }
  const res = await prisma.importJob.updateMany({ where: { id: job.id, status: 'AWAITING_APPROVAL' }, data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() } });
  if (!res.count) throw new DataExchangeError('This import changed meanwhile. Refresh the page.');
  await writeAuditLog({ userId, action: 'data_exchange.approved', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, toLoad: job.goodRows + job.warningRows } });
}

export async function sendImportBack(jobId: string, reason: string): Promise<void> {
  await refuseDuringAssist('sendImportBack');
  await authorize('dataexchange.import.approve', undefined, 'sendImportBack', 'Only a manager or administrator can send an import back.');
  const job = await myImportJob(jobId);
  const { userId } = await exchangeOrg();
  const why = String(reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (why.length < 5) throw new DataExchangeError('Say what needs changing (at least a few words).');
  const res = await prisma.importJob.updateMany({ where: { id: job.id, status: { in: ['AWAITING_APPROVAL', 'APPROVED'] } }, data: { status: 'VALIDATED', error: `Sent back: ${why}`, approvedById: null, approvedAt: null } });
  if (!res.count) throw new DataExchangeError('This import can no longer be sent back.');
  await writeAuditLog({ userId, action: 'data_exchange.sent_back', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, reason: why } });
}

export async function cancelImport(jobId: string): Promise<void> {
  await authorize('dataexchange.import.run', undefined, 'cancelImport', 'Only the people who bring records into the system can cancel an import.');
  const job = await myImportJob(jobId);
  const { userId } = await exchangeOrg();
  if (!['UPLOADING', 'UPLOADED', 'VALIDATING', 'VALIDATED', 'AWAITING_APPROVAL', 'APPROVED', 'FAILED'].includes(job.status)) throw new DataExchangeError('An import that has started loading cannot be cancelled — pause it, or undo it once finished.');
  const res = await prisma.importJob.updateMany({ where: { id: job.id, status: job.status }, data: { status: 'CANCELLED' } });
  if (!res.count) throw new DataExchangeError('This import changed meanwhile. Refresh the page.');
  // The staged copy of the file goes: nothing was loaded from it.
  await prisma.importRow.deleteMany({ where: { jobId: job.id } });
  await writeAuditLog({ userId, action: 'data_exchange.cancelled', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number } });
}

// ── 5. Load ─────────────────────────────────────────────────────────────

const newId = () => `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;

/** Who may press "Load": the person who prepared it or an approver. */
async function authorizeLoader(job: { createdById: string }, userId: string): Promise<void> {
  if (job.createdById === userId) return authorize('dataexchange.import.run', undefined, 'loadImportBatch', 'Only the people who bring records into the system can load an import.');
  return authorize('dataexchange.import.approve', undefined, 'loadImportBatch', 'Only the person who prepared this import, or an approver, can load it.');
}

/** Loads the next batch of approved rows (call until done). Locked per import; a row is never loaded twice. */
export async function loadImportBatch(jobId: string): Promise<{ done: boolean; loaded: number; total: number; status: ImportStatus }> {
  const job = await myImportJob(jobId);
  const { userId } = await exchangeOrg();
  await authorizeLoader(job, userId);
  if (job.status === 'PAUSED') return { done: false, loaded: job.createdRows + job.updatedRows + job.skippedRows, total: job.goodRows + job.warningRows, status: 'PAUSED' };
  if (!['APPROVED', 'LOADING'].includes(job.status)) return { done: true, loaded: job.createdRows + job.updatedRows + job.skippedRows, total: job.goodRows + job.warningRows, status: job.status as ImportStatus };
  if (job.status === 'APPROVED') {
    await prisma.importJob.updateMany({ where: { id: job.id, status: 'APPROVED' }, data: { status: 'LOADING', startedAt: new Date() } });
    await writeAuditLog({ userId, action: 'data_exchange.load_started', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number } });
  }
  const entity = job.entity as EntityKey;
  const mapping = (job.mapping as Mapping | null) ?? {};
  try {
    await prisma.$transaction(async (tx) => {
      // One loader at a time for this import (a second tab waits, then finds nothing left to do).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import:${job.id}`}))`;
      const fresh = await tx.importJob.findUnique({ where: { id: job.id }, select: { status: true } });
      if (fresh?.status !== 'LOADING') return;
      const rows = await tx.importRow.findMany({ where: { jobId: job.id, status: { in: ['GOOD', 'WARNING'] } }, orderBy: { rowNumber: 'asc' }, take: LOAD_BATCH, select: { id: true, cells: true, issues: true, matchedBy: true } });
      if (!rows.length) return;
      if (entity === 'customers') await loadCustomers(tx, job, mapping, rows);
      else await loadVehicles(tx, job, mapping, rows);
    }, TX);
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : 'Unknown error';
    await prisma.importJob.updateMany({ where: { id: job.id, status: 'LOADING' }, data: { status: 'PAUSED', error: `Paused after a problem: ${message}. Nothing from the failed batch was saved; press Resume to try it again.` } });
    await writeAuditLog({ userId, action: 'data_exchange.load_paused', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, reason: message } });
    throw new DataExchangeError('The batch could not be saved, so the import was paused. Nothing from that batch was saved; press Resume to try it again.');
  }

  const counts = await prisma.importRow.groupBy({ by: ['status'], where: { jobId: job.id }, _count: { _all: true } });
  const n = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const left = n('GOOD') + n('WARNING');
  const data = { createdRows: n('CREATED'), updatedRows: n('UPDATED'), skippedRows: n('SKIPPED') };
  if (left > 0) {
    await prisma.importJob.update({ where: { id: job.id }, data });
    return { done: false, loaded: data.createdRows + data.updatedRows + data.skippedRows, total: job.goodRows + job.warningRows, status: 'LOADING' };
  }
  const res = await prisma.importJob.updateMany({ where: { id: job.id, status: 'LOADING' }, data: { ...data, status: 'COMPLETED', completedAt: new Date(), error: null } });
  if (res.count) await writeAuditLog({ userId, action: 'data_exchange.completed', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, entity: ENTITIES[entity].label, ...data, rejected: job.rejectedRows + job.duplicateRows } });
  return { done: true, loaded: data.createdRows + data.updatedRows + data.skippedRows, total: job.goodRows + job.warningRows, status: 'COMPLETED' };
}

type LoadRow = { id: string; cells: Prisma.JsonValue; issues: Prisma.JsonValue; matchedBy: string | null };
type JobForLoad = { id: string; organisationId: string; sourceSystem: string; matchMode: string; possibleDuplicates: string; createdById: string };
type Result = { id: string; status: 'CREATED' | 'UPDATED' | 'SKIPPED'; resultId: string | null; note?: string; filled?: string[] };

/** Row results after loading: status, the record, notes added, fields filled. */
async function writeLoadResults(tx: Prisma.TransactionClient, rows: LoadRow[], results: Result[]): Promise<void> {
  const issuesOf = new Map(rows.map((r) => [r.id, ((r.issues as Issue[] | null) ?? [])]));
  const ids = results.map((r) => r.id);
  const statuses = results.map((r) => r.status);
  const resultIds = results.map((r) => r.resultId);
  const issues = results.map((r) => {
    const list = [...(issuesOf.get(r.id) ?? []), ...(r.note ? [{ field: 'row', level: 'warning' as const, message: r.note }] : [])];
    return list.length ? JSON.stringify(list) : null;
  });
  const filled = results.map((r) => (r.filled ?? []).join(','));
  await tx.$executeRaw`
    UPDATE import_rows AS r
       SET status = v.status, "resultId" = v.rid, issues = v.issues::jsonb,
           filled = CASE WHEN v.filled = '' THEN ARRAY[]::text[] ELSE string_to_array(v.filled, ',') END
      FROM unnest(${ids}::text[], ${statuses}::text[], ${resultIds}::text[], ${issues}::text[], ${filled}::text[]) AS v(id, status, rid, issues, filled)
     WHERE r.id = v.id`;
}

async function loadCustomers(tx: Prisma.TransactionClient, job: JobForLoad, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkCustomerRow(r.cells as unknown[], mapping) }));
  // Matched again now (the front desk may have added someone since the file was checked).
  const found = await findCustomers(tx, job.organisationId, job.sourceSystem, {
    ext: checked.map((x) => x.c.values?.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)),
    email: checked.map((x) => x.c.values?.email).filter((v): v is string => Boolean(v)),
    phone: checked.map((x) => x.c.values?.phone ? phoneKey(x.c.values.phone) : null).filter((v): v is string => Boolean(v)),
  });
  const results: Result[] = [];
  const creates: { rowId: string; id: string; v: CustomerValues; email: string | null }[] = [];
  const fills: { rowId: string; id: string; v: CustomerValues }[] = [];
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const ext = v.externalId?.toUpperCase() ?? null;
    const emailHit = v.email ? found.email.get(v.email) : undefined;
    const ph = v.phone ? phoneKey(v.phone)?.slice(-10) : null;
    const strong = (ext && found.ext.get(ext)) || (emailHit?.sameOrg ? emailHit.id : null);
    if (strong) {
      if (job.matchMode === 'FILL_BLANKS') fills.push({ rowId: r.id, id: strong, v });
      else results.push({ id: r.id, status: 'SKIPPED', resultId: strong, note: 'Already a customer (matched by customer number or email); left as it is.' });
      continue;
    }
    if (ph && found.phone.has(ph) && job.possibleDuplicates !== 'ADD') {
      results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Possibly an existing customer (same phone); not added. Follow it up from the list of possible duplicates.' });
      continue;
    }
    // An email registered for another organisation (or taken meanwhile) is left off rather than shared.
    creates.push({ rowId: r.id, id: newId(), v, email: v.email && !emailHit ? v.email : null });
  }

  if (creates.length) {
    const source = job.sourceSystem === 'LEGACY' ? 'LEGACY' : 'SAP';
    await tx.customer.createMany({
      skipDuplicates: true,
      data: creates.map(({ id, v, email }) => ({
        id, organisationId: job.organisationId, customerType: v.customerType, fullName: v.fullName, email, phone: v.phone, altPhone: v.altPhone,
        address: v.address, tags: v.tags, notifyByEmail: Boolean(email), createdById: job.createdById, importJobId: job.id,
        externalSource: v.externalId ? source : null, externalId: v.externalId,
      })),
    });
    const made = new Set((await tx.customer.findMany({ where: { id: { in: creates.map((x) => x.id) } }, select: { id: true } })).map((c) => c.id));
    const companies = creates.filter((x) => made.has(x.id) && x.v.customerType === 'ORGANIZATION').map((x) => ({ customerId: x.id, companyName: x.v.companyName ?? x.v.fullName, taxId: x.v.taxId }));
    if (companies.length) await tx.customerCompany.createMany({ data: companies, skipDuplicates: true });
    const addresses = creates.filter((x) => made.has(x.id) && x.v.fullAddress).map((x) => ({ customerId: x.id, label: 'Full address (imported)', line1: x.v.fullAddress!.line1.slice(0, 500), city: x.v.fullAddress!.city, state: x.v.fullAddress!.state }));
    if (addresses.length) await tx.customerAddress.createMany({ data: addresses });
    for (const x of creates) {
      results.push(made.has(x.id)
        ? { id: x.rowId, status: 'CREATED', resultId: x.id }
        : { id: x.rowId, status: 'SKIPPED', resultId: null, note: 'A customer with the same customer number or email was added meanwhile; not added twice.' });
    }
  }

  for (const f of fills) {
    const cur = await tx.customer.findUnique({ where: { id: f.id }, select: { email: true, phone: true, altPhone: true, address: true, externalId: true } });
    if (!cur) { results.push({ id: f.rowId, status: 'SKIPPED', resultId: null }); continue; }
    const data: Prisma.CustomerUpdateInput = {};
    const filled: string[] = [];
    if (!cur.phone && f.v.phone) { data.phone = f.v.phone; filled.push('phone'); }
    if (!cur.altPhone && f.v.altPhone && f.v.altPhone !== cur.phone) { data.altPhone = f.v.altPhone; filled.push('altPhone'); }
    if (!cur.address && f.v.address) { data.address = f.v.address; filled.push('address'); }
    if (!cur.externalId && f.v.externalId) { data.externalId = f.v.externalId; data.externalSource = job.sourceSystem === 'LEGACY' ? 'LEGACY' : 'SAP'; filled.push('externalId'); }
    if (!cur.email && f.v.email && !(await tx.customer.findUnique({ where: { email: f.v.email }, select: { id: true } }))) { data.email = f.v.email; filled.push('email'); }
    if (filled.length) {
      await tx.customer.update({ where: { id: f.id }, data });
      results.push({ id: f.rowId, status: 'UPDATED', resultId: f.id, filled, note: `Already a customer; filled in what was empty (${filled.length} field${filled.length === 1 ? '' : 's'}).` });
    } else results.push({ id: f.rowId, status: 'SKIPPED', resultId: f.id, note: 'Already a customer with these details; nothing to fill in.' });
  }
  await writeLoadResults(tx, rows, results);
}

async function loadVehicles(tx: Prisma.TransactionClient, job: JobForLoad, mapping: Mapping, rows: LoadRow[]): Promise<void> {
  const checked = rows.map((r) => ({ r, c: checkVehicleRow(r.cells as unknown[], mapping) }));
  const cust = await findCustomers(tx, job.organisationId, job.sourceSystem, {
    ext: checked.map((x) => x.c.values?.customer.externalId?.toUpperCase()).filter((v): v is string => Boolean(v)),
    email: checked.map((x) => x.c.values?.customer.email).filter((v): v is string => Boolean(v)),
    phone: checked.map((x) => x.c.values?.customer.phone).filter((v): v is string => Boolean(v)),
  });
  const veh = await findVehicles(tx, job.organisationId, job.sourceSystem, {
    ext: checked.map((x) => keyVal(x.c.keys, 'ext')).filter((v): v is string => Boolean(v)),
    vin: checked.map((x) => keyVal(x.c.keys, 'vin')).filter((v): v is string => Boolean(v)),
    plate: checked.map((x) => keyVal(x.c.keys, 'plate')).filter((v): v is string => Boolean(v)),
  });
  const results: Result[] = [];
  const creates: { rowId: string; id: string; customerId: string; v: VehicleValues }[] = [];
  const fills: { rowId: string; id: string; v: VehicleValues }[] = [];
  const source = job.sourceSystem === 'LEGACY' ? 'LEGACY' : 'SAP';
  for (const { r, c } of checked) {
    const v = c.values;
    if (!v) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Could not be read again when loading.' }); continue; }
    const k = v.customer;
    const owner = (k.externalId && cust.ext.get(k.externalId.toUpperCase())) || (k.email && cust.email.get(k.email)?.sameOrg ? cust.email.get(k.email)!.id : null) || (k.phone && cust.phone.get(k.phone.slice(-10))) || null;
    if (!owner) { results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'The customer was not found when loading.' }); continue; }
    const ext = keyVal(c.keys, 'ext');
    const vin = keyVal(c.keys, 'vin');
    const plate = keyVal(c.keys, 'plate');
    const hit = (ext && veh.ext.get(ext) ? { id: veh.ext.get(ext)!, sameOrg: true } : null) ?? (vin && veh.vin.get(vin)) ?? (plate && veh.plate.get(plate)) ?? null;
    if (hit) {
      if (!hit.sameOrg) results.push({ id: r.id, status: 'SKIPPED', resultId: null, note: 'Registered on the platform for another organisation; not added.' });
      else if (job.matchMode === 'FILL_BLANKS') fills.push({ rowId: r.id, id: hit.id, v });
      else results.push({ id: r.id, status: 'SKIPPED', resultId: hit.id, note: 'Already registered (same chassis number, plate or vehicle number); left as it is.' });
      continue;
    }
    creates.push({ rowId: r.id, id: newId(), customerId: owner, v });
  }
  if (creates.length) {
    await tx.customerVehicle.createMany({
      skipDuplicates: true,
      data: creates.map(({ id, customerId, v }) => ({
        id, customerId, chassisNumber: v.chassisNumber, plateNumber: v.plateNumber, engineNumber: v.engineNumber, engineType: v.engineType,
        make: v.make, model: v.model, year: v.year, vehicleType: v.vehicleType, mileage: v.mileage, createdById: job.createdById, importJobId: job.id,
        externalSource: v.externalId ? source : null, externalId: v.externalId,
      })),
    });
    const made = new Set((await tx.customerVehicle.findMany({ where: { id: { in: creates.map((x) => x.id) } }, select: { id: true } })).map((x) => x.id));
    for (const x of creates) {
      results.push(made.has(x.id)
        ? { id: x.rowId, status: 'CREATED', resultId: x.id }
        : { id: x.rowId, status: 'SKIPPED', resultId: null, note: 'A vehicle with the same chassis number or plate was registered meanwhile; not added twice.' });
    }
  }
  for (const f of fills) {
    const cur = await tx.customerVehicle.findUnique({ where: { id: f.id }, select: { engineNumber: true, engineType: true, make: true, model: true, year: true, vehicleType: true, mileage: true, externalId: true, chassisNumber: true, plateNumber: true } });
    if (!cur) { results.push({ id: f.rowId, status: 'SKIPPED', resultId: null }); continue; }
    const data: Prisma.CustomerVehicleUpdateInput = {};
    const filled: string[] = [];
    const fill = <K extends 'engineNumber' | 'engineType' | 'make' | 'model'>(k: K) => { if (!cur[k] && f.v[k]) { (data as Record<string, unknown>)[k] = f.v[k]; filled.push(k); } };
    fill('engineNumber'); fill('engineType'); fill('make'); fill('model');
    if (cur.year == null && f.v.year != null) { data.year = f.v.year; filled.push('year'); }
    if (!cur.vehicleType && f.v.vehicleType) { data.vehicleType = f.v.vehicleType; filled.push('vehicleType'); }
    if (cur.mileage == null && f.v.mileage != null) { data.mileage = f.v.mileage; filled.push('mileage'); }
    if (!cur.externalId && f.v.externalId) { data.externalId = f.v.externalId; data.externalSource = source; filled.push('externalId'); }
    if (!cur.chassisNumber && f.v.chassisNumber && !(await tx.customerVehicle.findUnique({ where: { chassisNumber: f.v.chassisNumber }, select: { id: true } }))) { data.chassisNumber = f.v.chassisNumber; filled.push('chassisNumber'); }
    if (!cur.plateNumber && f.v.plateNumber && !(await tx.customerVehicle.findUnique({ where: { plateNumber: f.v.plateNumber }, select: { id: true } }))) { data.plateNumber = f.v.plateNumber; filled.push('plateNumber'); }
    if (filled.length) {
      await tx.customerVehicle.update({ where: { id: f.id }, data });
      results.push({ id: f.rowId, status: 'UPDATED', resultId: f.id, filled, note: `Already registered; filled in what was empty (${filled.length} field${filled.length === 1 ? '' : 's'}).` });
    } else results.push({ id: f.rowId, status: 'SKIPPED', resultId: f.id, note: 'Already registered with these details; nothing to fill in.' });
  }
  await writeLoadResults(tx, rows, results);
}

export async function pauseImport(jobId: string): Promise<void> {
  const job = await myImportJob(jobId);
  const { userId } = await exchangeOrg();
  await authorizeLoader(job, userId);
  const res = await prisma.importJob.updateMany({ where: { id: job.id, status: 'LOADING' }, data: { status: 'PAUSED' } });
  if (res.count) await writeAuditLog({ userId, action: 'data_exchange.paused', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number } });
}

export async function resumeImport(jobId: string): Promise<void> {
  const job = await myImportJob(jobId);
  const { userId } = await exchangeOrg();
  await authorizeLoader(job, userId);
  const res = await prisma.importJob.updateMany({ where: { id: job.id, status: 'PAUSED' }, data: { status: 'LOADING', error: null } });
  if (res.count) await writeAuditLog({ userId, action: 'data_exchange.resumed', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number } });
}

// ── 6. Undo ─────────────────────────────────────────────────────────────

/** What stands in the way of undoing (records built on what the import created), up to 20, with links. */
export async function importUndoBlockers(jobId: string): Promise<{ label: string; href: string; why: string }[]> {
  await authorize('dataexchange.import.approve', undefined, 'importUndoBlockers', 'Only a manager or administrator can undo an import.');
  const job = await myImportJob(jobId);
  return undoBlockers(job.id, job.entity as EntityKey);
}

async function undoBlockers(jobId: string, entity: EntityKey): Promise<{ label: string; href: string; why: string }[]> {
  if (entity === 'customers') {
    const busy = await prisma.customer.findMany({
      where: { importJobId: jobId, OR: [{ jobCards: { some: {} } }, { vehicleServices: { some: {} } }, { warranties: { some: {} } }, { warrantyClaims: { some: {} } }, { accounts: { some: {} } }, { sessions: { some: {} } }, { lastLoginAt: { not: null } }, { vehicles: { some: { OR: [{ importJobId: null }, { importJobId: { not: jobId } }] } } }] },
      take: 20,
      select: { id: true, fullName: true, lastLoginAt: true, _count: { select: { jobCards: true, vehicleServices: true, warranties: true, accounts: true, sessions: true } } },
    });
    return busy.map((c) => ({ label: c.fullName, href: `/crm/customers/${c.id}`, why: [c._count.jobCards && 'job cards', c._count.vehicleServices && 'vehicle services', c._count.warranties && 'warranties', (c._count.accounts || c._count.sessions || c.lastLoginAt) && 'has set up or used the customer portal'].filter(Boolean).join(', ') || 'vehicles registered since' }));
  }
  const busy = await prisma.customerVehicle.findMany({
    where: { importJobId: jobId, OR: [{ jobCards: { some: {} } }, { vehicleServices: { some: {} } }, { warranties: { some: {} } }, { warrantyClaims: { some: {} } }, { gateExits: { some: {} } }, { roadTestPermits: { some: {} } }, { reminderLogs: { some: {} } }] },
    take: 20,
    select: { id: true, plateNumber: true, chassisNumber: true, make: true, model: true, customerId: true },
  });
  return busy.map((v) => ({ label: [v.make, v.model, v.plateNumber ?? v.chassisNumber].filter(Boolean).join(' '), href: `/crm/customers/${v.customerId}`, why: 'work has been recorded on it since' }));
}

/**
 * Undoes a finished import, a batch at a time (call until done): moves the
 * records it created to the Recycle bin — each its own item, restorable for
 * the bin's retention period — and empties the fields it filled in (only
 * where they still hold the imported value). Refused while anything has been
 * built on them; one that gets work recorded while the undo runs is kept and
 * reported. The staged copy of the file stays too.
 */
export async function undoImportBatch(jobId: string): Promise<{ done: boolean; left: number; blockers: { label: string; href: string; why: string }[] }> {
  await refuseDuringAssist('undoImportBatch');
  await authorize('dataexchange.import.approve', undefined, 'undoImportBatch', 'Only a manager or administrator can undo an import.');
  await authorize('crm.manage', undefined, 'undoImportBatch', 'Only a manager or administrator can undo an import.');
  const job = await myImportJob(jobId);
  const { userId } = await exchangeOrg();
  const entity = job.entity as EntityKey;
  if (!['COMPLETED', 'UNDOING'].includes(job.status)) throw new DataExchangeError('Only a finished import can be undone.');
  if (job.status === 'COMPLETED') {
    const blockers = await undoBlockers(job.id, entity);
    if (blockers.length) return { done: false, left: -1, blockers };
    const res = await prisma.importJob.updateMany({ where: { id: job.id, status: 'COMPLETED' }, data: { status: 'UNDOING', undoneById: userId } });
    if (!res.count) throw new DataExchangeError('This import changed meanwhile. Refresh the page.');
    await writeAuditLog({ userId, action: 'data_exchange.undo_started', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, created: job.createdRows, updated: job.updatedRows } });
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import:${job.id}`}))`;
    const rows = await tx.importRow.findMany({ where: { jobId: job.id, status: { in: ['CREATED', 'UPDATED'] } }, orderBy: { rowNumber: 'asc' }, take: UNDO_BATCH, select: { id: true, status: true, resultId: true, filled: true, cells: true } });
    if (!rows.length) return;
    // Only what this import made (importJobId), each moved to the Recycle bin as its own restorable item, with the
    // bin's own rules checked again under the lock: one that has had work recorded meanwhile is kept and reported.
    const createdRows = rows.filter((r) => r.status === 'CREATED' && r.resultId);
    const mine = createdRows.length
      ? new Set((entity === 'customers'
        ? await tx.customer.findMany({ where: { id: { in: createdRows.map((r) => r.resultId!) }, importJobId: job.id }, select: { id: true } })
        : await tx.customerVehicle.findMany({ where: { id: { in: createdRows.map((r) => r.resultId!) }, importJobId: job.id }, select: { id: true } })).map((x) => x.id))
      : new Set<string>();
    const moved = new Set(await moveManyToBinInTx(tx, entity === 'customers' ? 'Customer' : 'CustomerVehicle', [...mine], `Undo of import ${job.number}`, userId));
    const kept = createdRows.filter((r) => !moved.has(r.resultId!));
    if (kept.length) {
      await tx.importRow.updateMany({ where: { id: { in: kept.map((r) => r.id) } }, data: { status: 'KEPT' } });
    }
    const mapping = (job.mapping as Mapping | null) ?? {};
    for (const r of rows.filter((x) => x.status === 'UPDATED' && x.resultId && x.filled.length)) {
      if (entity === 'customers') {
        const v = checkCustomerRow(r.cells as unknown[], mapping).values;
        const cur = await tx.customer.findUnique({ where: { id: r.resultId! }, select: { email: true, phone: true, altPhone: true, address: true, externalId: true } });
        if (!v || !cur) continue;
        const data: Prisma.CustomerUpdateInput = {};
        if (r.filled.includes('phone') && cur.phone === v.phone) data.phone = null;
        if (r.filled.includes('altPhone') && cur.altPhone === v.altPhone) data.altPhone = null;
        if (r.filled.includes('address') && cur.address === v.address) data.address = null;
        if (r.filled.includes('externalId') && cur.externalId === v.externalId) { data.externalId = null; data.externalSource = null; }
        if (r.filled.includes('email') && cur.email === v.email && !(await tx.customerAccount.count({ where: { customerId: r.resultId! } }))) data.email = null;
        if (Object.keys(data).length) await tx.customer.update({ where: { id: r.resultId! }, data });
      } else {
        const v = checkVehicleRow(r.cells as unknown[], mapping).values;
        const cur = await tx.customerVehicle.findUnique({ where: { id: r.resultId! }, select: { engineNumber: true, engineType: true, make: true, model: true, year: true, vehicleType: true, mileage: true, externalId: true, chassisNumber: true, plateNumber: true } });
        if (!v || !cur) continue;
        const data: Record<string, null> = {};
        for (const k of ['engineNumber', 'engineType', 'make', 'model', 'year', 'vehicleType', 'mileage', 'chassisNumber', 'plateNumber'] as const) if (r.filled.includes(k) && cur[k] === v[k]) data[k] = null;
        if (r.filled.includes('externalId') && cur.externalId === v.externalId) { data.externalId = null; data.externalSource = null; }
        if (Object.keys(data).length) await tx.customerVehicle.update({ where: { id: r.resultId! }, data });
      }
    }
    const keptIds = new Set(kept.map((r) => r.id));
    await tx.importRow.updateMany({ where: { id: { in: rows.filter((r) => !keptIds.has(r.id)).map((r) => r.id) } }, data: { status: 'UNDONE' } });
  }, TX);
  const left = await prisma.importRow.count({ where: { jobId: job.id, status: { in: ['CREATED', 'UPDATED'] } } });
  if (left > 0) return { done: false, left, blockers: [] };
  const res = await prisma.importJob.updateMany({ where: { id: job.id, status: 'UNDOING' }, data: { status: 'UNDONE', undoneAt: new Date(), undoneById: userId } });
  if (res.count) {
    const [binned, kept] = await Promise.all([prisma.importRow.count({ where: { jobId: job.id, status: 'UNDONE', resultId: { not: null }, filled: { isEmpty: true } } }), prisma.importRow.count({ where: { jobId: job.id, status: 'KEPT' } })]);
    await writeAuditLog({ userId, action: 'data_exchange.undone', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, entity: ENTITIES[entity].label, movedToRecycleBin: binned, keptBecauseOfNewWork: kept } });
  }
  return { done: true, left: 0, blockers: [] };
}

// ── Dashboard ───────────────────────────────────────────────────────────

/** Imports waiting on this person: approval (for approvers, never their own), and their own sent back or ready to load. */
export async function getDataExchangeDashboardItems(): Promise<{ id: string; title: string; detail: string; url: string; createdAt: Date }[]> {
  const [run, approve] = await Promise.all([canRun(), canApprove()]);
  if (!run && !approve) return [];
  const { userId, organisationId } = await exchangeOrg();
  const [waiting, mine] = await Promise.all([
    approve ? prisma.importJob.findMany({ where: { organisationId, status: 'AWAITING_APPROVAL', createdById: { not: userId } }, orderBy: { submittedAt: 'asc' }, take: 10, select: { id: true, number: true, entity: true, fileName: true, goodRows: true, warningRows: true, submittedAt: true, createdAt: true } }) : [],
    run ? prisma.importJob.findMany({ where: { organisationId, createdById: userId, OR: [{ status: 'APPROVED' }, { status: 'VALIDATED', error: { startsWith: 'Sent back' } }] }, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, number: true, status: true, entity: true, fileName: true, updatedAt: true } }) : [],
  ]);
  const label = (e: string) => (isEntityKey(e) ? ENTITIES[e].plural : 'records');
  return [
    ...waiting.map((j) => ({ id: `import-approve-${j.id}`, title: `Approve import ${j.number}`, detail: `${(j.goodRows + j.warningRows).toLocaleString('en-NG')} ${label(j.entity)} from ${j.fileName}`, url: `/data-exchange/imports/${j.id}`, createdAt: j.submittedAt ?? j.createdAt })),
    ...mine.map((j) => ({ id: `import-mine-${j.id}`, title: j.status === 'APPROVED' ? `Import ${j.number} approved — load it` : `Import ${j.number} sent back`, detail: `${label(j.entity)} from ${j.fileName}`, url: `/data-exchange/imports/${j.id}`, createdAt: j.updatedAt })),
  ];
}

// ── Files out: the rejects file and the full report ─────────────────────

/** One page of an import's rows for a download (kind: rejects = rejected and duplicates; possible = possible duplicates; all = every row with its outcome). */
export async function importRowsPage(jobId: string, kind: 'rejects' | 'possible' | 'all', afterRow: number): Promise<{ headers: string[]; rows: { rowNumber: number; status: string; cells: string[]; issues: Issue[]; matchedBy: string | null; resultId: string | null }[]; number: string; entity: EntityKey }> {
  const [run, approve] = await Promise.all([canRun(), canApprove()]);
  if (!run && !approve) await authorize('dataexchange.import.run', undefined, 'importRowsPage', 'Only the people who bring records into the system can download import files.');
  const job = await myImportJob(jobId);
  const where: Prisma.ImportRowWhereInput = { jobId: job.id, rowNumber: { gt: Math.trunc(Number(afterRow) || 0) } };
  if (kind === 'rejects') where.status = { in: ['REJECTED', 'DUPLICATE'] };
  if (kind === 'possible') where.matchedBy = 'phone';
  const rows = await prisma.importRow.findMany({ where, orderBy: { rowNumber: 'asc' }, take: 5000, select: { rowNumber: true, status: true, cells: true, issues: true, matchedBy: true, resultId: true } });
  if (Math.trunc(Number(afterRow) || 0) === 0) {
    await writeAuditLog({ userId: (await exchangeOrg()).userId, action: 'data_exchange.file_downloaded', entityType: 'ImportJob', entityId: job.id, metadata: { number: job.number, file: kind === 'rejects' ? 'rejected rows' : kind === 'possible' ? 'possible duplicates' : 'full report' } });
  }
  return {
    number: job.number,
    entity: job.entity as EntityKey,
    headers: (job.headers as unknown[]).map(String),
    rows: rows.map((r) => ({ rowNumber: r.rowNumber, status: r.status, cells: (r.cells as unknown[]).map((c) => String(c ?? '')), issues: (r.issues as Issue[] | null) ?? [], matchedBy: r.matchedBy, resultId: r.resultId })),
  };
}
