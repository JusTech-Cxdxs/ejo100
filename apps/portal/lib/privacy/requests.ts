/**
 * A4c1 — a customer's data request (NDPA 2023). Pure (no database): the kinds
 * of request and how they arrive, the steps, what is kept out of the copy of
 * a customer's data (other people: staff; secrets: passwords, tokens) and
 * the target for answering. No Node modules: the forms import it. The copy's
 * files and the zip are in ./pack (server only).
 *
 * The copy holds what EJO holds about the customer, record by record — not a
 * summary — with the business's internal keys and the staff who handled each
 * record left out. The person who releases it reads it first: anything about
 * someone else (another customer named in a note, say) is theirs to remove.
 */

export const REQUEST_KINDS = ['ACCESS', 'CORRECTION', 'ERASURE', 'OBJECTION'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const KIND_LABEL: Record<RequestKind, { label: string; what: string }> = {
  ACCESS: { label: 'A copy of their data', what: 'Everything EJO holds about them, as files they can open in a spreadsheet or take to another business (access and portability).' },
  CORRECTION: { label: 'Correct their data', what: 'Something EJO holds about them is wrong or out of date: put it right on the record’s page, then close the request with what was changed.' },
  ERASURE: { label: 'Erase their data', what: 'They ask for their data to be erased. Records the business must keep (invoices, payments, warranties) stay for as long as the law requires; close the request with what was erased and what is kept, and why.' },
  OBJECTION: { label: 'Stop using their data', what: 'They object to a use of their data (marketing messages, say): stop that use, then close the request with what was stopped.' },
};
export const isRequestKind = (k: unknown): k is RequestKind => typeof k === 'string' && (REQUEST_KINDS as readonly string[]).includes(k);

export const VIAS = ['EMAIL', 'PORTAL', 'IN_PERSON', 'LETTER', 'PHONE'] as const;
export type Via = (typeof VIAS)[number];
export const VIA_LABEL: Record<Via, string> = { EMAIL: 'Email', PORTAL: 'Customer portal', IN_PERSON: 'In person', LETTER: 'Letter', PHONE: 'Phone' };
export const isVia = (v: unknown): v is Via => typeof v === 'string' && (VIAS as readonly string[]).includes(v);

export const STATUS_LABEL: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' | 'error' }> = {
  RECEIVED: { label: 'Received — identity to confirm', tone: 'warning' },
  VERIFIED: { label: 'Identity confirmed — to answer', tone: 'warning' },
  FULFILLED: { label: 'Answered', tone: 'success' },
  REFUSED: { label: 'Refused', tone: 'error' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
};
export const OPEN_STATUSES = ['RECEIVED', 'VERIFIED'] as const;

/**
 * EJO's target for answering a request: 21 days from the day it was received.
 * The NDPA 2023 and its Directive (GAID 2025) fix no number of days for a
 * controller's answer to a data subject — obligations without a stated time
 * are to be met "timeously" (GAID art. 49(2)) — but 21 days is the figure the
 * Directive itself uses nearby: the compliance audit asks whether complaints
 * about inaccurate data are "resolved within 21 days" (Schedule 2), and a
 * controller has 21 days to reply to the Commission on a complaint (art.
 * 39(8)). It is also inside the one month other regimes allow. A target, not
 * a legal deadline: an urgent request is answered sooner.
 */
export const RESPONSE_TARGET_DAYS = 21;
/** Where an open request stands against the target: days left (0 = due today), or days overdue. */
export function dueOf(receivedAt: Date, now = new Date()): { dueAt: Date; daysLeft: number; overdue: boolean; soon: boolean } {
  const dueAt = new Date(+receivedAt + RESPONSE_TARGET_DAYS * 86_400_000);
  const daysLeft = Math.floor((+dueAt - +now) / 86_400_000);
  return { dueAt, daysLeft, overdue: daysLeft < 0, soon: daysLeft >= 0 && daysLeft <= 5 };
}
export const dueWords = (d: { daysLeft: number; overdue: boolean }) => (d.overdue ? `${-d.daysLeft} ${d.daysLeft === -1 ? 'day' : 'days'} past the ${RESPONSE_TARGET_DAYS}-day target` : d.daysLeft === 0 ? 'due today' : `${d.daysLeft} ${d.daysLeft === 1 ? 'day' : 'days'} left of ${RESPONSE_TARGET_DAYS}`);

/** "DR-2026-000001". */
export const requestNumber = (year: number, n: number) => `DR-${year}-${String(n).padStart(6, '0')}`;

/**
 * How identity was checked, in words — never a document's number. Refused when
 * it carries what looks like one (eight or more digits in a row, with or
 * without spaces or dashes), so no ID number is ever stored.
 */
export function checkVerifiedHow(s: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (text.length < 10) return { ok: false, error: 'Say how their identity was checked (for example “Seen in person with photo ID matching the record”).' };
  if (/\d(?:[\s-]?\d){7,}/.test(text)) return { ok: false, error: 'Write how it was checked, never the document’s number: EJO keeps no ID numbers.' };
  return { ok: true, text };
}

// ── What the copy leaves out ────────────────────────────────────────────────

/** Staff who handled a record (createdById, approvedById, assignedToId, authorUserId…): other people, never in a customer's copy. */
const STAFF = /(By|To|User)Id$|^authorId$|^userId$/;
const STAFF_NAME = /(by|staff|technician|supervisor|inspector|advisor|approver|author)Name$/i;
/** Secrets and machinery: passwords, sign-in tokens, message ids, the business's internal keys. */
const SECRET = /password|token|secret|hash|^scope$|MessageId$|^mailboxId$|^queueId$|^organisationId$|^importJobId$|^branchId$/i;
export const leftOut = (key: string) => STAFF.test(key) || STAFF_NAME.test(key) || SECRET.test(key);

export type Plain = string | number | boolean | null | Plain[] | { [k: string]: Plain };
/** A value as plain data: dates as ISO 8601 (UTC), money and decimals as text (no rounding), nested JSON as it is. */
export function plain(v: unknown): Plain {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object' && v && 'toFixed' in v && typeof (v as { toString: () => string }).toString === 'function' && !Array.isArray(v)) return (v as { toString: () => string }).toString();
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !leftOut(k)).map(([k, x]) => [k, plain(x)]));
  return v as Plain;
}

/** One record for the copy: its own fields, the left-out ones removed, its branch by name. */
export function forCopy(row: Record<string, unknown>, branchNames: Map<string, string>): Record<string, Plain> {
  const out: Record<string, Plain> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'branchId' && typeof v === 'string') { out.branch = branchNames.get(v) ?? null; continue; }
    if (leftOut(k)) continue;
    out[k] = plain(v);
  }
  return out;
}
