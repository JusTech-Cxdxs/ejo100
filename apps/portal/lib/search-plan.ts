/**
 * Reference numbers and the header search's query planner. Pure functions
 * (no database, no framework) so the unit tests can run them directly.
 *
 * Every number the portal generates has the shape PREFIX-YYYY-NNNNNN
 * (JC-2026-000012). REFERENCE_TYPES is the one list of those prefixes: the
 * record resolver, the audit log links and the search all read it.
 */

export const REFERENCE_TYPES = [
  { prefix: 'JC', model: 'JobCard', group: 'Job Cards', path: (id: string) => `/workshop/job-cards/${id}` },
  { prefix: 'SV', model: 'VehicleService', group: 'Vehicle Services', path: (id: string) => `/workshop/vehicle-service/${id}` },
  { prefix: 'PRS', model: 'PartRequestSlip', group: 'Parts requests', path: (id: string) => `/workshop/parts-requests/${id}` },
  { prefix: 'EPR', model: 'ExternalProcurementRequest', group: 'External procurement', path: (id: string) => `/workshop/external-procurement/${id}` },
  { prefix: 'GRN', model: 'GoodsReceipt', group: 'Goods receipts', path: (id: string) => `/inventory/goods-receipts/${id}` },
  // A refund has no page of its own: the id given is its Job Card's or Vehicle Service's page.
  { prefix: 'RF', model: 'Refund', group: 'Refunds', path: (parentUrl: string) => parentUrl },
  { prefix: 'WR', model: 'Warranty', group: 'Warranties', path: (id: string) => `/warranty/${id}` },
  { prefix: 'WC', model: 'WarrantyClaim', group: 'Warranty claims', path: (id: string) => `/warranty/claims/${id}` },
  { prefix: 'VIS', model: 'Visit', group: 'Visitors', path: (id: string) => `/security/visitors/${id}` },
  // The visitor's pass number lives on the same visit.
  { prefix: 'VP', model: 'Visit', group: 'Visitors', path: (id: string) => `/security/visitors/${id}` },
  { prefix: 'EP', model: 'ExitPass', group: 'Exit passes', path: (id: string) => `/security/exit-passes/${id}` },
  { prefix: 'VX', model: 'VehicleGateExit', group: 'Vehicle exits', path: (id: string) => `/security/vehicles/exits/${id}` },
  { prefix: 'RT', model: 'RoadTestPermit', group: 'Road tests', path: (id: string) => `/security/road-tests/${id}` },
  { prefix: 'INC', model: 'SecurityIncident', group: 'Incidents', path: (id: string) => `/security/incidents/${id}` },
  { prefix: 'DLV', model: 'GateDelivery', group: 'Deliveries', path: (id: string) => `/security/deliveries/${id}` },
  { prefix: 'CTR', model: 'ContractorPass', group: 'Contractors', path: (id: string) => `/security/contractors/${id}` },
  { prefix: 'APT', model: 'Appointment', group: 'Appointments', path: (id: string) => `/schedule/${id}` },
  { prefix: 'BC', model: 'Broadcast', group: 'Broadcasts', path: (id: string) => `/notifications/broadcasts/${id}` },
  // Support tickets: customers and website visitors handed over by Enyo (numbered by the website).
  { prefix: 'SUP', model: 'SupportTicket', group: 'Support tickets', path: (id: string) => `/crm/support/${id}` },
  // Data Exchange: an import of records from SAP or a spreadsheet.
  { prefix: 'IMP', model: 'ImportJob', group: 'Imports', path: (id: string) => `/data-exchange/imports/${id}` },
  // Data Exchange: an export of a list to Excel or CSV.
  { prefix: 'EXP', model: 'ExportJob', group: 'Exports', path: (id: string) => `/data-exchange/exports/${id}` },
  // Assembly plant: a pre-delivery inspection.
  { prefix: 'PDI', model: 'PdiInspection', group: 'Pre-delivery inspections', path: (id: string) => `/plant/pdi/${id}` },
  // Assembly plant: a kit (one vehicle, CKD or SKD) and the shipment that brought it.
  { prefix: 'KIT', model: 'PlantKit', group: 'Kits', path: (id: string) => `/plant/kits/${id}` },
  { prefix: 'SHP', model: 'PlantShipment', group: 'Shipments', path: (id: string) => `/plant/shipments/${id}` },
] as const;

export type RefPrefix = (typeof REFERENCE_TYPES)[number]['prefix'];
export const REFERENCE_PREFIXES: RefPrefix[] = REFERENCE_TYPES.map((t) => t.prefix);

/** The exact page of a record, by its reference prefix. */
export function referenceUrl(prefix: RefPrefix, id: string): string {
  return REFERENCE_TYPES.find((t) => t.prefix === prefix)!.path(id);
}

/** Every reference number in a text: PREFIX-YYYY-NNNNNN. */
export const REFERENCE_PATTERN = new RegExp(`\\b(${REFERENCE_PREFIXES.join('|')})-\\d{4}-\\d{6}\\b`, 'g');

