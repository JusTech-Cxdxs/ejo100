"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REUSE_MAX_AGE_DAYS = exports.REUSE_MIN = exports.EXAMPLE_MIN = void 0;
exports.learnedMatches = learnedMatches;
exports.canReuse = canReuse;
exports.reuseAllowed = reuseAllowed;
exports.scrubKeepingLines = scrubKeepingLines;
/**
 * Matching a question against learned answers (pure, tested):
 * TF-IDF over the learned questions, cosine similarity.
 *  - EXAMPLE_MIN: close enough to show the model as a worked example.
 *  - REUSE_MIN: practically the same question — answer from the example
 *    without calling the model (only for examples under REUSE_MAX_AGE_DAYS,
 *    and questions of at least three words).
 */
const text_1 = require("./predict/text");
const dataset_core_1 = require("./predict/dataset-core");
exports.EXAMPLE_MIN = 0.35;
exports.REUSE_MIN = 0.9;
exports.REUSE_MAX_AGE_DAYS = 90;
function learnedMatches(rows, questionTokens, limit = 2) {
    if (!rows.length || !questionTokens.length)
        return [];
    const idf = (0, text_1.buildIdf)([...rows.map((r) => r.tokens), questionTokens]);
    const q = (0, text_1.tfidfVector)(questionTokens, idf);
    return rows
        .map((r) => ({ ...r, score: (0, text_1.cosine)(q, (0, text_1.tfidfVector)(r.tokens, idf)) }))
        .filter((r) => r.score >= exports.EXAMPLE_MIN)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
/** May this match be given as the answer itself (no model call)? */
function canReuse(match, questionTokens, now = new Date()) {
    if (!match || questionTokens.length < 3 || match.score < exports.REUSE_MIN)
        return false;
    return now.getTime() - match.createdAt.getTime() <= exports.REUSE_MAX_AGE_DAYS * 86_400_000;
}
/** Words that point at the person, the page or an earlier turn: the answer depends on context. */
const CONTEXT_WORDS = /\b(this|that|these|those|here|there|it|its|my|mine|me|our|ours|we|us|above|below|again|same|current|today|now)\b/i;
/** A path ending in an id (a record page): "how do I…" there is often about that record. */
const RECORD_PAGE = /\/[a-z0-9]{20,}(?:\/|$)|\/\d+(?:\/|$)/i;
/**
 * May a learned answer be given verbatim here? Never in an assisted session,
 * never once the chat has history, never on a record page and never when the
 * question refers to its context ("this", "my", "here"…).
 */
function reuseAllowed(o) {
    if (o.assisted || o.historyLength > 0)
        return false;
    if (o.page && RECORD_PAGE.test(o.page))
        return false;
    return !CONTEXT_WORDS.test(o.question);
}
/** scrubText per line, so an answer keeps its paragraphs, lists and tables. */
function scrubKeepingLines(text, names, max) {
    return String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => (l.trim() ? (0, dataset_core_1.scrubText)(l, names) : '')).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}
