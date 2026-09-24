import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * The data journal — the platform's "nothing is ever missed" audit layer.
 *
 * Every create / update / delete that goes through the shared Prisma
 * client — from the portal, the API, a scheduled job, or any future
 * code — is written to audit_logs automatically: WHO (the signed-in
 * user carried through the request), WHAT (the model, the record, the
 * values written, and for updates/deletes the values before), and WHEN.
 * It can't be skipped by forgetting a log call, because it sits below
 * every feature.
 *
 * It complements, never replaces, the business audit entries written by
 * each action ("Estimate line added — priced at ₦…"): those are the
 * human-readable story on each record's page; this is the complete,
 * low-level record for the audit dashboard. Journal entries use the
 * entityType "db:<Model>" and actions "data.<operation>", so they never
 * clutter a record page's own trail.
 *
 * Safety:
 * - Auth internals (sessions, accounts, verification tokens) are not
 *   journaled, and any password / token / secret / hash field anywhere
 *   is redacted.
 * - Inside a database transaction no extra query is ever made (a
 *   single-connection pool would otherwise wait on itself forever): the
 *   entry is held for this request and written by the request's next
 *   ordinary query — normally the business audit entry that follows.
 * - A journal failure never breaks the real operation.
 */

type AuditActor = { userId: string | null; source: string };
type PendingEntry = Prisma.AuditLogCreateManyInput;
type AuditContext = AuditActor & { pending: PendingEntry[] };

const context = new AsyncLocalStorage<AuditContext>();

/**
 * Records who is acting for the rest of this request. Called once the
 * user is authenticated (portal requireUser, API session guard) or by a
 * scheduled job with a null user and its own source name.
 */
export function setAuditActor(userId: string | null, source: string): void {
  const existing = context.getStore();
  if (existing && existing.userId === userId && existing.source === source) return;
  context.enterWith({ userId, source, pending: existing?.pending ?? [] });
}

/** The actor recorded for the current request, if any. */
export function getAuditActor(): AuditActor | null {
  const store = context.getStore();
  return store ? { userId: store.userId, source: store.source } : null;
}

const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const SKIP_MODELS = new Set(['AuditLog', 'Session', 'Account', 'Verification']);
const SENSITIVE_KEY = /password|token|secret|hash/i;
const MAX_JSON = 6000;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 6) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    // Prisma Decimal and similar: serialise via toString/toJSON.
    const maybe = value as { toJSON?: () => unknown; constructor?: { name?: string } };
    if (maybe.constructor?.name === 'Decimal' && typeof (value as { toString: () => string }).toString === 'function') {
      return (value as { toString: () => string }).toString();
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function capped(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const safe = redact(value);
  const text = JSON.stringify(safe);
  if (text === undefined) return undefined;
  return (text.length > MAX_JSON ? { truncated: true, preview: text.slice(0, MAX_JSON) } : safe) as Prisma.InputJsonValue;
}

function modelDelegate(client: PrismaClient, model: string): { findUnique?: (a: unknown) => Promise<unknown> } | undefined {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (client as unknown as Record<string, { findUnique?: (a: unknown) => Promise<unknown> }>)[key];
}

/** Only the fields an update actually touched, before and after. */
function changedFields(before: Record<string, unknown> | null, data: Record<string, unknown> | undefined) {
  if (!before || !data) return { before: before ?? undefined, after: data };
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    b[key] = before[key];
    a[key] = data[key];
  }
  return { before: b, after: a };
}

export function installAuditJournal(client: PrismaClient): void {
  const flag = client as unknown as { __auditJournalInstalled?: boolean };
  if (flag.__auditJournalInstalled) return;
  flag.__auditJournalInstalled = true;

  client.$use(async (params, next) => {
    const store = context.getStore();

    // Write any entries held from an earlier transaction, now that we're
    // outside one (never adds a query inside a transaction).
    if (store && store.pending.length > 0 && !params.runInTransaction) {
      const batch = store.pending.splice(0, store.pending.length);
      try {
        await client.auditLog.createMany({ data: batch });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Audit journal: failed to write held entries', err);
      }
    }

    if (!params.model || SKIP_MODELS.has(params.model) || !WRITE_ACTIONS.has(params.action)) {
      return next(params);
    }

    const args = (params.args ?? {}) as { where?: unknown; data?: unknown; create?: unknown; update?: unknown };
    const single = params.action === 'update' || params.action === 'delete' || params.action === 'upsert';

    let before: Record<string, unknown> | null = null;
    if (single && args.where && !params.runInTransaction) {
      try {
        const delegate = modelDelegate(client, params.model);
        before = ((await delegate?.findUnique?.({ where: args.where })) as Record<string, unknown> | null) ?? null;
      } catch {
        before = null;
      }
    }

    const result = await next(params);

    try {
      const resultId = result && typeof result === 'object' && 'id' in (result as Record<string, unknown>) ? String((result as { id: unknown }).id) : null;
      const whereId = args.where && typeof args.where === 'object' && 'id' in (args.where as Record<string, unknown>) ? String((args.where as { id: unknown }).id) : null;
      let metadata: Record<string, unknown>;
      if (params.action === 'update') {
        const diff = changedFields(before, args.data as Record<string, unknown> | undefined);
        metadata = { before: diff.before, after: diff.after };
      } else if (params.action === 'upsert') {
        metadata = before ? { operation: 'updated', ...changedFields(before, args.update as Record<string, unknown> | undefined) } : { operation: 'created', after: args.create };
      } else if (params.action === 'delete') {
        metadata = { before };
      } else if (params.action === 'create') {
        metadata = { after: args.data };
      } else {
        metadata = {
          where: args.where,
          data: args.data,
          count: result && typeof result === 'object' && 'count' in (result as Record<string, unknown>) ? (result as { count: number }).count : undefined,
        };
      }
      const entry: PendingEntry = {
        userId: store?.userId ?? null,
        action: `data.${params.action}`,
        entityType: `db:${params.model}`,
        entityId: resultId ?? whereId,
        metadata: capped({ ...metadata, source: store?.source ?? 'unknown', ...(params.runInTransaction ? { inTransaction: true } : {}) }),
      };
      if (params.runInTransaction) {
        // Held for this request; written by its next ordinary query. With
        // no actor context at all, one is opened so the entry is kept
        // (as unattributed) rather than dropped.
        if (store) {
          store.pending.push(entry);
        } else {
          context.enterWith({ userId: null, source: 'unattributed', pending: [entry] });
        }
      } else {
        await client.auditLog.create({ data: entry });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Audit journal: failed to record', params.model, params.action, err);
    }
    return result;
  });
}