// ── Query planning ──────────────────────────────────────────────────────

/** A filter on a reference-number column (numbers are stored in capitals, so these are exact-case). */
export type NumberFilter = { equals?: string; startsWith?: string; endsWith?: string };

/**
 * What a search query looks like, so the search only asks the tables that
 * can answer it:
 *  - prefix:    "VX", "v", "PRS", "jc-"      → the newest records of those types, plus names
 *  - reference: "VX-2026", "rt 3", "epr 12"  → numbers of those types (and plates / part numbers)
 *  - number:    "000003", "2026", "0803…"     → numbers of every type, phones, plates, codes
 *  - text:      "Ada", "Toyota", "KJA-219"    → names, plates, emails, part numbers, descriptions
 */
export type SearchPlan = {
  q: string;
  kind: 'empty' | 'prefix' | 'reference' | 'number' | 'text';
  /** Reference types the query points at, closest first (prefix / reference only). */
  prefixes: RefPrefix[];
  /** The digits typed, separators removed. */
  digits: string;
  /** Upper case without spaces, dashes, dots or slashes — for plates, part numbers, chassis. */
  compact: string;
  /** Forms to try on plates and codes: as typed, without separators, and with a dash where letters meet digits ("KJA219GX" → "KJA-219GX"). */
  codeForms: string[];
  /** all: names and codes; codes: phones, plates, part numbers, ids only; none: a complete reference number. */
  textScope: 'all' | 'codes' | 'none';
  /** One character: beginnings only, fewer results. */
  short: boolean;
  /** Results per group. */
  take: number;
  /** Phone forms worth trying (0803… is also stored as +234803…). */
  phones: string[];
};

const SEPARATORS = /[\s\-_/.]+/g;
const LEAD = /^([A-Z]{1,3})[\s\-_/.]*([\d\s\-_/.]*)$/;
const FULL_REFERENCE = new RegExp(`^(${REFERENCE_PREFIXES.join('|')})-\\d{4}-\\d{6}$`);

export function planSearch(raw: string): SearchPlan {
  const q = (raw ?? '').trim().slice(0, 60);
  const upper = q.toUpperCase();
  const compact = upper.replace(SEPARATORS, '');
  const digits = q.replace(/\D/g, '');
  const short = q.length === 1;
  const dashed = compact.replace(/^([A-Z]+)(\d)/, '$1-$2');
  // Matching ignores case, so forms that differ only in case are asked once.
  const codeForms = [q, compact, dashed].filter((f, i, all) => (f === q || f.length >= 2) && all.findIndex((x) => x.toUpperCase() === f.toUpperCase()) === i);
  const base = { q, digits, compact, codeForms, short, take: short ? 3 : 5, phones: phonesFor(q, digits) };
  if (!q) return { ...base, kind: 'empty', prefixes: [], textScope: 'none', take: 0 };

  const lead = LEAD.exec(upper);
  if (lead) {
    const letters = lead[1]!;
    const exact = REFERENCE_PREFIXES.filter((p) => p === letters);
    const starting = REFERENCE_PREFIXES.filter((p) => p !== letters && p.startsWith(letters));
    const rest = (lead[2] ?? '').replace(SEPARATORS, '');
    if (!rest && exact.length + starting.length > 0) {
      return { ...base, kind: 'prefix', prefixes: [...exact, ...starting], textScope: 'all' };
    }
    if (rest) {
      const prefixes = exact.length ? exact : starting;
      if (prefixes.length) {
        const canonical = `${letters}-${rest.slice(0, 4)}-${rest.slice(4)}`;
        const complete = exact.length > 0 && FULL_REFERENCE.test(canonical);
        return { ...base, kind: 'reference', prefixes, textScope: complete ? 'none' : 'codes' };
      }
    }
  }
  // Only digits (and separators): any type's running number, a phone, a code.
  if (digits && /^[\d\s\-_/.+()]+$/.test(q)) return { ...base, kind: 'number', prefixes: [...REFERENCE_PREFIXES], textScope: 'codes' };
  // Words, plates ("KJA-219"), part numbers, emails.
  return { ...base, kind: 'text', prefixes: [], textScope: 'all' };
}

function phonesFor(q: string, digits: string): string[] {
  if (digits.length < 4 || !/^[\d\s\-+()]+$/.test(q)) return [];
  const out = new Set([q.trim(), digits]);
  // A local number typed with its leading 0 also matches the international form.
  if (digits.startsWith('0') && digits.length >= 5) out.add(digits.slice(1));
  if (digits.startsWith('234') && digits.length >= 6) out.add(`0${digits.slice(3)}`);
  return [...out];
}

/**
 * The filters to apply to one reference type's number column, or [] when
 * this query cannot be one of its numbers (the table is not asked at all).
 * "VX" → newest VX-…; "vx-2026" → VX-2026-…; "rt 3" → RT-…-000003;
 * "000003" → …-000003 of every type; "JC-2026-000012" → exactly that number.
 */
