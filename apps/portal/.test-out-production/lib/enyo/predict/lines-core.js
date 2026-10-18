"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_NEIGHBOURS = exports.SERVICE_LINE_TYPES = exports.LINE_TYPES = void 0;
exports.lineKey = lineKey;
exports.percentile = percentile;
exports.median = median;
exports.aggregateLines = aggregateLines;
exports.compareLines = compareLines;
/**
 * Estimate lines: how two lines are recognised as "the same line", how the
 * lines of similar past jobs are combined into a prediction, and how a
 * prediction is scored against what was finally approved.
 *
 * Pure (no database), unit-tested, and written so the Python training code
 * can reproduce it exactly (docs/AI_READINESS.md, "Training data").
 */
const text_1 = require("./text");
exports.LINE_TYPES = ['STORE_PART', 'EXTERNAL_PART', 'EXTERNAL_JOB', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'];
/** The line types a Vehicle Service estimate can hold. */
exports.SERVICE_LINE_TYPES = ['STORE_PART', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'];
/** Words that say nothing about WHICH labour / job a line is. */
const LINE_FILLER = new Set(['labour', 'labor', 'workmanship', 'charge', 'charg', 'fee', 'cost', 'job', 'work', 'repair', 'repairs', 'misc', 'miscellaneous', 'sundry', 'sundrie', 'consumable', 'item', 'items', 'servic', 'general']);
/**
 * A line's identity: Store parts by their part type (the same across
 * branches, which each have their own catalogue), Sundry as one line, the
 * rest by type plus the meaningful words of the description, sorted — so
 * "Labour for Brake" and "Brake labour" are the same line.
 */
function lineKey(line) {
    if (line.type === 'SUNDRY')
        return 'SUNDRY';
    if (line.type === 'STORE_PART')
        return `STORE_PART:${(0, text_1.normaliseText)(line.partTypeName || line.description)}`;
    const words = [...new Set((0, text_1.tokenise)(line.description).filter((w) => !LINE_FILLER.has(w)))].sort();
    return words.length ? `${line.type}:${words.join(' ')}` : line.type;
}
/** Linear-interpolated percentile (the same as numpy's default), xs need not be sorted. */
function percentile(xs, p) {
    if (xs.length === 0)
        return NaN;
    const s = [...xs].sort((a, b) => a - b);
    const h = (s.length - 1) * Math.min(1, Math.max(0, p));
    const lo = Math.floor(h);
    const hi = Math.min(s.length - 1, lo + 1);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
function median(xs) {
    return percentile(xs, 0.5);
}
const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
function range(xs) {
    const v = xs.filter((x) => Number.isFinite(x) && x >= 0);
    if (v.length === 0)
        return null;
    return { median: round2(median(v)), p25: round2(percentile(v, 0.25)), p75: round2(percentile(v, 0.75)) };
}
/** Lines are only predicted from at least this many similar jobs. */
exports.MIN_NEIGHBOURS = 3;
/** The most common original wording, for the label people see. */
function mostCommon(xs) {
    const n = new Map();
    for (const x of xs)
        n.set(x, (n.get(x) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
}
/**
 * Combines the approved lines of the similar jobs: a line is predicted when
 * enough of them had it; its quantity is the median across those jobs; for
 * priced-by-people lines (labour, jobs, sundry) the price is the median with
 * the middle half (p25–p75). Store parts carry no price here — they are
 * priced from today's Store selling price when shown.
 */
function aggregateLines(neighbours, opts = {}) {
    const n = neighbours.length;
    if (n < exports.MIN_NEIGHBOURS) {
        return {
            ok: false,
            neighbours: n,
            reason: n === 0
                ? 'No similar finished jobs were found yet, so there is nothing to learn from.'
                : `Only ${n} similar finished ${n === 1 ? 'job was' : 'jobs were'} found; at least ${exports.MIN_NEIGHBOURS} are needed before suggesting lines.`,
        };
    }
    const minShare = opts.minShare ?? 0.4;
    const minSupport = opts.minSupport ?? 2;
    const allowed = opts.allowedTypes ? new Set(opts.allowedTypes) : null;
    const totalWeight = neighbours.reduce((s, nb) => s + Math.max(nb.similarity, 1e-6), 0);
    const acc = new Map();
    for (const nb of neighbours) {
        // Per job: one entry per line key (two "brake pads" lines on one job count once, quantities added).
        const perJob = new Map();
        for (const l of nb.lines) {
            if (allowed && !allowed.has(l.type))
                continue;
            const key = lineKey(l);
            const qty = Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1;
            const amount = l.amount !== null && Number.isFinite(l.amount) ? l.amount : l.unitPrice !== null && Number.isFinite(l.unitPrice) ? l.unitPrice * qty : null;
            const unit = l.unitPrice !== null && Number.isFinite(l.unitPrice) ? l.unitPrice : amount !== null ? amount / qty : null;
            const cur = perJob.get(key) ?? { type: l.type, labels: [], partTypeName: l.partTypeName ?? null, categoryName: l.categoryName ?? null, qty: 0, amount: 0, priced: false, units: [] };
            cur.labels.push(l.type === 'STORE_PART' ? (l.partTypeName || l.description) : l.description.trim());
            cur.qty += qty;
            if (amount !== null) {
                cur.amount += amount;
                cur.priced = true;
            }
            if (unit !== null)
                cur.units.push(unit);
            perJob.set(key, cur);
        }
        for (const [key, j] of perJob) {
            const a = acc.get(key) ?? { type: j.type, labels: [], partTypeNames: [], categoryNames: [], qty: [], unit: [], amount: [], weight: 0, evidence: [] };
            a.labels.push(...j.labels);
            if (j.partTypeName)
                a.partTypeNames.push(j.partTypeName);
            if (j.categoryName)
                a.categoryNames.push(j.categoryName);
            a.qty.push(j.qty);
            if (j.priced)
                a.amount.push(j.amount);
            a.unit.push(...j.units);
            a.weight += Math.max(nb.similarity, 1e-6);
            a.evidence.push(nb.id);
            acc.set(key, a);
        }
    }
    const ORDER = { STORE_PART: 0, EXTERNAL_PART: 1, INTERNAL_JOB: 2, EXTERNAL_JOB: 3, LABOUR: 4, SUNDRY: 5 };
    const lines = [];
    for (const [key, a] of acc) {
        const support = a.evidence.length;
        if (support < minSupport || support / n < minShare)
            continue;
        const priced = a.type !== 'STORE_PART' && a.type !== 'EXTERNAL_PART';
        lines.push({
            key,
            type: a.type,
            label: mostCommon(a.labels),
            partTypeName: a.type === 'STORE_PART' ? mostCommon(a.partTypeNames) || mostCommon(a.labels) : null,
            categoryName: a.type === 'STORE_PART' ? mostCommon(a.categoryNames) || null : null,
            support,
            of: n,
            confidence: Math.round((a.weight / totalWeight) * 1000) / 1000,
            quantity: round2(median(a.qty)),
            unitPrice: priced ? range(a.unit) : null,
            amount: priced ? range(a.amount) : null,
            evidence: a.evidence,
        });
    }
    lines.sort((x, y) => y.confidence - x.confidence || ORDER[x.type] - ORDER[y.type] || x.label.localeCompare(y.label));
    const max = opts.maxLines ?? 12;
    if (lines.length === 0) {
        return { ok: false, neighbours: n, reason: `The ${n} similar jobs had no line in common often enough to suggest it.` };
    }
    return { ok: true, lines: lines.slice(0, max), neighbours: n };
}
/**
 * How good a prediction was: of the lines predicted, how many were approved
 * (precision); of the lines approved, how many were predicted (recall); and
 * how far the predicted labour (sum of median amounts) was from the approved
 * labour, in naira. Lines are matched by lineKey().
 */
function compareLines(predicted, approved) {
    const approvedByKey = new Map();
    for (const l of approved) {
        const k = lineKey(l);
        if (!approvedByKey.has(k))
            approvedByKey.set(k, { type: l.type, label: l.type === 'STORE_PART' ? (l.partTypeName || l.description) : l.description });
    }
    const predictedKeys = new Map();
    for (const p of predicted)
        if (!predictedKeys.has(p.key))
            predictedKeys.set(p.key, { type: p.type, label: p.label });
    const kept = [...predictedKeys.keys()].filter((k) => approvedByKey.has(k));
    const missed = [...approvedByKey.entries()].filter(([k]) => !predictedKeys.has(k)).map(([key, v]) => ({ key, ...v }));
    const extra = [...predictedKeys.entries()].filter(([k]) => !approvedByKey.has(k)).map(([key, v]) => ({ key, ...v }));
    const predictedLabourLines = predicted.filter((p) => p.type === 'LABOUR');
    const predictedLabour = predictedLabourLines.length ? round2(predictedLabourLines.reduce((s, p) => s + (p.amount?.median ?? 0), 0)) : null;
    const approvedLabourLines = approved.filter((l) => l.type === 'LABOUR');
    const approvedLabour = approvedLabourLines.length
        ? round2(approvedLabourLines.reduce((s, l) => s + (l.amount ?? (l.unitPrice !== null ? l.unitPrice * l.quantity : 0)), 0))
        : null;
    const labourError = predictedLabour === null && approvedLabour === null ? null : round2(Math.abs((predictedLabour ?? 0) - (approvedLabour ?? 0)));
    return {
        kept,
        missed,
        extra,
        precision: predictedKeys.size ? round4(kept.length / predictedKeys.size) : null,
        recall: approvedByKey.size ? round4(kept.length / approvedByKey.size) : null,
        labour: { predicted: predictedLabour, approved: approvedLabour, error: labourError },
    };
}
