"use strict";
/**
 * Support inbox rules — plain functions shared by the server actions, the
 * pages and the unit tests. No database, no framework.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPLY_MAX = exports.SUPPORT_FILTER_LABEL = exports.SUPPORT_FILTERS = exports.SUPPORT_STATUS_FOR_CUSTOMER = exports.SUPPORT_STATUS_LABEL = exports.SUPPORT_STATUSES = void 0;
exports.isSupportStatus = isSupportStatus;
exports.supportFilter = supportFilter;
exports.filterWhere = filterWhere;
exports.ticketReachWhere = ticketReachWhere;
exports.staffHelpFence = staffHelpFence;
exports.waitLabel = waitLabel;
exports.cleanReply = cleanReply;
exports.SUPPORT_STATUSES = ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD', 'RESOLVED', 'CLOSED'];
exports.SUPPORT_STATUS_LABEL = {
    OPEN: 'Open',
    WAITING_ON_CUSTOMER: 'Waiting on customer',
    ON_HOLD: 'On hold (waiting on others)',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
};
/** What the customer sees for each status (portal emails use the same words as the customer portal). */
exports.SUPPORT_STATUS_FOR_CUSTOMER = {
    OPEN: 'With our team',
    WAITING_ON_CUSTOMER: 'Waiting for your reply',
    // Waiting on the manufacturer, a supplier or an insurer: still with the team.
    ON_HOLD: 'With our team',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
};
function isSupportStatus(v) {
    return typeof v === 'string' && exports.SUPPORT_STATUSES.includes(v);
}
exports.SUPPORT_FILTERS = ['open', 'unassigned', 'mine', 'late', 'waiting', 'on_hold', 'resolved', 'all'];
function supportFilter(v) {
    return typeof v === 'string' && exports.SUPPORT_FILTERS.includes(v) ? v : 'open';
}
exports.SUPPORT_FILTER_LABEL = {
    open: 'Open', unassigned: 'Unassigned', mine: 'Mine', late: 'Late or due soon', waiting: 'Waiting on customer', on_hold: 'On hold', resolved: 'Resolved', all: 'All',
};
/** The status / assignee condition for one inbox tab. */
function filterWhere(f, userId, now = new Date()) {
    switch (f) {
        case 'open': return { status: { in: ['OPEN'] } };
        case 'unassigned': return { status: { in: ['OPEN', 'ON_HOLD'] }, assignedToId: null };
        case 'late': return { status: { in: ['OPEN', 'ON_HOLD'] }, firstResponseAt: null, dueFirstResponseAt: { lte: new Date(now.getTime() + 60 * 60_000) } };
        case 'waiting': return { status: { in: ['WAITING_ON_CUSTOMER'] } };
        case 'on_hold': return { status: { in: ['ON_HOLD'] } };
        case 'resolved': return { status: { in: ['RESOLVED', 'CLOSED'] } };
        case 'mine': return { assignedToId: userId, status: { in: ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD'] } };
        default: return {};
    }
}
/**
 * The tickets one person may handle: their organisation always; branch-scoped
 * people their own branch plus tickets with no branch (website enquiries are
 * the organisation's, not a branch's). `reach` is reachWhere('support.tickets.manage').
 */
function ticketReachWhere(reach, organisationId) {
    if (reach.branchId === '__no_access__')
        return { id: '__no_access__' };
    const org = { organisationId: organisationId ?? '__no_organisation__' };
    if (reach.branchId === undefined)
        return organisationId ? org : {};
    return { AND: [org, { OR: [{ branchId: reach.branchId }, { branchId: null }] }] };
}
/**
 * v37: a colleague's own request for help (requesterUserId set) is private to
 * them, the people who work the queue it is in, and support managers
 * (support.manage). Null = no extra condition (support managers).
 */
function staffHelpFence(canManage, myQueueIds) {
    if (canManage)
        return null;
    return { OR: [{ requesterUserId: null }, ...(myQueueIds.length ? [{ queueId: { in: myQueueIds } }] : [])] };
}
/** "12 min", "3 h 5 min", "2 days" — how long the customer waited for the first answer. */
function waitLabel(from, to) {
    const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
    if (minutes < 1)
        return 'under a minute';
    if (minutes < 60)
        return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        const rest = minutes % 60;
        return rest ? `${hours} h ${rest} min` : `${hours} h`;
    }
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
}
exports.REPLY_MAX = 4000;
/** A reply as typed: line breaks kept, at most two blank lines in a row, trimmed. */
function cleanReply(raw) {
    return String(raw ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