export function numberFilters(plan: SearchPlan, prefix: RefPrefix): NumberFilter[] {
  if (!plan.prefixes.includes(prefix)) return [];
  const start = `${prefix}-`;
  if (plan.kind === 'prefix') return [{ startsWith: start }];
  if (plan.kind !== 'reference' && plan.kind !== 'number') return [];
  const d = plan.digits;
  const out: NumberFilter[] = [];
  let yearAndNumber = false;
  if (d.length >= 4 && /^(19|20)\d\d/.test(d)) {
    const year = d.slice(0, 4);
    const seq = d.slice(4);
    if (!seq) out.push({ startsWith: `${start}${year}` });
    else if (seq.length <= 6) {
      yearAndNumber = true;
      out.push(seq.length === 6 ? { equals: `${start}${year}-${seq}` } : { startsWith: `${start}${year}-${seq}` });
      if (seq.length < 6) out.push({ equals: `${start}${year}-${seq.padStart(6, '0')}` });
    }
  } else if (plan.kind === 'reference' && /^(1|19|2|20|19\d|20\d)$/.test(d)) {
    // A year still being typed: "VX-20".
    out.push({ startsWith: `${start}${d}` });
  }
  // The running number on its own: "12" is …-000012 of any year.
  if (!yearAndNumber && d.length >= 1 && d.length <= 6) out.push({ startsWith: start, endsWith: `-${d.padStart(6, '0')}` });
  return out;
}

/** Group order: the types the query points at first, then everything else as listed. */
export function groupRank(plan: SearchPlan, group: string): number {
  if (plan.kind === 'prefix' || plan.kind === 'reference') {
    const i = plan.prefixes.findIndex((p) => REFERENCE_TYPES.find((t) => t.prefix === p)!.group === group);
    if (i !== -1) return i - 100;
  }
  return 0;
}

// ── Highlighting ────────────────────────────────────────────────────────

/**
 * Where the typed query appears in a result, as [start, end) ranges — even
 * when it was typed differently: "vx2026" in "VX-2026-000012", "rt 3" in
 * "RT-2026-000003".
 */
export function matchRanges(text: string, raw: string): [number, number][] {
  const q = (raw ?? '').trim();
  if (!q || !text) return [];
  const lower = text.toLowerCase();
  const direct = lower.indexOf(q.toLowerCase());
  if (direct !== -1) return [[direct, direct + q.length]];
  // Ignore separators on both sides.
  const keep: number[] = [];
  let flat = '';
  for (let i = 0; i < text.length; i++) if (/[a-z0-9]/i.test(text[i]!)) { keep.push(i); flat += text[i]!.toLowerCase(); }
  const want = q.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (want) {
    const at = flat.indexOf(want);
    if (at !== -1) return [[keep[at]!, keep[at + want.length - 1]! + 1]];
  }
  // Word by word: letters as typed, a short number as its padded running number.
  const out: [number, number][] = [];
  for (const token of q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let at = -1;
    let len = token.length;
    if (/^\d{1,5}$/.test(token)) {
      const padded = `-${token.padStart(6, '0')}`;
      if (lower.endsWith(padded)) { at = lower.length - 6; len = 6; }
    }
    if (at === -1) at = lower.indexOf(token);
    if (at !== -1 && !out.some(([s, e]) => at < e && at + len > s)) out.push([at, at + len]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// ── SAP and old-system numbers ──────────────────────────────────────────

/**
 * A query that may be a number another system gave a record: an SAP customer
 * (KUNNR), vehicle (EQUNR), supplier (LIFNR), material or invoice number.
 * SAP numbers are plain (no "JC-" prefix), so the same digits can belong to a
 * customer and to an invoice: every match is shown, labelled with its kind.
 *
 * Accepted: "125262", "0000125262" (SAP's leading zeros), "SAP 125262",
 * "125262 2026" or "125262/2026" (a fiscal year narrows invoices), and
 * letters-and-digits numbers ("V-1000", "8-98123456-0"). `forms` are the
 * ways it may be stored: as typed, without leading zeros, in capitals.
 */
export function sapNumberQuery(raw: string): { number: string; year: number | null; forms: string[] } | null {
  const q = String(raw ?? '').trim().replace(/^sap\s*[:#]?\s*/i, '');
  const m = /^([A-Za-z0-9][A-Za-z0-9\-./]{1,24}?)(?:\s*[\s/]\s*((?:19|20)\d\d))?$/.exec(q);
  if (!m) return null;
  const number = m[1]!;
  if (!/\d/.test(number) || number.length < 3) return null;
  const year = m[2] ? Number(m[2]) : null;
  const stripped = number.replace(/^0+(?=[0-9A-Za-z])/, '');
  const forms = [...new Set([number, stripped, number.toUpperCase(), stripped.toUpperCase()])].filter(Boolean);
  return { number: stripped || number, year, forms };
}
