"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.END_REASON_LABEL = exports.ASSIST_ATTEMPT_WINDOW_MS = exports.ASSIST_MAX_FAILED_ATTEMPTS = exports.ASSIST_MAX_MINUTES = exports.ASSIST_MIN_MINUTES = exports.ASSIST_DEFAULT_MINUTES = void 0;
exports.isSensitivePermission = isSensitivePermission;
exports.effectivePermissions = effectivePermissions;
exports.sensitivePermissionsOf = sensitivePermissionsOf;
exports.assistRefusal = assistRefusal;
exports.assistMinutes = assistMinutes;
exports.actorLabel = actorLabel;
exports.assistedByOf = assistedByOf;
exports.assistSummary = assistSummary;
exports.minutesBetween = minutesBetween;
const catalogue_1 = require("../authz/catalogue");
const pluralize_1 = require("../utils/pluralize");
/**
 * Assisted sessions: the rules, with no database and no request, so they can
 * be tested on their own. A branch assistant may work on a colleague's behalf
 * only when the colleague's own access holds nothing sensitive, and only with
 * the colleague's password typed as consent.
 */
exports.ASSIST_DEFAULT_MINUTES = 30;
exports.ASSIST_MIN_MINUTES = 5;
exports.ASSIST_MAX_MINUTES = 120;
/** Wrong passwords allowed per assistant and colleague in the window below. */
exports.ASSIST_MAX_FAILED_ATTEMPTS = 5;
exports.ASSIST_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
/** Permissions that keep a person out of assisted sessions: approvals, money,
 * prices, administration, the audit trail, analytics, broadcasts, incident
 * handling and assisting itself. Someone holding any of these signs in
 * themselves. */
const SENSITIVE_EXACT = new Set([
    'workshop.payment.record',
    'workshop.refund.record',
    'audit.view',
    'notifications.broadcast.send',
    'security.incident.manage',
    'support.assist',
    // Sets selling prices and stock levels, which is money by another name.
    'store.parts.manage',
    // Reviewing colleagues' conduct, setting up support and the AI: never on someone else's behalf.
    'integrity.review',
    'support.manage',
    'enyo.manage',
]);
const SENSITIVE_PREFIXES = ['admin.', 'analytics.', 'procurement.epr.'];
// Also everything the catalogue lists as a decision or as showing purchase
// costs (kept in step by a unit test), and assigning or managing other
// people's work. Viewing warranties is not sensitive.
const SENSITIVE_FROM_CATALOGUE = new Set([
    ...catalogue_1.APPROVAL_PERMISSIONS,
    ...catalogue_1.STORE_COST_PERMISSIONS.filter((k) => k !== 'warranty.view'),
    'workshop.technician.assign',
    'warranty.manage',
]);
function isSensitivePermission(key) {
    if (SENSITIVE_EXACT.has(key) || SENSITIVE_FROM_CATALOGUE.has(key))
        return true;
    if (/approve/.test(key))
        return true;
    return SENSITIVE_PREFIXES.some((p) => key.startsWith(p));
}
/** Every permission the person holds, from their roles and added grants. */
function effectivePermissions(p) {
    return Object.keys(catalogue_1.PERMISSIONS).filter((k) => (0, catalogue_1.scopeFor)(p, k) !== null);
}
/** The sensitive permissions a person holds (empty means they can be assisted). */
function sensitivePermissionsOf(p) {
    if (p.isSuperAdmin)
        return ['admin.organisation.manage'];
    return effectivePermissions(p).filter(isSensitivePermission);
}
/**
 * Whether `assistant` may work on behalf of `colleague` right now, or why not.
 * Checked when the session starts and again on every request while it lasts.
 */
function assistRefusal(assistant, colleague) {
    if (!assistant.isActive)
        return { code: 'ASSISTANT_INACTIVE', message: 'Your account is switched off.' };
    if (assistant.isSuperAdmin)
        return { code: 'PLATFORM_TEAM', message: 'The platform team does not use assisted sessions.' };
    const scope = (0, catalogue_1.scopeFor)(assistant, 'support.assist');
    if (!scope)
        return { code: 'NOT_ALLOWED', message: 'Only a Branch Assistant can help colleagues this way.' };
    if (colleague.userId === assistant.userId)
        return { code: 'SELF', message: 'You cannot start an assisted session for yourself.' };
    // Same organisation always. Branch-scoped assistants (the normal case) also
    // need to belong to a branch, and the colleague to the same one.
    if (!assistant.organisationId || colleague.organisationId !== assistant.organisationId)
        return { code: 'OUT_OF_REACH', message: 'This colleague is not someone you can assist.' };
    if (scope !== 'ALL') {
        if (!assistant.branchId)
            return { code: 'NO_BRANCH', message: 'Your account is not placed in a branch yet. Ask your administrator.' };
        if (colleague.branchId !== assistant.branchId)
            return { code: 'OUT_OF_REACH', message: 'This colleague is not someone you can assist.' };
    }
    if (!colleague.isActive)
        return { code: 'COLLEAGUE_INACTIVE', message: 'This colleague\'s account is switched off.' };
    if (colleague.isSuperAdmin || sensitivePermissionsOf(colleague).length > 0) {
        return { code: 'SENSITIVE', message: 'This colleague has approval, money or administration access, so they must sign in themselves.' };
    }
    return null;
}
/** How long a session lasts, from ASSIST_SESSION_MINUTES (default 30, between 5 and 120). */
function assistMinutes(raw) {
    const n = Math.round(Number(raw));
    if (!raw || !Number.isFinite(n) || n <= 0)
        return exports.ASSIST_DEFAULT_MINUTES;
    return Math.min(exports.ASSIST_MAX_MINUTES, Math.max(exports.ASSIST_MIN_MINUTES, n));
}
// ── Wording ─────────────────────────────────────────────────────────────
/** "Musa Ibrahim (assisted by Ada Okafor)" when an audit entry was recorded during an assisted session. */
function actorLabel(name, metadata) {
    const by = assistedByOf(metadata);
    if (!by)
        return name;
    return `${name ?? 'Someone'} (assisted by ${by.name})`;
}
function assistedByOf(metadata) {
    if (!metadata || typeof metadata !== 'object')
        return null;
    const by = metadata.assistedBy;
    if (!by || typeof by !== 'object')
        return null;
    const { id, name } = by;
    return typeof id === 'string' && typeof name === 'string' && name ? { id, name } : null;
}
/** The colleague's notification when a session ends. */
function assistSummary(assistantName, from, to, actions) {
    return `${assistantName} helped you with your work from ${from} to ${to} — ${actions === 0 ? 'no actions recorded' : `${(0, pluralize_1.pluralize)(actions, 'action')} recorded`}.`;
}
/** How a session ended, in words for the history list. */
exports.END_REASON_LABEL = {
    ended_by_assistant: 'Ended by the assistant',
    expired: 'Time ran out',
    assistant_signed_out: 'The assistant signed out',
    colleague_switched_off: 'The colleague\'s account was switched off',
    no_longer_assistable: 'The colleague\'s access changed',
    assistant_not_allowed: 'The assistant\'s access changed',
    replaced: 'A new session was started',
};
function minutesBetween(a, b) {
    return Math.max(0, Math.round((+b - +a) / 60000));
}
