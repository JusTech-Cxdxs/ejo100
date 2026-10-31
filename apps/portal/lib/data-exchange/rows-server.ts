/**
 * Data Exchange — writing many staged rows' results at once (server only,
 * never a 'use server' file: nothing here is callable from a browser).
 * Parameterised arrays through unnest; no SQL is ever built as text.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@ejo/database';
import type { Issue } from './check';

export const newId = () => `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;
export const keyVal = (keys: string[], kind: string) => keys.find((k) => k.startsWith(`${kind}:`))?.slice(kind.length + 1) ?? null;

export type RowUpdate = { id: string; status: string; issues: Issue[] | null; matchedId: string | null; matchedBy: string | null; keys: string[] };

/** Many rows' results in one statement (parameterised arrays; no SQL is built as text). With `onlyIfStatus`, a row another page already moved on is left as it is. */
export async function writeRowResults(tx: Prisma.TransactionClient, updates: RowUpdate[], onlyIfStatus: string | null = null): Promise<void> {
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
     WHERE r.id = v.id AND (${onlyIfStatus}::text IS NULL OR r.status = ${onlyIfStatus}::text)`;
}

export type LoadRow = { id: string; cells: Prisma.JsonValue; issues: Prisma.JsonValue; matchedBy: string | null };
export type JobForLoad = { id: string; organisationId: string; sourceSystem: string; matchMode: string; possibleDuplicates: string; createdById: string };
export type Result = { id: string; status: 'CREATED' | 'UPDATED' | 'SKIPPED'; resultId: string | null; note?: string; filled?: string[] };

/** Row results after loading: status, the record, notes added, fields filled. */
export async function writeLoadResults(tx: Prisma.TransactionClient, rows: LoadRow[], results: Result[]): Promise<void> {
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

