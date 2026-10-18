"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TECHNICAL = void 0;
exports.redact = redact;
exports.maskEmails = maskEmails;
exports.cleanForLog = cleanForLog;
exports.newRef = newRef;
exports.setErrorSink = setErrorSink;
exports.logError = logError;
exports.isPlainMessage = isPlainMessage;
exports.withReference = withReference;
exports.friendlyError = friendlyError;
/**
 * Turning failures into messages people can act on, and logs engineers can
 * debug, without ever showing users technical text or logging secrets.
 *
 *  • Our own business messages ("Give a reason for declining") pass through.
 *  • Database conditions become plain words (duplicate, gone, conflict).
 *  • Anything technical becomes "Something went wrong… quote reference
 *    1234567890". The same number is in the server log and on the Error log
 *    page (Audit Logs → Error log), so IT can look it up.
 *
 * Pure and edge-safe: no database here. The server registers a sink
 * (instrumentation.ts → lib/error-events.ts) that stores each reference.
 */
const PRISMA = {
    P2002: 'That already exists. Check for a duplicate.',
    P2003: 'This is linked to something that no longer exists. Refresh the page and try again.',
    P2025: 'This record no longer exists or was just changed. Refresh the page.',
    P2034: 'Someone else changed this at the same time. Refresh and try again.',
    P1001: 'The database is not reachable right now. Please try again in a moment.',
    P1008: 'The database took too long to answer. Please try again.',
    P2024: 'The system is very busy right now. Please try again in a moment.',
};
/** Server-generated, "latest + 1" reference columns (RF-…, JC-…, VIS-…). */
const GENERATED_NUMBER = /(?<![A-Za-z])(referenceNumber|jobNumber|serviceNumber|appointmentNumber|visitNumber|passNumber|claimNumber|warrantyNumber|exitNumber|permitNumber|incidentNumber|deliveryNumber|broadcastNumber|number|serialNumber|sku)(?![A-Za-z])/;
/** Text that must never reach a person: library internals, stack frames, runtime errors, SQL. */
exports.TECHNICAL = /prisma|invocation|Invalid `|Unknown argument|Argument `|Cannot read propert|Cannot set propert|undefined is not|null is not|is not a function|is not defined|is not iterable|Maximum call stack|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|Failed to fetch|socket|stack|SyntaxError|TypeError|ReferenceError|RangeError|Unexpected token|JSON\.parse|\bat [\w.<>]+ \(|\bat async\b|\.tsx?:\d+|\.js:\d+|node_modules|ERR_[A-Z_]+|violates (foreign key|unique|check|not-null) constraint|relation "|column "|duplicate key value|deadlock detected|could not serialize|connection (pool|terminated|refused)|query engine/i;
/** Remove anything secret-looking before it reaches a log. */
function redact(text) {
    return text
        .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1***@')
        .replace(/\b(bearer|token|apikey|api_key|password|secret|authorization|cookie)\b(["':=\s]+)[^\s"',}]+/gi, '$1$2***')
        .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '***jwt***')
        .replace(/(reset-password|set-password|email-verification)[:/][A-Za-z0-9_-]{8,}/gi, '$1:***')
        .slice(0, 2000);
}
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
/** a***@example.com: enough to recognise, not enough to harvest. */
function maskEmails(text) {
    return text.replace(EMAIL, '$1***@$2');
}
/** Redacted and email-masked: the only form of error text that is logged or stored. */
function cleanForLog(text) {
    return maskEmails(redact(text));
}
/**
 * A 10-digit reference, the same shape as the digest Next.js gives render
 * errors, so every reference a person quotes looks alike and is easy to read
 * out over the phone.
 */
function newRef() {
    const a = new Uint32Array(2);
    globalThis.crypto.getRandomValues(a);
    return String(1_000_000_000 + (a[0] % 900_000) * 10_000 + (a[1] % 10_000));
}
let sink = null;
/** Registered once by the server (instrumentation.ts). Never set in the browser. */
function setErrorSink(fn) {
    sink = fn;
}
/** Structured server log line (JSON): what, where, when, reference; no secrets. Returns the reference. */
function logError(where, err, extra) {
    const r = newRef();
    const e = err;
    console.error(JSON.stringify({
        level: 'error', ref: r, where, at: new Date().toISOString(), name: e?.name, code: e?.code,
        message: cleanForLog(String(e?.message ?? err)),
        stack: e?.stack ? cleanForLog(e.stack.split('\n').slice(0, 6).join(' | ')) : undefined,
        ...(extra ? { extra: JSON.parse(cleanForLog(JSON.stringify(extra))) } : {}),
    }));
    try {
        sink?.({ ref: r, where, err, extra });
    }
    catch {
        /* storing the reference is best effort; the log line above is already written */
    }
    return r;
}
/** True when a message is safe to show a person as it is. */
function isPlainMessage(msg) {
    return msg.length > 0 && msg.length <= 300 && !msg.includes('\n') && !exports.TECHNICAL.test(msg);
}
/** The words people see with a reference. */
function withReference(fallback, ref) {
    return `${fallback} Something went wrong on our side. Please try again, and if it keeps happening, quote reference ${ref}.`;
}
/** The message to show the person. */
function friendlyError(err, fallback = 'That could not be completed.', where = 'action') {
    const e = err;
    // Next.js redirects / not-found are control flow, not errors.
    if (e?.digest?.startsWith?.('NEXT_'))
        throw err;
    // Two identical submissions raced: the database kept exactly one, so it went through.
    if (e?.code === 'P2002' && JSON.stringify(e.meta?.target ?? '').includes('idempotencyKey')) {
        return 'This was already recorded and went through. Refresh the page to see it.';
    }
    // Two records saved at the same instant picked the same generated number.
    // The database refused the second, so nothing was duplicated: save again.
    // A batch, serial, plate or chassis number the person typed is a real
    // duplicate and falls through to P2002 below.
    if (e?.code === 'P2002' && GENERATED_NUMBER.test(JSON.stringify(e.meta?.target ?? ''))) {
        logError(where, err);
        return 'Someone else saved a record at exactly the same moment, so this one was not saved. Please submit it again.';
    }
    if (e?.code && PRISMA[e.code]) {
        const r = logError(where, err);
        // Connection trouble carries a reference too, so IT can match it to an outage.
        return /^P1/.test(e.code) || e.code === 'P2024' ? `${PRISMA[e.code]} If it keeps happening, quote reference ${r}.` : PRISMA[e.code];
    }
    const msg = typeof e?.message === 'string' ? e.message.trim() : '';
    if (isPlainMessage(msg))
        return msg;
    return withReference(fallback, logError(where, err));
}
