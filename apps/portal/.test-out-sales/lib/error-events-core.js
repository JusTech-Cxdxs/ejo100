"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KIND_TODO = exports.KIND_LABEL = exports.ERROR_KINDS = void 0;
exports.isErrorKind = isErrorKind;
exports.classifyError = classifyError;
exports.isControlFlowDigest = isControlFlowDigest;
exports.normaliseRef = normaliseRef;
exports.buildErrorEventRow = buildErrorEventRow;
exports.createRateGate = createRateGate;
exports.createSeen = createSeen;
const errors_1 = require("./errors");
exports.ERROR_KINDS = [
    { key: 'database', label: 'Database', todo: 'A database rule refused the change, or a query failed. The message usually names the table or rule. Check the record the person was working on; if many people hit the same error after a release, the database may need its schema update.' },
    { key: 'connection', label: 'Connection', todo: 'The server could not reach the database, the mail server or another service. Check the hosting status pages for that time. Several references within a few minutes usually means a short outage, not a fault in one record.' },
    { key: 'permission', label: 'Permission', todo: 'The person tried something their role does not allow, or their session ended. Check their roles on the Users page. If they should be allowed, adjust the role on the Roles page.' },
    { key: 'not-found', label: 'Not found', todo: 'The record was removed or belongs to another organisation. Confirm the record exists and that the person is in the right organisation and branch.' },
    { key: 'render', label: 'Page failed to load', todo: 'A page failed while loading. Open the same page as the same kind of user to reproduce it, and look at the record it shows. Send the reference and the path to the development team if it repeats.' },
    { key: 'action', label: 'Save or button failed', todo: 'A save or button press failed on the server. Ask the person what they clicked. Nothing was half-saved: changes run in transactions and are either saved in full or not at all.' },
    { key: 'route', label: 'Background request failed', todo: 'An API or scheduled request failed. Check Settings → Scheduled jobs for the last run, and retry the job if needed.' },
    { key: 'browser', label: 'Browser', todo: 'It failed inside the person\'s browser, often a dropped connection or a tab left open across an update. Ask them to refresh the page. If it repeats, note their browser and device.' },
    { key: 'unknown', label: 'Other', todo: 'Send the reference, the time and the path to the development team.' },
];
exports.KIND_LABEL = Object.fromEntries(exports.ERROR_KINDS.map((k) => [k.key, k.label]));
exports.KIND_TODO = Object.fromEntries(exports.ERROR_KINDS.map((k) => [k.key, k.todo]));
function isErrorKind(v) {
    return typeof v === 'string' && exports.ERROR_KINDS.some((k) => k.key === v);
}
/** Sort a failure into one of the kinds above. `context` is where it was caught. */
function classifyError(err, context) {
    const e = err;
    const code = typeof e?.code === 'string' ? e.code : '';
    const text = `${e?.name ?? ''} ${typeof e?.message === 'string' ? e.message : String(err ?? '')}`;
    if (/^P1\d{3}$/.test(code) || code === 'P2024' || /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|Failed to fetch|socket hang up|NetworkError|Load failed|Can't reach database|connection (pool|terminated|refused)/i.test(text))
        return 'connection';
    if (/^P2\d{3}$/.test(code) || /Prisma|violates .* constraint|duplicate key value|deadlock detected/i.test(text))
        return 'database';
    if (/not authenticated|permission|not allowed|access denied|forbidden/i.test(text))
        return 'permission';
    if (/not found|no longer exists|not available/i.test(text))
        return 'not-found';
    if (context?.where === 'browser')
        return 'browser';
    if (context?.routeType === 'render')
        return 'render';
    if (context?.routeType === 'action' || (context?.where && context.where !== 'route'))
        return 'action';
    if (context?.routeType === 'route' || context?.routeType === 'middleware' || context?.where === 'route')
        return 'route';
    return 'unknown';
}
/** Digests Next.js uses for control flow (redirect, notFound, static bail-outs): not failures. */
function isControlFlowDigest(digest) {
    return typeof digest === 'string' && /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(digest);
}
/** What a person can paste into the search box: digits, letters and dashes, nothing else. */
function normaliseRef(input) {
    if (typeof input !== 'string')
        return null;
    const t = input.trim().replace(/^(ref(erence)?[:#\s]*)/i, '').replace(/[.\s]+$/, '');
    return /^[A-Za-z0-9-]{4,40}$/.test(t) ? t : null;
}
const cut = (v, max) => {
    if (v === null || v === undefined || v === '')
        return null;
    return (0, errors_1.cleanForLog)(String(v)).slice(0, max);
};
/** The stored row: redacted, emails masked, the query string dropped from the path, everything capped. */
function buildErrorEventRow(input) {
    const e = input.err;
    const message = typeof e?.message === 'string' && e.message ? e.message : typeof input.err === 'string' ? input.err : 'No message';
    return {
        ref: input.ref.slice(0, 40),
        app: input.app,
        organisationId: input.organisationId ?? null,
        userId: input.userId ?? null,
        customerId: input.customerId ?? null,
        method: cut(input.method, 10),
        path: cut(input.path?.split('?')[0], 300),
        route: cut(input.route, 300),
        kind: input.kind ?? classifyError(input.err),
        name: cut(e?.name, 100),
        message: cut(message, 1000) ?? 'No message',
        stack: e?.stack ? cut(e.stack.split('\n').slice(0, 8).join('\n'), 1500) : null,
    };
}
/** At most `max` per minute: a crash loop never floods the table or the database. */
function createRateGate(max, windowMs = 60_000) {
    let start = 0;
    let n = 0;
    return (now = Date.now()) => {
        if (now - start >= windowMs) {
            start = now;
            n = 0;
        }
        n += 1;
        return n <= max;
    };
}
/** Remembers the last `size` references, so one failure reported twice is stored once. */
function createSeen(size = 500) {
    const seen = new Set();
    return (ref) => {
        if (seen.has(ref))
            return true;
        seen.add(ref);
        if (seen.size > size)
            seen.delete(seen.values().next().value);
        return false;
    };
}
