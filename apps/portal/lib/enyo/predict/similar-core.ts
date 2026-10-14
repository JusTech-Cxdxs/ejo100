/**
 * Scoring past jobs against a new complaint: TF-IDF cosine on the complaint
 * text, plus a small bonus when the vehicle looks alike. Pure and tested;
 * the database side (which candidates to load) is in similar.ts.
 */
import { buildIdf, cosine, modelFamily, normaliseText, sharedTerms, tfidfVector, tokenise } from './text';

export type VehicleFeatures = { make: string | null; model: string | null; year: number | null; mileage: number | null };

export type Candidate = VehicleFeatures & {
  id: string;
  kind: 'JOB_CARD' | 'SERVICE';
  number: string;
  branchId: string;
  createdAt: Date;
  /** All the complaint text of the job, joined. */
  text: string;
};

export type Scored = Candidate & {
  /** Final score, 0..1. */
  similarity: number;
  /** The text part alone (cosine), 0..1. */
  textScore: number;
  vehicleBonus: number;
  /** Canonical words the two complaints share — the "why". */
  shared: string[];
};

export type ScoreOptions = {
  /** How many to return (default 9). */
  k?: number;
  /** Below this text similarity a job is not "similar", however alike the vehicle (default 0.15). */
  minText?: number;
  /** The kind of record being predicted for (a small bonus for the same kind). */
  kind?: 'JOB_CARD' | 'SERVICE';
};

/** The vehicle part of the score: same make, same model family, a close year, a close mileage. At most 0.2. */
export function vehicleBonus(q: VehicleFeatures, c: VehicleFeatures): number {
  const qMake = normaliseText(q.make ?? '');
  const cMake = normaliseText(c.make ?? '');
  if (!qMake || qMake !== cMake) return 0;
  let bonus = 0.04;
  const qFam = modelFamily(q.model);
  if (qFam && qFam === modelFamily(c.model)) {
    bonus += 0.08;
    if (q.year && c.year && Math.abs(q.year - c.year) <= 2) bonus += 0.04;
  }
  if (q.mileage && c.mileage && q.mileage > 0 && c.mileage > 0) {
    const ratio = Math.min(q.mileage, c.mileage) / Math.max(q.mileage, c.mileage);
    if (ratio >= 0.75) bonus += 0.04;
  }
  return Math.round(bonus * 1000) / 1000;
}

/** Ranks candidates by similarity to the query; returns the top k above the text threshold. */
export function scoreCandidates(query: VehicleFeatures & { text: string }, candidates: Candidate[], opts: ScoreOptions = {}): Scored[] {
  const k = opts.k ?? 9;
  const minText = opts.minText ?? 0.15;
  const qTokens = tokenise(query.text);
  if (qTokens.length === 0 || candidates.length === 0) return [];
  const docs = candidates.map((c) => tokenise(c.text));
  const idf = buildIdf([...docs, qTokens]);
  const qv = tfidfVector(qTokens, idf);
  const scored: Scored[] = [];
  candidates.forEach((c, i) => {
    const textScore = cosine(qv, tfidfVector(docs[i]!, idf));
    if (textScore < minText) return;
    const bonus = vehicleBonus(query, c) + (opts.kind && opts.kind === c.kind ? 0.02 : 0);
    scored.push({
      ...c,
      textScore: Math.round(textScore * 1000) / 1000,
      vehicleBonus: Math.round(bonus * 1000) / 1000,
      similarity: Math.round(Math.min(1, textScore * 0.8 + bonus) * 1000) / 1000,
      shared: sharedTerms(qTokens, docs[i]!),
    });
  });
  scored.sort((a, b) => b.similarity - a.similarity || b.createdAt.getTime() - a.createdAt.getTime());
  return scored.slice(0, k);
}
