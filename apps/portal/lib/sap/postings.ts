/**
 * C1a — the daily files of postings EJO writes for SAP. Pure (no database):
 * the kinds and their SAP columns (C1b added refunds and the plant's PDI
 * usage decisions and vehicles received into the yard), how each value is written (days as
 * YYYYMMDD in Lagos, SAP's leading zeros, quantities and amounts with a
 * point), the CSV rebuilt byte for byte from its lines (so its checksum never
 * changes), and how a line of SAP's return file is read. The server part is
 * postings-server.ts.
 *
 * What this is, and is not: EJO writes the file; SAP's team loads it with
 * their own tools, under their own checks, and sends back SAP's return file
 * (one line per posting: posted with its document number, or rejected with
 * SAP's message). EJO never writes into SAP.
 */
import { createHash } from 'node:crypto';
import { csvLine } from '../exports/format';
import { alpha } from '../exports/sap-layout';

export const POSTING_KINDS = ['NEW_CUSTOMER', 'GOODS_RECEIPT', 'GOODS_ISSUE', 'BILLING', 'PAYMENT', 'REFUND', 'USAGE_DECISION', 'PRODUCTION_RECEIPT'] as const;
export type PostingKind = (typeof POSTING_KINDS)[number];
export const isPostingKind = (k: unknown): k is PostingKind => (POSTING_KINDS as readonly string[]).includes(String(k));

export type KindDef = {
  label: string;
  /** What SAP does with it, in a line. */
  what: string;
  /** The file's columns, in order (line 1 of the CSV). */
  columns: string[];
  /** The organisation's file (new customers), not a branch's. */
  organisation?: boolean;
  /** The ref prefix of its events. */
  prefix: string;
  /** What the amount column is, when it has one. */
  amountColumn?: string;
  quantityColumn?: string;
};

/** ZZ_EJO_LINE is the posting line (SAP's return names it); ZZ_EJO_ID the record in EJO. */
export const KINDS: Record<PostingKind, KindDef> = {
  NEW_CUSTOMER: {
    label: 'New customers', what: 'Customers created in EJO that SAP does not have yet: SAP’s team creates them and sends back each KUNNR.', organisation: true, prefix: 'NC',
    columns: ['ZZ_EJO_LINE', 'ZZ_EJO_ID', 'KUNNR', 'NAME1', 'TELF1', 'SMTP_ADDR', 'STRAS', 'ERDAT'],
  },
  GOODS_RECEIPT: {
    label: 'Goods receipts', what: 'Parts received into the Store (movement 101), with the supplier and the cost.', prefix: 'GR', amountColumn: 'DMBTR', quantityColumn: 'MENGE',
    columns: ['ZZ_EJO_LINE', 'ZZ_EJO_ID', 'BWART', 'BLDAT', 'BUDAT', 'WERKS', 'MATNR', 'MENGE', 'MEINS', 'CHARG', 'LIFNR', 'XBLNR', 'DMBTR', 'WAERS'],
  },
  GOODS_ISSUE: {
    label: 'Goods issues', what: 'Parts released to a job card or service (movement 261 to its SAP order, 201 when it has none).', prefix: 'GI', quantityColumn: 'MENGE',
    columns: ['ZZ_EJO_LINE', 'ZZ_EJO_ID', 'BWART', 'BUDAT', 'WERKS', 'MATNR', 'MENGE', 'MEINS', 'AUFNR', 'ZZ_EJO_REF'],
  },
  BILLING: {
    label: 'Workshop billing', what: 'Job cards and services closed: the customer’s amount, and what warranty, goodwill and the workshop itself carry.', prefix: 'BL', amountColumn: 'NETWR',
    columns: ['ZZ_EJO_LINE', 'ZZ_EJO_ID', 'FKDAT', 'WERKS', 'KUNNR', 'ZZ_EJO_REF', 'NETWR', 'ZZ_WARRANTY', 'ZZ_GOODWILL', 'ZZ_INTERNAL', 'WAERK'],
  },
  PAYMENT: {
    label: 'Payments', what: 'Payments recorded against job cards and services (cash or bank transfer).', prefix: 'PY', amountColumn: 'WRBTR',
    columns: ['ZZ_EJO_LINE', 'ZZ_EJO_ID', 'BUDAT', 'WERKS', 'KUNNR', 'WRBTR', 'WAERS', 'ZLSCH', 'XBLNR'],
  },
  REFUND: {
    label: 'Refunds', what: 'Money paid back to customers against job cards and services, with the reason.', prefix: 'RF', amountColumn: 'WRBTR',
    columns: ['ZZ_EJO_LINE', 'ZZ_EJO_ID', 'BUDAT', 'WERKS', 'KUNNR', 'WRBTR', 'WAERS', 'ZLSCH', 'XBLNR', 'ZZ_EJO_REF', 'SGTXT'],
  },
  USAGE_DECISION: {
    label: 'PDI usage decisions', what: 'Each pre-delivery inspection decided at the plant: A accepted, R rejected back to rework (QM usage decision).', prefix: 'UD',
    columns: ['ZZ_EJO_LINE', 'ZZ_EJO_ID', 'VDATUM', 'WERKS', 'MATNR', 'SERNR', 'EQUNR', 'AUFNR', 'VCODE', 'ZZ_EJO_REF'],
  },
  PRODUCTION_RECEIPT: {
    label: 'Vehicles to the yard', what: 'Each vehicle that passed PDI, received from its production order into stock (movement 101).', prefix: 'YD', quantityColumn: 'MENGE',
    columns: ['ZZ_EJO_LINE', 'ZZ_EJO_ID', 'BWART', 'BUDAT', 'WERKS', 'MATNR', 'MENGE', 'MEINS', 'AUFNR', 'SERNR', 'EQUNR', 'ZZ_EJO_REF'],
  },
};

