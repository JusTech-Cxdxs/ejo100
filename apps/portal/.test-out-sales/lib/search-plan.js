"use strict";
/**
 * Reference numbers and the header search's query planner. Pure functions
 * (no database, no framework) so the unit tests can run them directly.
 *
 * Every number the portal generates has the shape PREFIX-YYYY-NNNNNN
 * (JC-2026-000012). REFERENCE_TYPES is the one list of those prefixes: the
 * record resolver, the audit log links and the search all read it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFERENCE_PATTERN = exports.REFERENCE_PREFIXES = exports.REFERENCE_TYPES = void 0;
exports.referenceUrl = referenceUrl;
exports.planSearch = planSearch;
exports.numberFilters = numberFilters;
exports.groupRank = groupRank;
exports.matchRanges = matchRanges;
exports.REFERENCE_TYPES = [
    { prefix: 'JC', model: 'JobCard', group: 'Job Cards', path: (id) => `/workshop/job-cards/${id}` },
    { prefix: 'SV', model: 'VehicleService', group: 'Vehicle Services', path: (id) => `/workshop/vehicle-service/${id}` },
    { prefix: 'PRS', model: 'PartRequestSlip', group: 'Parts requests', path: (id) => `/workshop/parts-requests/${id}` },
    { prefix: 'EPR', model: 'ExternalProcurementRequest', group: 'External procurement', path: (id) => `/workshop/external-procurement/${id}` },
    { prefix: 'GRN', model: 'GoodsReceipt', group: 'Goods receipts', path: (id) => `/inventory/goods-receipts/${id}` },
    // A refund has no page of its own: the id given is its Job Card's or Vehicle Service's page.
    { prefix: 'RF', model: 'Refund', group: 'Refunds', path: (parentUrl) => parentUrl },
    { prefix: 'WR', model: 'Warranty', group: 'Warranties', path: (id) => `/warranty/${id}` },
    { prefix: 'WC', model: 'WarrantyClaim', group: 'Warranty claims', path: (id) => `/warranty/claims/${id}` },
    { prefix: 'VIS', model: 'Visit', group: 'Visitors', path: (id) => `/security/visitors/${id}` },
    // The visitor's pass number lives on the same visit.
    { prefix: 'VP', model: 'Visit', group: 'Visitors', path: (id) => `/security/visitors/${id}` },
    { prefix: 'EP', model: 'ExitPass', group: 'Exit passes', path: (id) => `/security/exit-passes/${id}` },
    { prefix: 'VX', model: 'VehicleGateExit', group: 'Vehicle exits', path: (id) => `/security/vehicles/exits/${id}` },
    { prefix: 'RT', model: 'RoadTestPermit', group: 'Road tests', path: (id) => `/security/road-tests/${id}` },
    { prefix: 'INC', model: 'SecurityIncident', group: 'Incidents', path: (id) => `/security/incidents/${id}` },
    { prefix: 'DLV', model: 'GateDelivery', group: 'Deliveries', path: (id) => `/security/deliveries/${id}` },
    { prefix: 'CTR', model: 'ContractorPass', group: 'Contractors', path: (id) => `/security/contractors/${id}` },
    { prefix: 'APT', model: 'Appointment', group: 'Appointments', path: (id) => `/schedule/${id}` },
    { prefix: 'BC', model: 'Broadcast', group: 'Broadcasts', path: (id) => `/notifications/broadcasts/${id}` },
    // Support tickets: customers and website visitors handed over by Enyo (numbered by the website).
    { prefix: 'SUP', model: 'SupportTicket', group: 'Support tickets', path: (id) => `/crm/support/${id}` },
    // Zinox edition
    { prefix: 'BLD', model: 'BuildOrder', group: 'Build orders', path: (id) => `/production/build-orders/${id}` },
    { prefix: 'UNT', model: 'ProductionUnit', group: 'Unit travellers', path: (id) => `/production/units/${id}` },
    { prefix: 'TRF', model: 'StockTransfer', group: 'Stock transfers', path: (id) => `/warehouse/transfers/${id}` },
    { prefix: 'PRQ', model: 'PurchaseRequisition', group: 'Requisitions', path: (id) => `/procurement/requisitions/${id}` },
    { prefix: 'PO', model: 'PurchaseOrder', group: 'Purchase orders', path: (id) => `/procurement/orders/${id}` },
    { prefix: 'SHP', model: 'Shipment', group: 'Shipments', path: (id) => `/procurement/shipments/${id}` },
    { prefix: 'SCL', model: 'SupplierClaim', group: 'Supplier claims', path: (id) => `/procurement/claims/${id}` },
    { prefix: 'QTE', model: 'Quotation', group: 'Quotations', path: (id) => `/sales/quotations/${id}` },
    { prefix: 'SO', model: 'SalesOrder', group: 'Sales orders', path: (id) => `/sales/orders/${id}` },
    { prefix: 'PFI', model: 'ProFormaInvoice', group: 'Pro-forma invoices', path: (id) => `/sales/orders/${id}` },
    { prefix: 'REL', model: 'GoodsReleaseNote', group: 'Goods release notes', path: (id) => `/warehouse/releases/${id}` },
    { prefix: 'DSP', model: 'Dispatch', group: 'Dispatches', path: (id) => `/warehouse/dispatches/${id}` },
    { prefix: 'INV', model: 'SalesInvoice', group: 'Invoices', path: (id) => `/sales/orders/${id}` },
    { prefix: 'RMA', model: 'SalesReturn', group: 'Returns', path: (id) => `/sales/returns/${id}` },
    { prefix: 'PL', model: 'PriceList', group: 'Price lists', path: (id) => `/sales/price-lists/${id}` },
    { prefix: 'PB', model: 'PriceBroadcast', group: 'Price broadcasts', path: (id) => `/sales/price-lists/${id}` },
    { prefix: 'SVC', model: 'ServiceJob', group: 'Service jobs', path: (id) => `/service/jobs/${id}` },
    { prefix: 'PRJ', model: 'Project', group: 'Projects', path: (id) => `/projects/${id}` },
];
exports.REFERENCE_PREFIXES = exports.REFERENCE_TYPES.map((t) => t.prefix);
/** The exact page of a record, by its reference prefix. */
function referenceUrl(prefix, id) {
    return exports.REFERENCE_TYPES.find((t) => t.prefix === prefix).path(id);
}
/** Every reference number in a text: PREFIX-YYYY-NNNNNN. */
exports.REFERENCE_PATTERN = new RegExp(`\\b(${exports.REFERENCE_PREFIXES.join('|')})-\\d{4}-\\d{6}\\b`, 'g');
const SEPARATORS = /[\s\-_/.]+/g;
const LEAD = /^([A-Z]{1,3})[\s\-_/.]*([\d\s\-_/.]*)$/;
const FULL_REFERENCE = new RegExp(`^(${exports.REFERENCE_PREFIXES.join('|')})-\\d{4}-\\d{6}$`);
function planSearch(raw) {
    const q = (raw ?? '').trim().slice(0, 60);
    const upper = q.toUpperCase();
    const compact = upper.replace(SEPARATORS, '');
    const digits = q.replace(/\D/g, '');
    const short = q.length === 1;
    const dashed = compact.replace(/^([A-Z]+)(\d)/, '$1-$2');
    // Matching ignores case, so forms that differ only in case are asked once.
    const codeForms = [q, compact, dashed].filter((f, i, all) => (f === q || f.length >= 2) && all.findIndex((x) => x.toUpperCase() === f.toUpperCase()) === i);
    const base = { q, digits, compact, codeForms, short, take: short ? 3 : 5, phones: phonesFor(q, digits) };
    if (!q)
        return { ...base, kind: 'empty', prefixes: [], textScope: 'none', take: 0 };
    const lead = LEAD.exec(upper);
    if (lead) {
        const letters = lead[1];
        const exact = exports.REFERENCE_PREFIXES.filter((p) => p === letters);
        const starting = exports.REFERENCE_PREFIXES.filter((p) => p !== letters && p.startsWith(letters));
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
    if (digits && /^[\d\s\-_/.+()]+$/.test(q))
        return { ...base, kind: 'number', prefixes: [...exports.REFERENCE_PREFIXES], textScope: 'codes' };
    // Words, plates ("KJA-219"), part numbers, emails.
    return { ...base, kind: 'text', prefixes: [], textScope: 'all' };
}
function phonesFor(q, digits) {
    if (digits.length < 4 || !/^[\d\s\-+()]+$/.test(q))
        return [];
    const out = new Set([q.trim(), digits]);
    // A local number typed with its leading 0 also matches the international form.
    if (digits.startsWith('0') && digits.length >= 5)
        out.add(digits.slice(1));
    if (digits.startsWith('234') && digits.length >= 6)
        out.add(`0${digits.slice(3)}`);
    return [...out];
}
/**
 * The filters to apply to one reference type's number column, or [] when
 * this query cannot be one of its numbers (the table is not asked at all).
 * "VX" → newest VX-…; "vx-2026" → VX-2026-…; "rt 3" → RT-…-000003;
 * "000003" → …-000003 of every type; "JC-2026-000012" → exactly that number.
 */
function numberFilters(plan, prefix) {
    if (!plan.prefixes.includes(prefix))
        return [];
    const start = `${prefix}-`;
    if (plan.kind === 'prefix')
        return [{ startsWith: start }];
    if (plan.kind !== 'reference' && plan.kind !== 'number')
        return [];
    const d = plan.digits;
    const out = [];
    let yearAndNumber = false;
    if (d.length >= 4 && /^(19|20)\d\d/.test(d)) {
        const year = d.slice(0, 4);
        const seq = d.slice(4);
        if (!seq)
            out.push({ startsWith: `${start}${year}` });
        else if (seq.length <= 6) {
            yearAndNumber = true;
            out.push(seq.length === 6 ? { equals: `${start}${year}-${seq}` } : { startsWith: `${start}${year}-${seq}` });
            if (seq.length < 6)
                out.push({ equals: `${start}${year}-${seq.padStart(6, '0')}` });
        }
    }
    else if (plan.kind === 'reference' && /^(1|19|2|20|19\d|20\d)$/.test(d)) {
        // A year still being typed: "VX-20".
        out.push({ startsWith: `${start}${d}` });
    }
    // The running number on its own: "12" is …-000012 of any year.
    if (!yearAndNumber && d.length >= 1 && d.length <= 6)
        out.push({ startsWith: start, endsWith: `-${d.padStart(6, '0')}` });
    return out;
}
/** Group order: the types the query points at first, then everything else as listed. */
function groupRank(plan, group) {
    if (plan.kind === 'prefix' || plan.kind === 'reference') {
        const i = plan.prefixes.findIndex((p) => exports.REFERENCE_TYPES.find((t) => t.prefix === p).group === group);
        if (i !== -1)
            return i - 100;
    }
    return 0;
}
// ── Highlighting ────────────────────────────────────────────────────────
/**
 * Where the typed query appears in a result, as [start, end) ranges — even
 * when it was typed differently: "vx2026" in "VX-2026-000012", "rt 3" in
 * "RT-2026-000003".
 */
function matchRanges(text, raw) {
    const q = (raw ?? '').trim();
    if (!q || !text)
        return [];
    const lower = text.toLowerCase();
    const direct = lower.indexOf(q.toLowerCase());
    if (direct !== -1)
        return [[direct, direct + q.length]];
    // Ignore separators on both sides.
    const keep = [];
    let flat = '';
    for (let i = 0; i < text.length; i++)
        if (/[a-z0-9]/i.test(text[i])) {
            keep.push(i);
            flat += text[i].toLowerCase();
        }
    const want = q.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (want) {
        const at = flat.indexOf(want);
        if (at !== -1)
            return [[keep[at], keep[at + want.length - 1] + 1]];
    }
    // Word by word: letters as typed, a short number as its padded running number.
    const out = [];
    for (const token of q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
        let at = -1;
        let len = token.length;
        if (/^\d{1,5}$/.test(token)) {
            const padded = `-${token.padStart(6, '0')}`;
            if (lower.endsWith(padded)) {
                at = lower.length - 6;
                len = 6;
            }
        }
        if (at === -1)
            at = lower.indexOf(token);
        if (at !== -1 && !out.some(([s, e]) => at < e && at + len > s))
            out.push([at, at + len]);
    }
    return out.sort((a, b) => a[0] - b[0]);
}
