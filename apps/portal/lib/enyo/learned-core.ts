/**
 * Matching a question against learned answers (pure, tested):
 * TF-IDF over the learned questions, cosine similarity.
 *  - EXAMPLE_MIN: close enough to show the model as a worked example.
 *  - REUSE_MIN: practically the same question — answer from the example
 *    without calling the model (only for examples under REUSE_MAX_AGE_DAYS,
 *    and questions of at least three words).
 */
import { buildIdf, cosine, tfidfVector } from './predict/text';

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
