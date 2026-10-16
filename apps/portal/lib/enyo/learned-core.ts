/**
 * Matching a question against learned answers (pure, tested):
 * TF-IDF over the learned questions, cosine similarity.
 *  - EXAMPLE_MIN: close enough to show the model as a worked example.
 *  - REUSE_MIN: practically the same question — answer from the example
 *    without calling the model (only for examples under REUSE_MAX_AGE_DAYS,
 *    and questions of at least three words).
 */
import { buildIdf, cosine, tfidfVector } from './predict/text';
import { scrubText } from './predict/dataset-core';

export const EXAMPLE_MIN = 0.35;
export const REUSE_MIN = 0.9;
export const REUSE_MAX_AGE_DAYS = 90;

export type LearnedRow = { id: string; question: string; answer: string; tokens: string[]; createdAt: Date };

export function learnedMatches(rows: LearnedRow[], questionTokens: string[], limit = 2): (LearnedRow & { score: number })[] {
  if (!rows.length || !questionTokens.length) return [];
  const idf = buildIdf([...rows.map((r) => r.tokens), questionTokens]);
  const q = tfidfVector(questionTokens, idf);
  return rows
    .map((r) => ({ ...r, score: cosine(q, tfidfVector(r.tokens, idf)) }))
    .filter((r) => r.score >= EXAMPLE_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** May this match be given as the answer itself (no model call)? */
export function canReuse(match: { score: number; createdAt: Date } | undefined, questionTokens: string[], now = new Date()): boolean {
  if (!match || questionTokens.length < 3 || match.score < REUSE_MIN) return false;
  return now.getTime() - match.createdAt.getTime() <= REUSE_MAX_AGE_DAYS * 86_400_000;
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
export function reuseAllowed(o: { question: string; historyLength: number; assisted: boolean; page?: string }): boolean {
  if (o.assisted || o.historyLength > 0) return false;
  if (o.page && RECORD_PAGE.test(o.page)) return false;
  return !CONTEXT_WORDS.test(o.question);
}

/** scrubText per line, so an answer keeps its paragraphs, lists and tables. */
export function scrubKeepingLines(text: string, names: string[], max: number): string {
  return String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => (l.trim() ? scrubText(l, names) : '')).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

