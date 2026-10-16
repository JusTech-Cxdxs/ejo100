/**
 * Support inbox rules — plain functions shared by the server actions, the
 * pages and the unit tests. No database, no framework.
 */

export const SUPPORT_STATUSES = ['OPEN', 'WAITING_ON_CUSTOMER', 'ON_HOLD', 'RESOLVED', 'CLOSED'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  OPEN: 'Open',
  WAITING_ON_CUSTOMER: 'Waiting on customer',
  ON_HOLD: 'On hold (waiting on others)',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/** What the customer sees for each status (portal emails use the same words as the customer portal). */
export const SUPPORT_STATUS_FOR_CUSTOMER: Record<SupportStatus, string> = {
  OPEN: 'With our team',
  WAITING_ON_CUSTOMER: 'Waiting for your reply',
  // Waiting on the manufacturer, a supplier or an insurer: still with the team.
  ON_HOLD: 'With our team',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export function isSupportStatus(v: unknown): v is SupportStatus {
  return typeof v === 'string' && (SUPPORT_STATUSES as readonly string[]).includes(v);
}

export const SUPPORT_FILTERS = ['open', 'unassigned', 'mine', 'late', 'waiting', 'on_hold', 'resolved', 'all'] as const;
export type SupportFilter = (typeof SUPPORT_FILTERS)[number];

export function supportFilter(v: unknown): SupportFilter {
  return typeof v === 'string' && (SUPPORT_FILTERS as readonly string[]).includes(v) ? (v as SupportFilter) : 'open';
}

export const SUPPORT_FILTER_LABEL: Record<SupportFilter, string> = {
  open: 'Open', unassigned: 'Unassigned', mine: 'Mine', late: 'Late or due soon', waiting: 'Waiting on customer', on_hold: 'On hold', resolved: 'Resolved', all: 'All',
};

/** The status / assignee condition for one inbox tab. */
export function filterWhere(f: SupportFilter, userId: string, now = new Date()): Record<string, unknown> {
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
export function ticketReachWhere(reach: { branchId?: string | { in: string[] } }, organisationId: string | null): Record<string, unknown> {
  if (reach.branchId === '__no_access__') return { id: '__no_access__' };
  const org = { organisationId: organisationId ?? '__no_organisation__' };
  if (reach.branchId === undefined) return organisationId ? org : {};
  return { AND: [org, { OR: [{ branchId: reach.branchId }, { branchId: null }] }] };
}

/** "12 min", "3 h 5 min", "2 days" — how long the customer waited for the first answer. */
export function waitLabel(from: Date, to: Date): string {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

export const REPLY_MAX = 4000;

/** A reply as typed: line breaks kept, at most two blank lines in a row, trimmed. */
export function cleanReply(raw: unknown): string {
  return String(raw ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
