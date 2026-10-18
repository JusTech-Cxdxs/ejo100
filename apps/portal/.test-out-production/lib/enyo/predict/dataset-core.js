"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_TURNAROUND_HOURS = exports.DATASET_COLUMNS = void 0;
exports.scrubText = scrubText;
exports.opaqueId = opaqueId;
exports.mileageBand = mileageBand;
exports.datasetLines = datasetLines;
exports.pickColumns = pickColumns;
exports.toJsonl = toJsonl;
exports.toCsv = toCsv;
exports.turnaroundHours = turnaroundHours;
exports.isMash = isMash;
exports.complaintQuality = complaintQuality;
exports.plausibleYear = plausibleYear;
exports.qualityFilter = qualityFilter;
/**
 * The training set for the Python ML phase — formatting and the
 * no-personal-data rule. Pure and tested (tests/enyo-predict.test.ts).
 *
 * A row is one finished job: what the customer complained about (with
 * anything that could identify a person removed), the vehicle's features
 * (never its plate, VIN or engine number), the final approved lines and,
 * when Enyo predicted that job, how the prediction did. No customer, staff
 * or record ids leave the system: each row gets an id that is only stable
 * inside one export.
 */
const node_crypto_1 = require("node:crypto");
const lines_core_1 = require("./lines-core");
/** Every column of a row — and nothing else ever goes out. */
exports.DATASET_COLUMNS = [
    'row_id', 'kind', 'opened_on', 'branch_code', 'complaint_text', 'make', 'model', 'year', 'mileage_band_km', 'vehicle_type',
    'lines', 'labour_total', 'predicted_keys', 'precision', 'recall', 'model_version',
    'complaint_tokens', 'feature_tokens', 'work_numbers', 'turnaround_hours',
];
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Nigerian and international phone numbers: +234 803 123 4567, 0803-123-4567, 08031234567, (01) 234 5678.
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/g;
// Plates: LSR-123-XY, ABC 123 DE, KJA123AB (any case when joined or hyphenated;
// capitals only when written with spaces, so "at 50 km" is left alone), and
// test plates like E2E-001-AA.
const PLATE_JOINED = /\b[A-Z][A-Z0-9]{1,2}-?\d{2,4}-?[A-Z]{1,3}\b/gi;
const PLATE_SPACED = /\b[A-Z]{2,3} \d{2,4} [A-Z]{1,3}\b/g;
// Seventeen-character VINs.
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
const URL_RE = /\bhttps?:\/\/\S+/gi;
/**
 * Removes what could identify a person from free text: email addresses,
 * phone numbers, number plates, VINs, links, and any of the given names
 * (the customer's and the staff's own names, matched as whole words).
 */