/** The kinds each kind of branch posts; the organisation's own file is the new customers. */
export const BRANCH_KINDS: Record<string, PostingKind[]> = {
  WORKSHOP: ['GOODS_RECEIPT', 'GOODS_ISSUE', 'BILLING', 'PAYMENT', 'REFUND'],
  WAREHOUSE: ['GOODS_RECEIPT', 'GOODS_ISSUE'],
  ASSEMBLY_PLANT: ['USAGE_DECISION', 'PRODUCTION_RECEIPT'],
};

/** Where an EJO record's postings are found: the refs of its events (for "Sent to SAP" on its page). */
export const TRAIL_ENTITIES = ['JobCard', 'VehicleService', 'Payment', 'Refund', 'PdiInspection', 'PlantVehicle', 'Customer'] as const;
export type TrailEntity = (typeof TRAIL_ENTITIES)[number];

/** At most this many lines in one file: the rest go in the next. */
export const MAX_LINES = 20_000;

const LAGOS_MS = 3_600_000;
/** A moment as SAP's day, YYYYMMDD in Lagos. */
export const sapDay = (d: Date | null | undefined): string => (d ? new Date(d.getTime() + LAGOS_MS).toISOString().slice(0, 10).replace(/-/g, '') : '');
/** The UTC moments a run of Lagos days spans: [start of `from`, end of `to`). */
export function lagosWindow(fromDay: string, toDay: string): { start: Date; end: Date } {
  const start = new Date(`${fromDay}T00:00:00.000+01:00`);
  const end = new Date(new Date(`${toDay}T00:00:00.000+01:00`).getTime() + 86_400_000);
  return { start, end };
}
/** A quantity as SAP reads it: a point, at most three decimals, no thousands. */
export const sapQuantity = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? '' : String(Math.round(n * 1000) / 1000));
export const sapMoney = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? '' : n.toFixed(2));
/** A text field: one line, no separators SAP's tools trip on, cut to SAP's length. */
export const sapText = (s: string | null | undefined, max = 40): string => String(s ?? '').replace(/[\r\n\t;]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** Order and equipment numbers SAP keeps with leading zeros too. */
const MORE_ALPHA: Record<string, number> = { AUFNR: 12, EQUNR: 18 };
/** A number field with SAP's leading zeros (KUNNR, LIFNR to ten digits; AUFNR twelve; EQUNR eighteen) when it is all digits. */
export function sapNumber(field: string, v: string | null | undefined): string {
  const t = String(v ?? '').trim();
  if (!t) return '';
  const len = MORE_ALPHA[field];
  if (len) return /^\d+$/.test(t) && t.length <= len ? t.padStart(len, '0') : t.slice(0, len);
  return String(alpha(field, t));
}
export const PAYMENT_METHOD: Record<string, string> = { CASH: 'C', BANK_TRANSFER: 'T' };

/** The file, rebuilt from its lines in order: line 1 the header, as SAP's load tools expect. */
export function postingCsv(kind: PostingKind, lines: { payload: Record<string, string> }[]): string {
  const cols = KINDS[kind].columns;
  let out = csvLine(cols);
  for (const l of lines) out += csvLine(cols.map((c) => String(l.payload[c] ?? '')));
  return out;
}
export const checksumOf = (csv: string): string => createHash('sha256').update(csv, 'utf8').digest('hex');

export function postingFileName(kind: PostingKind, number: string, upTo: string): string {
  return `EJO-${kind.replace(/_/g, '-')}-${upTo.replace(/-/g, '')}-${number}-SAP.csv`;
}

// ── SAP's return file ─────────────────────────────────────────────────

export type Answer = { lineId: string; outcome: 'POSTED' | 'REJECTED'; document: string | null; message: string | null };

const LINE = ['ZZ_EJO_LINE', 'EJO_LINE', 'EJO LINE'];
const STATUS = ['STATUS', 'MSGTY', 'TYPE', 'RESULT'];
const DOCUMENT = ['BELNR', 'MBLNR', 'VBELN', 'KUNNR', 'DOCUMENT', 'DOC', 'SAP_DOCUMENT'];
const MESSAGE = ['MESSAGE', 'MSG', 'MSGTXT', 'TEXT', 'MESSAGE_TEXT'];
const norm = (h: string) => h.trim().toUpperCase().replace(/[^A-Z0-9_ ]/g, '');

/** Where SAP's return file keeps the line, the status, the document and the message; null when it has no line column. */
export function answerColumns(header: string[]): { line: number; status: number; document: number; message: number } | null {
  const h = header.map(norm);
  const find = (names: string[]) => names.map((n) => h.indexOf(n)).find((i) => i >= 0) ?? -1;
  const line = find(LINE);
  const status = find(STATUS);
  if (line < 0 || status < 0) return null;
  return { line, status, document: find(DOCUMENT), message: find(MESSAGE) };
}

/** One line of SAP's return file: S / success / posted → posted; E / A / error / rejected → rejected; W (warning) posted, its message kept. */
export function readAnswer(cells: string[], cols: NonNullable<ReturnType<typeof answerColumns>>): Answer | { error: string } {
  const at = (i: number) => (i >= 0 ? String(cells[i] ?? '').trim() : '');
  const lineId = at(cols.line);
  if (!/^[a-z0-9]{8,40}$/i.test(lineId)) return { error: lineId ? `“${lineId.slice(0, 40)}” is not an EJO posting line.` : 'No ZZ_EJO_LINE.' };
  const s = at(cols.status).toUpperCase().replace(/[^A-Z]/g, '');
  const outcome = /^(S|SUCCESS|OK|POSTED|DONE|W|WARNING|I)$/.test(s) ? 'POSTED' : /^(E|A|X|ERROR|ABORT|FAILED|REJECTED|NOTPOSTED)$/.test(s) ? 'REJECTED' : null;
  if (!outcome) return { error: `Status “${at(cols.status).slice(0, 20)}” is neither posted (S) nor rejected (E).` };
  const document = at(cols.document).slice(0, 40) || null;
  const message = at(cols.message).replace(/\s+/g, ' ').slice(0, 300) || null;
  if (outcome === 'REJECTED' && !message) return { lineId, outcome, document: null, message: 'Rejected by SAP (no message given).' };
  return { lineId, outcome, document: outcome === 'POSTED' ? document : null, message };
}

export const LINE_STATUS_WORDS: Record<string, string> = {
  SENT: 'Sent — waiting for SAP', POSTED: 'Posted in SAP', REJECTED: 'Rejected by SAP', RESEND: 'To send again', SUPERSEDED: 'Sent again',
};
