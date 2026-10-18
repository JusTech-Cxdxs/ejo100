"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehicleBonus = vehicleBonus;
exports.scoreCandidates = scoreCandidates;
/**
 * Scoring past jobs against a new complaint: TF-IDF cosine on the complaint
 * text, plus a small bonus when the vehicle looks alike. Pure and tested;
 * the database side (which candidates to load) is in similar.ts.
 */
const text_1 = require("./text");
/** The vehicle part of the score: same make, same model family, a close year, a close mileage. At most 0.2. */
function vehicleBonus(q, c) {
    const qMake = (0, text_1.normaliseText)(q.make ?? '');
    const cMake = (0, text_1.normaliseText)(c.make ?? '');
    if (!qMake || qMake !== cMake)
        return 0;
    let bonus = 0.04;
    const qFam = (0, text_1.modelFamily)(q.model);
    if (qFam && qFam === (0, text_1.modelFamily)(c.model)) {
        bonus += 0.08;
        if (q.year && c.year && Math.abs(q.year - c.year) <= 2)
            bonus += 0.04;
    }
    if (q.mileage && c.mileage && q.mileage > 0 && c.mileage > 0) {
        const ratio = Math.min(q.mileage, c.mileage) / Math.max(q.mileage, c.mileage);
        if (ratio >= 0.75)
            bonus += 0.04;
    }
    return Math.round(bonus * 1000) / 1000;
}
/** Ranks candidates by similarity to the query; returns the top k above the text threshold. */
function scoreCandidates(query, candidates, opts = {}) {
    const k = opts.k ?? 9;
    const minText = opts.minText ?? 0.15;
    const qTokens = (0, text_1.tokenise)(query.text);
    if (qTokens.length === 0 || candidates.length === 0)
        return [];
    const docs = candidates.map((c) => (0, text_1.tokenise)(c.text));
    const idf = (0, text_1.buildIdf)([...docs, qTokens]);
    const qv = (0, text_1.tfidfVector)(qTokens, idf);
    const scored = [];
    candidates.forEach((c, i) => {
        const textScore = (0, text_1.cosine)(qv, (0, text_1.tfidfVector)(docs[i], idf));
        if (textScore < minText)
            return;
        const bonus = vehicleBonus(query, c) + (opts.kind && opts.kind === c.kind ? 0.02 : 0);
        scored.push({
            ...c,
            textScore: Math.round(textScore * 1000) / 1000,
            vehicleBonus: Math.round(bonus * 1000) / 1000,
            similarity: Math.round(Math.min(1, textScore * 0.8 + bonus) * 1000) / 1000,
            shared: (0, text_1.sharedTerms)(qTokens, docs[i]),
        });
    });
    scored.sort((a, b) => b.similarity - a.similarity || b.createdAt.getTime() - a.createdAt.getTime());
    return scored.slice(0, k);
}