function scrubText(text, names = []) {
    let s = String(text ?? '');
    s = s.replace(URL_RE, '[link]').replace(EMAIL, '[email]').replace(VIN, (m) => (/\d/.test(m) ? '[vin]' : m)).replace(PLATE_SPACED, '[plate]').replace(PLATE_JOINED, '[plate]');
    s = s.replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 7 ? '[phone]' : m));
    const parts = new Set();
    for (const n of names) {
        for (const p of String(n ?? '').split(/\s+/)) {
            const w = p.replace(/[^\p{L}'-]/gu, '');
            if (w.length >= 3)
                parts.add(w);
        }
    }
    for (const p of [...parts].sort((a, b) => b.length - a.length)) {
        s = s.replace(new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'giu'), '$1[name]');
    }
    return s.replace(/\s+/g, ' ').trim().slice(0, 1000);
}
/** A row id that cannot be traced back to the record (salted per export). */
function opaqueId(recordId, salt) {
    return (0, node_crypto_1.createHash)('sha256').update(`${salt}:${recordId}`).digest('hex').slice(0, 16);
}
function mileageBand(km) {
    if (km === null || km === undefined || !Number.isFinite(km) || km < 0)
        return null;
    return Math.floor(km / 5000) * 5000;
}
/** Final lines → the dataset's shape (descriptions scrubbed as well). */
function datasetLines(lines, names = []) {
    return lines.map((l) => ({
        type: l.type,
        // The key from the scrubbed description too: it goes into trained models.
        key: (0, lines_core_1.lineKey)({ ...l, description: scrubText(l.description, names) }),
        label: scrubText(l.type === 'STORE_PART' ? (l.partTypeName || l.description) : l.description, names).slice(0, 200),
        quantity: l.quantity,
        unit_price: l.type === 'STORE_PART' ? null : l.unitPrice,
        amount: l.type === 'STORE_PART' ? null : l.amount,
    }));
}
/** Keeps exactly the declared columns, in order (a guard against a field slipping in). */
function pickColumns(row) {
    const out = {};
    for (const c of exports.DATASET_COLUMNS)
        out[c] = row[c];
    return out;
}
function toJsonl(rows) {
    return rows.map((r) => JSON.stringify(pickColumns(r))).join('\n') + (rows.length ? '\n' : '');
}
function csvCell(v) {
    if (v === null || v === undefined)
        return '';
    const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
    // Never let a spreadsheet run a cell as a formula.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
/** CSV with one row per job; `line_keys` is the multi-label target (pipe-separated), `lines` the full JSON. */
const CSV_PLAIN = exports.DATASET_COLUMNS.filter((c) => c !== 'lines' && c !== 'predicted_keys');
function toCsv(rows) {
    const header = [...CSV_PLAIN, 'line_keys', 'predicted_line_keys', 'lines'];
    const out = [header.join(',')];
    for (const r of rows.map(pickColumns)) {
        const cells = CSV_PLAIN.map((c) => csvCell(Array.isArray(r[c]) ? r[c].join(' ') : r[c]));
        cells.push(csvCell(r.lines.map((l) => l.key).join('|')), csvCell(r.predicted_keys ? r.predicted_keys.join('|') : null), csvCell(r.lines));
        out.push(cells.join(','));
    }
    return `${out.join('\n')}\n`;
}
/** Hours between opening and ready, two decimals; null unless the end exists and follows the start (at most 180 days). */
function turnaroundHours(openedAt, readyAt) {
    if (!readyAt)
        return null;
    const h = (readyAt.getTime() - openedAt.getTime()) / 3_600_000;
    return h > 0 && h <= 24 * 180 ? Math.round(h * 100) / 100 : null;
}
// ------------------------------------------------------------ data quality
//
// Models are only as good as what they learn from. Before any row leaves for
// training (or the CSV export), rows that would teach the wrong thing are
// dropped, and impossible values are blanked. Test data typed while the
// system was being tried out ("test", "asdf", "hello") is the commonest case;
// the organisation's "learn from" date (Settings → Enyo) removes the rest.
/** Placeholder words a person types when trying a form out. */
const PLACEHOLDER = new Set(['test', 'tests', 'testing', 'tested', 'demo', 'sample', 'dummy', 'example', 'asdf', 'qwerty', 'lorem', 'ipsum', 'abc', 'abcd', 'xyz', 'hello', 'hi', 'hey', 'ok', 'okay', 'nil', 'none', 'na', 'nothing', 'blah', 'foo', 'bar', 'trial', 'something', 'stuff', 'whatever', 'random', 'fake', 'temp', 'tmp']);
/** Workshop shorthand that is real work even when short or without vowels. */
const SHORTHAND = new Set(['ac', 'abs', 'tpms', 'ecu', 'cvt', 'dpf', 'egr', 'srs', 'esp', 'ebd', 'obd', 'mil', 'cel', 'wd', 'awd', 'fwd', 'rwd', 'atf', 'ps', 'tcm', 'pcm', 'bcm', 'maf', 'map', 'tps', 'iac', 'crv', 'hvac', 'led', 'hid', 'drl', 'svc', 'pdi', 'cv', 'tdc', 'rpm', 'km', 'mpg', 'lpg', 'cng', 'gps', 'dvd', 'usb', 'brk', 'trns']);
const SCRUB_MARK = /\[(?:name|email|phone|plate|vin|link)\]/g;
/** A keyboard-mash word: a long run of consonants, one letter repeated, or a keyboard row. */
function isMash(word) {
    const w = word.toLowerCase();
    if (w.length < 4 || SHORTHAND.has(w))
        return false;
    if (/(.)\1{3,}/u.test(w))
        return true;
    if (/^[a-z]+$/.test(w) && !/[aeiouy]/.test(w))
        return true;
    if (/[bcdfghjklmnpqrstvwxz]{6,}/.test(w))
        return true;
    return /^(?:qwer|wert|asdf|sdfg|dfgh|fghj|ghjk|hjkl|zxcv|xcvb|cvbn|vbnm|jkl|uiop)/.test(w) && w.length <= 10;
}
/** 'ok', 'empty' (no words) or 'junk' (placeholder or keyboard mash) for a complaint, after scrubbing. */
function complaintQuality(text) {
    // "A/C" and "4WD" read as the words "ac" and "wd".
    const words = String(text ?? '').replace(SCRUB_MARK, ' ').replace(/\b([a-z])\/([a-z])\b/gi, '$1$2').toLowerCase().match(/\p{L}+/gu) ?? [];
    if (!words.length)
        return 'empty';
    const real = words.filter((w) => !PLACEHOLDER.has(w) && !isMash(w) && (w.length >= 2 || SHORTHAND.has(w)));
    if (!real.length)
        return 'junk';
    // Mostly mash with a stray real word ("asdfgh ok brake qwerty") is still junk.
    const mash = words.filter(isMash).length;
    if (mash >= 2 && mash / words.length > 0.5)
        return 'junk';
    return 'ok';
}
/** A model year a vehicle can have; anything else is a typing slip and is blanked. */
function plausibleYear(year, now = new Date()) {
    if (year === null || year === undefined || !Number.isInteger(year))
        return null;
    return year >= 1950 && year <= now.getUTCFullYear() + 1 ? year : null;
}
/** Shortest believable time from opening to ready (anything quicker was a test or a slip). */
exports.MIN_TURNAROUND_HOURS = 0.5;
function badLine(l) {
    if (!Number.isFinite(l.quantity) || l.quantity <= 0 || l.quantity > 10_000)
        return true;
    if (l.unit_price !== null && (!Number.isFinite(l.unit_price) || l.unit_price < 0 || l.unit_price > 50_000_000))
        return true;
    if (l.amount !== null && (!Number.isFinite(l.amount) || l.amount < 0 || l.amount > 500_000_000))
        return true;
    return !l.key || !l.label.replace(SCRUB_MARK, '').trim();
}
/**
 * The rows worth learning from, and what was left out and why. Keeps order.
 * Duplicates: the same vehicle on the same day with the same complaint and
 * lines (a record saved twice) count once. `vehicle_key` is an in-memory,
 * salted key that never leaves the portal (pickColumns drops it).
 */
function qualityFilter(rows) {
    const report = { examined: rows.length, kept: 0, dropped: { no_complaint: 0, test_or_junk_text: 0, impossible_line: 0, duplicate: 0 }, blanked: { turnaround_too_short: 0 } };
    const seen = new Set();
    const out = [];
    for (const r of rows) {
        const q = complaintQuality(r.complaint_text);
        // A routine service needs no complaint (make, model and mileage predict its lines); a Job Card does.
        if (q === 'empty' && r.kind === 'JOB_CARD') {
            report.dropped.no_complaint += 1;
            continue;
        }
        if (q === 'junk') {
            report.dropped.test_or_junk_text += 1;
            continue;
        }
        if (!r.lines.length || r.lines.some(badLine)) {
            report.dropped.impossible_line += 1;
            continue;
        }
        // The same vehicle, day and work twice is a double entry; five fleet vans serviced alike are five jobs.
        const sig = r.vehicle_key ? JSON.stringify([r.vehicle_key, r.opened_on, r.kind, r.complaint_text.toLowerCase(), r.lines.map((l) => `${l.key}:${l.quantity}`).sort()]) : null;
        if (sig && seen.has(sig)) {
            report.dropped.duplicate += 1;
            continue;
        }
        if (sig)
            seen.add(sig);
        const { vehicle_key: _key, ...row } = r;
        void _key;
        if (row.turnaround_hours !== null && row.turnaround_hours < exports.MIN_TURNAROUND_HOURS) {
            report.blanked.turnaround_too_short += 1;
            out.push({ ...row, turnaround_hours: null });
        }
        else
            out.push(row);
    }
    report.kept = out.length;
    return { rows: out, report };
}
