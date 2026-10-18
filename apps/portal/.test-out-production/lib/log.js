"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logFailure = logFailure;
const errors_1 = require("./errors");
/**
 * One structured, redacted log line for a failure (LOG-01). Replaces raw
 * `console.error('…', err)` calls: errors are reduced to name / code /
 * message / the first stack lines, every value has secrets removed, and
 * email addresses are masked — logs never carry tokens, passwords or a
 * person's full email.
 */
const clean = errors_1.cleanForLog;
function describe(value) {
    if (value instanceof Error) {
        const e = value;
        return { name: e.name, code: e.code, digest: e.digest, message: clean(String(e.message)), stack: e.stack ? clean(e.stack.split('\n').slice(1, 5).join(' | ')) : undefined };
    }
    if (typeof value === 'string')
        return clean(value);
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean')
        return value ?? null;
    try {
        return JSON.parse(clean(JSON.stringify(value)));
    }
    catch {
        return clean(String(value));
    }
}
function logFailure(message, ...details) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), message: clean(message), details: details.map(describe) }));
}
