"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LINE_TYPES = void 0;
exports.ageBand = ageBand;
exports.mileageToken = mileageToken;
exports.featureTokens = featureTokens;
exports.complaintTokens = complaintTokens;
exports.lineTokens = lineTokens;
exports.workNumbers = workNumbers;
/**
 * The features every learning model sees, computed ONE way for training and
 * for use. The training export (predict/dataset.ts) writes these tokens and
 * numbers into each row; the Python trainer (ml/) only reads them; the portal
 * computes them again with this same code when it asks a model. So training
 * and use can never drift apart.
 *
 * Pure: no database, no framework imports (unit-tested in tests/enyo-ml.test.ts).
 */
const text_1 = require("../predict/text");
const slug = (s) => (0, text_1.normaliseText)(s ?? '').replace(/ /g, '_').slice(0, 40);
/** Vehicle age in bands (0-2, 3-5, 6-10, 11-15, 16+ years). */
function ageBand(year, at) {
    if (!year || !Number.isFinite(year))
        return null;
    const age = at.getUTCFullYear() - year;
    if (age < 0 || age > 80)
        return null;
    return age <= 2 ? '0_2' : age <= 5 ? '3_5' : age <= 10 ? '6_10' : age <= 15 ? '11_15' : '16_plus';
}
/** Mileage in bands of 25,000 km, capped at 300,000+. */
function mileageToken(km) {
    if (km === null || km === undefined || !Number.isFinite(km) || km < 0)
        return null;
    return String(Math.min(300_000, Math.floor(km / 25_000) * 25_000));
}
/** "make:toyota", "family:hilux", "kind:service", ... — the job's context as words the models can weigh. */
function featureTokens(f) {
    const out = [`kind:${f.kind === 'SERVICE' ? 'service' : 'job'}`];
    const make = slug(f.make);
    if (make)
        out.push(`make:${make}`);
    const family = (0, text_1.modelFamily)(f.model);
    if (family)
        out.push(`family:${make ? `${make}_` : ''}${family}`);
    const age = ageBand(f.year, f.openedAt);
    if (age)
        out.push(`age:${age}`);
    const km = mileageToken(f.mileageKm);
    if (km)
        out.push(`km:${km}`);
    const type = slug(f.vehicleType);
    if (type)
        out.push(`vtype:${type}`);
    const branch = slug(f.branchCode);
    if (branch)
        out.push(`branch:${branch}`);
    const dept = slug(f.department);
    if (dept)
        out.push(`dept:${dept}`);
    return out;
}
/** The complaint's words (the same tokeniser as the look-alike search). */
function complaintTokens(text) {
    return (0, text_1.tokenise)(text);
}
/** The approved lines as words: "line:<key>". Keys are already normalised (predict/lines-core.ts lineKey). */
function lineTokens(lines) {
    return [...new Set(lines.map((l) => `line:${l.key}`.slice(0, 120)))];
}
exports.LINE_TYPES = ['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'];
/** Numbers about the work itself: lines of each type, quantities, how many complaints. */
function workNumbers(complaint, lines) {
    const out = { complaint_words: (0, text_1.tokenise)(complaint).length, lines_total: lines.length };
    for (const t of exports.LINE_TYPES)
        out[`lines_${t.toLowerCase()}`] = lines.filter((l) => l.type === t).length;
    out.parts_quantity = lines.filter((l) => l.type === 'STORE_PART' || l.type === 'EXTERNAL_PART').reduce((s, l) => s + (Number.isFinite(l.quantity) ? l.quantity : 0), 0);
    return out;
}
