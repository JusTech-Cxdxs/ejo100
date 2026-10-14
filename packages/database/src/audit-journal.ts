import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * The data journal: the low-level audit layer.
 *
 * Every create / update / delete through the shared Prisma client (portal,
 * API, scheduled jobs) is written to audit_logs automatically: who (the
 * actor carried through the request), what (model, record, values written,
 * and for updates/deletes the values before) and when. It sits below every
 * feature, so a missing log call can't skip it.
 *
 * It complements the business audit entries each action writes ("Estimate
 * line added — priced at ₦…"), which are the readable history on record
 * pages. Journal entries use entityType "db:<Model>" and actions
 * "data.<operation>", so they stay out of those pages.
 *
 * Safety:
 * - Auth internals (sessions, accounts, verification tokens) are not
 *   journaled, and any password / token / secret / hash field is redacted.
 * - No extra query is made inside a transaction (a single-connection pool
 *   would wait on itself). Entries are held and written after COMMIT; on
 *   rollback they are dropped, so the journal records what happened, not
 *   what was attempted.
 * - Compare-and-set writes (updateMany / deleteMany on one id) keep before /
 *   after values like update / delete. "Before" is read only outside a
 *   transaction; inside one, the entry has the values written and the where
 *   it matched. A write that changed nothing (count 0) is not journaled.
 * - A journal failure never breaks the operation itself.
 */

/** organisationId: the actor's organisation — every audit row is stamped
 * with it, so each organisation only ever sees its own history. */
/** assistedBy / assistSessionId: set while a branch assistant works on the
 * user's behalf (an assisted session); every entry then names both people. */
type AssistedBy = { id: string; name: string };
type AuditActor = { userId: string | null; source: string; organisationId?: string | null; assistedBy?: AssistedBy | null; assistSessionId?: string | null };
type PendingEntry = Prisma.AuditLogCreateManyInput;
/** An entry written inside a transaction carries that transaction's token
 * until it commits; a rolled-back transaction's entries are dropped, so the
 * journal never records a change that did not happen. */
type Held = { entry: PendingEntry; tx: symbol | null };
type AuditContext = AuditActor & { pending: Held[]; tx?: symbol | null };

const context = new AsyncLocalStorage<AuditContext>();

/**
 * Records who is acting for the rest of this request. Called once the
 * user is authenticated (portal requireUser, API session guard) or by a
 * scheduled job with a null user and its own source name.
 */
export function setAuditActor(userId: string | null, source: string, organisationId: string | null = null, assist: { assistedBy: AssistedBy; assistSessionId: string } | null = null): void {
  const existing = context.getStore();
  if (existing && existing.userId === userId && existing.source === source && (existing.organisationId ?? null) === organisationId && (existing.assistSessionId ?? null) === (assist?.assistSessionId ?? null)) return;
  context.enterWith({ userId, source, organisationId, assistedBy: assist?.assistedBy ?? null, assistSessionId: assist?.assistSessionId ?? null, pending: existing?.pending ?? [], tx: existing?.tx ?? null });
}

/**
 * Finds the acting user when none was recorded in this async context.
 * `setAuditActor` uses AsyncLocalStorage.enterWith, which does not flow back
 * out of an awaited function, so an actor set inside requireUser() is not
 * seen by its caller (E2E-09). The app registers a resolver that reads its
 * cached per-request session. Only called outside a transaction, so it never
 * waits on its own connection.
 */
let actorResolver: (() => Promise<AuditActor | null>) | null = null;
export function setAuditActorResolver(fn: () => Promise<AuditActor | null>): void {
  actorResolver = fn;
}
async function resolveActor(store: AuditContext | undefined): Promise<AuditActor | null> {
  if (store && (store.userId || store.organisationId)) return store;
  if (!actorResolver) return store ?? null;
  try {
    return (await actorResolver()) ?? store ?? null;
  } catch {
    return store ?? null;
  }
}

/** The actor recorded for the current request, if any. */
export function getAuditActor(): AuditActor | null {
  const store = context.getStore();
  return store ? { userId: store.userId, source: store.source, organisationId: store.organisationId ?? null, assistedBy: store.assistedBy ?? null, assistSessionId: store.assistSessionId ?? null } : null;
}

/** Who is acting in this request, asking the app's resolver when nothing was
 * recorded in this async context. Never call inside a transaction. */
export async function currentAuditActor(): Promise<AuditActor | null> {
  const actor = await resolveActor(context.getStore());
  return actor ? { userId: actor.userId, source: actor.source, organisationId: actor.organisationId ?? null, assistedBy: actor.assistedBy ?? null, assistSessionId: actor.assistSessionId ?? null } : null;
}

/** userId → organisationId, remembered for five minutes (people rarely move). */
const orgOfUser = new Map<string, { org: string | null; at: number }>();
async function organisationOf(client: PrismaClient, userId: string): Promise<string | null> {
  const hit = orgOfUser.get(userId);
  if (hit && Date.now() - hit.at < 300_000) return hit.org;
  const u = await client.user.findUnique({ where: { id: userId }, select: { organisationId: true } });
  const org = u?.organisationId ?? null;
  if (orgOfUser.size > 5000) orgOfUser.clear();
  orgOfUser.set(userId, { org, at: Date.now() });
  return org;
}

/** Stamp an audit row with its organisation when the writer did not: the
 * request's actor, else the row's own user. Never inside a transaction
 * (no extra query there) and never throws. */
async function stampOrganisation(client: PrismaClient, row: Record<string, unknown>, store: AuditContext | undefined, inTx: boolean): Promise<void> {
  if (row.organisationId) return;
  if (store?.organisationId) {
    row.organisationId = store.organisationId;
    return;
  }
  if (inTx) return;
  const actor = await resolveActor(store);
  if (actor?.organisationId) {
    row.organisationId = actor.organisationId;
    return;
  }
  if (!row.userId && actor?.userId) row.userId = actor.userId;
  const userId = typeof row.userId === 'string' ? row.userId : null;
  try {
    if (userId) row.organisationId = await organisationOf(client, userId);
    // Platform team, scheduled jobs and unattributed writes: while there is
    // exactly one organisation, the row is that organisation's. With several,
    // it stays with the platform team (null) unless the writer names one.
    if (!row.organisationId) row.organisationId = await soleOrganisation(client);
  } catch {
    /* unstamped rows are visible to the platform team only */
  }
}

let sole: { id: string | null; at: number } | null = null;
async function soleOrganisation(client: PrismaClient): Promise<string | null> {
  if (sole && Date.now() - sole.at < 300_000) return sole.id;
  const orgs = await client.organisation.findMany({ select: { id: true }, take: 2 });
  sole = { id: orgs.length === 1 ? orgs[0]!.id : null, at: Date.now() };
  return sole.id;
}

const WRITE_ACTIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
// Notification read-markers and mute settings are personal screen state, not
// business data — journaling them would make every "mark as read" look like
// company activity.
// Customer-portal auth tables are auth internals too: a CustomerVerification
// identifier IS a live reset token, so it must never reach audit_logs.
const SKIP_MODELS = new Set([
  'AuditLog', 'Session', 'Account', 'Verification', 'NotificationRead', 'NotificationPreference',
  'CustomerSession', 'CustomerAccount', 'CustomerVerification', 'CustomerNotificationRead',
  // Error references are written by the error handler itself — never journaled.
  'ErrorEvent',
  // A recycle-bin snapshot is a full copy of the deleted rows. The move,
  // restore and purge each write their own business audit entry instead.
  'RecycleBinItem',
  // v31: chat transcripts, email contents and prediction logs are high-volume
  // personal content, not business changes. Mailbox connect/disconnect, ticket
  // and reminder actions write their own business audit entries instead.
  'EnyoConversation', 'EnyoMessage', 'EnyoMemory', 'EnyoPrediction',
  'MailAccount', 'MailMessage',
  // Message bodies, contact details and reminder notes stay out of audit_logs;
  // replies, status changes, assignments and reminder steps write their own
  // business audit entries without the text.
  'SupportTicket', 'SupportReply', 'Reminder',
]);
const SENSITIVE_KEY = /password|token|secret|hash/i;
const MAX_JSON = 6000;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > 6) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    // Prisma Decimal (and anything with toJSON): use toJSON. Don't test
    // constructor.name, which production builds minify; a Decimal walked as a
    // plain object produced values Postgres refused, losing the batch (E2E-04).
    const maybe = value as { toJSON?: () => unknown };
    if (typeof maybe.toJSON === 'function') return redact(maybe.toJSON(), depth + 1);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  // A one-time link token in any value (e.g. "reset-password:<token>").
  if (typeof value === 'string' && /^(reset-password|email-verification|set-password):/i.test(value)) return '[redacted]';
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

  // Each transaction gets its own token: its journal entries are kept only if
  // it commits and dropped if it rolls back.
  const original = client.$transaction.bind(client) as (arg: unknown, options?: unknown) => Promise<unknown>;
  (client as unknown as { $transaction: (arg: unknown, options?: unknown) => Promise<unknown> }).$transaction = (arg: unknown, options?: unknown) => {
    const outer = context.getStore();
    const token = Symbol('tx');
    const begin = (actor: AuditActor | null) => {
      const inner: AuditContext = outer
        ? { ...outer, ...(actor && !outer.userId && !outer.organisationId ? { userId: actor.userId, source: actor.source, organisationId: actor.organisationId ?? null, assistedBy: actor.assistedBy ?? null, assistSessionId: actor.assistSessionId ?? null } : {}), tx: token }
        : { userId: actor?.userId ?? null, source: actor?.source ?? 'unattributed', organisationId: actor?.organisationId ?? null, assistedBy: actor?.assistedBy ?? null, assistSessionId: actor?.assistSessionId ?? null, pending: [], tx: token };
      return inner;
    };
    const settle = async (committed: boolean) => {
      const list = inner.pending;
      const done: PendingEntry[] = [];
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]!.tx !== token) continue;
        if (!committed) list.splice(i, 1);
        else if (outer?.tx) list[i]!.tx = outer.tx; // nested: belongs to the outer transaction now
        else done.unshift(list.splice(i, 1)[0]!.entry);
      }
      // Committed and outside any transaction: write them now.
      if (done.length > 0) {
        try {
          await client.auditLog.createMany({ data: done });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Audit journal: failed to write committed entries', err);
        }
      }
    };
    // Who is acting is worked out BEFORE the transaction opens (never inside it).
    let inner: AuditContext = begin(null);
    return resolveActor(outer).then((actor) => {
      inner = begin(actor);
      return context.run(inner, () => original(arg, options));
    }).then(
      async (value) => { await settle(true); return value; },
      async (err) => { await settle(false); throw err; },
    );
  };

  client.$use(async (params, next) => {
    const store = context.getStore();

    // Write entries held from an earlier transaction now that we're outside one.
    if (store && store.pending.length > 0 && !params.runInTransaction) {
      // Only entries whose transaction has committed (tx === null).
      const batch: PendingEntry[] = [];
      for (let i = store.pending.length - 1; i >= 0; i--) {
        if (store.pending[i]!.tx === null) batch.unshift(store.pending.splice(i, 1)[0]!.entry);
      }
      if (batch.length > 0) try {
        await client.auditLog.createMany({ data: batch });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Audit journal: failed to write held entries', err);
      }
    }

    // Every audit row, however it was written, carries its organisation.
    if (params.model === 'AuditLog' && (params.action === 'create' || params.action === 'createMany')) {
      const data = (params.args as { data?: unknown } | undefined)?.data;
      for (const row of Array.isArray(data) ? data : data ? [data] : []) {
        if (row && typeof row === 'object') await stampOrganisation(client, row as Record<string, unknown>, store, Boolean(params.runInTransaction));
      }
    }

    if (!params.model || SKIP_MODELS.has(params.model) || !WRITE_ACTIONS.has(params.action)) {
      return next(params);
    }

    const args = (params.args ?? {}) as { where?: unknown; data?: unknown; create?: unknown; update?: unknown };
    // updateMany / deleteMany on ONE record (where: { id, …expected state }) —
    // the compare-and-set shape every workflow step uses — keeps its "before"
    // values exactly like update / delete.
    const oneRecord = (params.action === 'updateMany' || params.action === 'deleteMany')
      && Boolean(args.where && typeof args.where === 'object' && typeof (args.where as { id?: unknown }).id === 'string');
    const single = params.action === 'update' || params.action === 'delete' || params.action === 'upsert' || oneRecord;

    // The journal names the record by the id the write returns: a create with
    // a narrow select (e.g. only the warranty number) must still return it (E2E-10).
    const sel = (params.args as { select?: Record<string, unknown> } | undefined)?.select;
    if ((params.action === 'create' || params.action === 'update' || params.action === 'upsert' || params.action === 'delete') && sel && typeof sel === 'object' && !('id' in sel)) {
      (params.args as { select: Record<string, unknown> }).select = { ...sel, id: true };
    }
    const actor = params.runInTransaction ? store ?? null : await resolveActor(store);

    let before: Record<string, unknown> | null = null;
    if (single && args.where && !params.runInTransaction) {
      try {
        const delegate = modelDelegate(client, params.model);
        const where = oneRecord ? { id: (args.where as { id: string }).id } : args.where;
        before = ((await delegate?.findUnique?.({ where })) as Record<string, unknown> | null) ?? null;
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
        const count = result && typeof result === 'object' && 'count' in (result as Record<string, unknown>) ? (result as { count: number }).count : undefined;
        // Nothing changed (a compare-and-set that lost, a no-op): nothing to journal.
        if (count === 0) return result;
        metadata = oneRecord && params.action === 'updateMany'
          ? { ...changedFields(before, args.data as Record<string, unknown> | undefined), where: args.where, count }
          : oneRecord && params.action === 'deleteMany'
            ? { before, where: args.where, count }
            : { where: args.where, data: args.data, count };
      }
      const entry: PendingEntry = {
        userId: actor?.userId ?? null,
        organisationId: actor?.organisationId ?? null,
        action: `data.${params.action}`,
        entityType: `db:${params.model}`,
        entityId: resultId ?? whereId,
        metadata: capped({ ...metadata, source: actor?.source ?? 'unknown', ...(actor?.assistedBy ? { assistedBy: actor.assistedBy, assistSessionId: actor.assistSessionId ?? null } : {}), ...(params.runInTransaction ? { inTransaction: true } : {}) }),
      };
      if (params.runInTransaction) {
        // Held for this request; written by its next ordinary query. With
        // no actor context at all, one is opened so the entry is kept
        // (as unattributed) rather than dropped.
        if (store) {
          store.pending.push({ entry, tx: store.tx ?? null });
        } else {
          context.enterWith({ userId: null, source: 'unattributed', organisationId: null, pending: [{ entry, tx: null }], tx: null });
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
export { redact as redactForJournal };
