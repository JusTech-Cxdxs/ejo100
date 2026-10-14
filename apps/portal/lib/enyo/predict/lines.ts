import 'server-only';
/**
 * Likely estimate lines (model "knn-tfidf-1"): the lines that the most
 * similar finished jobs had in common, with how many of them had each line.
 *
 * The loop:
 *   1. A Job Card / Vehicle Service is opened → recordPrediction() (after the
 *      creation has committed, never in its way) stores what Enyo would have
 *      suggested, as SHADOW (measured, never shown) or SHOWN (Suggest mode).
 *   2. The Manager gives the estimate its final approval → resolvePrediction()
 *      compares the prediction with the approved lines (precision, recall,
 *      labour error) — once, whatever happens concurrently.
 *   3. The Learning page reads those numbers; an administrator decides when
 *      the organisation moves from Shadow to Suggest.
 *
 * Enyo never writes an estimate: in Suggest mode a person presses "Add",
 * which only fills in the normal add-line form.
 *
 * Server-only, NOT a server action: nothing here checks the person. Callers
 * (the create / approve actions, the estimate page, Enyo's tools) have done
 * that already.
 */
import { after } from 'next/server';
import { prisma } from '@ejo/database';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { logFailure } from '@/lib/log';
import { aggregateLines, compareLines, lineKey, SERVICE_LINE_TYPES, type HistLine, type PredictedLine } from './lines-core';
import { findSimilarJobs, loadFinalLines, type SimilarScope } from './similar';
import type { VehicleFeatures } from './similar-core';

export const MODEL_VERSION = 'knn-tfidf-1';
export const NEIGHBOURS_K = 9;

export type SubjectKind = 'JOB_CARD' | 'SERVICE';
export type Subject = { kind: SubjectKind; id: string };

export const PREDICTION_KIND: Record<SubjectKind, 'JOB_CARD_LINES' | 'SERVICE_LINES'> = { JOB_CARD: 'JOB_CARD_LINES', SERVICE: 'SERVICE_LINES' };
export const SUBJECT_TYPE: Record<SubjectKind, 'JobCard' | 'VehicleService'> = { JOB_CARD: 'JobCard', SERVICE: 'VehicleService' };

/** What the prediction is based on — stored as EnyoPrediction.input. No customer or vehicle identifiers. */
export type SubjectFacts = VehicleFeatures & {
  kind: SubjectKind;
  id: string;
  number: string;
  branchId: string;
  organisationId: string | null;
  complaint: string;
  vehicleType: string | null;
  /** Engine type ("4HK1"): only to pick the Store parts that fit. */
  engineType: string | null;
};

export type NeighbourRef = { id: string; kind: SubjectKind; number: string; branchId: string; similarity: number; shared: string[]; vehicle: string; complaint: string; lineCount: number };

/** Stored as EnyoPrediction.output. */
export type PredictionOutput = {
  modelVersion: string;
  ok: boolean;
  /** Why there is no suggestion (fewer than 3 similar jobs, nothing in common). */
  reason: string | null;
  lines: PredictedLine[];
  neighbours: NeighbourRef[];
  considered: number;
  computedAt: string;
};

/** Stored as EnyoPrediction.outcome once resolved. */
export type PredictionOutcome = {
  approved: { key: string; type: string; label: string; quantity: number; amount: number | null }[];
  kept: string[];
  missed: { key: string; type: string; label: string }[];
  extra: { key: string; type: string; label: string }[];
  labour: { predicted: number | null; approved: number | null; error: number | null };
  /** SHADOW / SHOWN / DISMISSED before it was resolved — was it seen by people? */
  previousStatus: string;
};

/** The facts of a Job Card / Vehicle Service needed to predict for it (null when it is gone). */
export async function loadSubject(subject: Subject): Promise<SubjectFacts | null> {
  if (subject.kind === 'JOB_CARD') {
    const j = await prisma.jobCard.findUnique({
      where: { id: subject.id },
      select: {
        id: true, jobNumber: true, branchId: true, complaint: true, mileageAtCheckIn: true,
        complaints: { select: { description: true }, orderBy: { sequenceNumber: 'asc' } },
        vehicle: { select: { make: true, model: true, year: true, vehicleType: true, mileage: true, engineType: true } },
        branch: { select: { businessUnit: { select: { organisationId: true } } } },
      },
    });
    if (!j) return null;
    return {
      kind: 'JOB_CARD', id: j.id, number: j.jobNumber, branchId: j.branchId, organisationId: j.branch.businessUnit.organisationId,
      complaint: [...j.complaints.map((c: { description: string }) => c.description), j.complaint ?? ''].map((s) => s.trim()).filter(Boolean).join('. ').slice(0, 2000),
      make: j.vehicle.make, model: j.vehicle.model, year: j.vehicle.year, mileage: j.mileageAtCheckIn ?? j.vehicle.mileage, vehicleType: j.vehicle.vehicleType, engineType: j.vehicle.engineType,
    };
  }
  const s = await prisma.vehicleService.findUnique({
    where: { id: subject.id },
    select: {
      id: true, serviceNumber: true, branchId: true, customerComplaint: true, odometerAtService: true,
      complaints: { select: { description: true }, orderBy: { sequenceNumber: 'asc' } },
      vehicle: { select: { make: true, model: true, year: true, vehicleType: true, mileage: true, engineType: true } },
      branch: { select: { businessUnit: { select: { organisationId: true } } } },
    },
  });
  if (!s) return null;
  return {
    kind: 'SERVICE', id: s.id, number: s.serviceNumber, branchId: s.branchId, organisationId: s.branch.businessUnit.organisationId,
    complaint: [...s.complaints.map((c: { description: string }) => c.description), s.customerComplaint ?? ''].map((x) => x.trim()).filter(Boolean).join('. ').slice(0, 2000),
    make: s.vehicle.make, model: s.vehicle.model, year: s.vehicle.year, mileage: s.odometerAtService ?? s.vehicle.mileage, vehicleType: s.vehicle.vehicleType, engineType: s.vehicle.engineType,
  };
}

/**
 * Predicts the lines for a subject from its organisation's similar finished
 * jobs (every branch: more history, better suggestions — the "Why?" list
 * shown to a person is filtered to what that person may open).
 */
export async function predictLines(facts: SubjectFacts, scope?: SimilarScope, now = new Date()): Promise<PredictionOutput> {
  const { jobs, considered } = await findSimilarJobs(
    { text: facts.complaint, make: facts.make, model: facts.model, year: facts.year, mileage: facts.mileage, kind: facts.kind, exclude: { kind: facts.kind, id: facts.id } },
    scope ?? { organisationId: facts.organisationId },
    { k: NEIGHBOURS_K, now },
  );
  const agg = aggregateLines(
    jobs.map((j) => ({ id: j.id, kind: j.kind, number: j.number, branchId: j.branchId, similarity: j.similarity, lines: j.lines })),
    facts.kind === 'SERVICE' ? { allowedTypes: SERVICE_LINE_TYPES } : {},
  );
  return {
    modelVersion: MODEL_VERSION,
    ok: agg.ok,
    reason: agg.ok ? null : agg.reason,
    lines: agg.ok ? agg.lines : [],
    neighbours: jobs.map((j) => ({ id: j.id, kind: j.kind, number: j.number, branchId: j.branchId, similarity: j.similarity, shared: j.shared, vehicle: j.vehicleLabel, complaint: j.text.slice(0, 300), lineCount: j.lines.length })),
    considered,
    computedAt: now.toISOString(),
  };
}

function inputOf(f: SubjectFacts) {
  return { number: f.number, complaint: f.complaint, make: f.make, model: f.model, year: f.year, mileage: f.mileage, vehicleType: f.vehicleType };
}

/**
 * Computes and stores the prediction for a newly opened record, unless the
 * organisation has predictions switched off. Idempotent: the first stored
 * prediction for a record is kept (a repeat or a race changes nothing).
 * Returns the stored row's id, or null when nothing was stored.
 */
export async function recordPrediction(subject: Subject, opts: { status?: 'SHADOW' | 'SHOWN' } = {}): Promise<string | null> {
  const facts = await loadSubject(subject);
  if (!facts || !facts.organisationId) return null;
  const settings = await getEnyoSettings(facts.organisationId);
  if (!settings.enabled || settings.predictionsMode === 'OFF') return null;
  const where = { kind_subjectType_subjectId: { kind: PREDICTION_KIND[subject.kind], subjectType: SUBJECT_TYPE[subject.kind], subjectId: subject.id } };
  const existing = await prisma.enyoPrediction.findUnique({ where, select: { id: true } });
  if (existing) return existing.id;
  const output = await predictLines(facts);
  try {
    // A plain create: the unique (kind, subject) key refuses a second one.
    const row = await prisma.enyoPrediction.create({
      data: {
        organisationId: facts.organisationId,
        branchId: facts.branchId,
        kind: PREDICTION_KIND[subject.kind],
        subjectType: SUBJECT_TYPE[subject.kind],
        subjectId: subject.id,
        modelVersion: MODEL_VERSION,
        input: inputOf(facts),
        output: output as unknown as object,
        status: opts.status ?? (settings.predictionsMode === 'SUGGEST' ? 'SHOWN' : 'SHADOW'),
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // Two creations racing for the same record: the other one stored it.
    if ((err as { code?: string } | null)?.code === 'P2002') {
      return (await prisma.enyoPrediction.findUnique({ where, select: { id: true } }))?.id ?? null;
    }
    throw err;
  }
}

/** The approved lines of a record's final estimate (empty until Manager-approved). */
export async function approvedLinesOf(subject: Subject): Promise<HistLine[]> {
  const map = await loadFinalLines(subject.kind === 'JOB_CARD' ? [subject.id] : [], subject.kind === 'SERVICE' ? [subject.id] : []);
  return map.get(subject.id) ?? [];
}

/**
 * Scores the stored prediction against the Manager-approved estimate.
 * Exactly once: the write only lands while the row is still unresolved, so a
 * double approval, a retry or two servers at once cannot resolve it twice.
 */
export async function resolvePrediction(subject: Subject): Promise<'resolved' | 'none' | 'already'> {
  const row = await prisma.enyoPrediction.findUnique({
    where: { kind_subjectType_subjectId: { kind: PREDICTION_KIND[subject.kind], subjectType: SUBJECT_TYPE[subject.kind], subjectId: subject.id } },
    select: { id: true, status: true, output: true, resolvedAt: true },
  });
  if (!row) return 'none';
  if (row.resolvedAt) return 'already';
  const approved = await approvedLinesOf(subject);
  if (approved.length === 0) return 'none';
  const out = (row.output ?? {}) as Partial<PredictionOutput>;
  const predicted = out.ok && Array.isArray(out.lines) ? out.lines : [];
  const cmp = compareLines(predicted, approved);
  const outcome: PredictionOutcome = {
    approved: approved.map((l) => ({ key: lineKey(l), type: l.type, label: l.type === 'STORE_PART' ? (l.partTypeName || l.description) : l.description, quantity: l.quantity, amount: l.type === 'STORE_PART' ? null : l.amount })),
    kept: cmp.kept,
    missed: cmp.missed,
    extra: cmp.extra,
    labour: cmp.labour,
    previousStatus: row.status,
  };
  const res = await prisma.enyoPrediction.updateMany({
    where: { id: row.id, resolvedAt: null },
    data: {
      status: 'RESOLVED',
      outcome: outcome as unknown as object,
      // A record Enyo had nothing to suggest for is counted for coverage, not accuracy.
      precision: predicted.length ? cmp.precision : null,
      recall: predicted.length ? cmp.recall : null,
      resolvedAt: new Date(),
    },
  });
  return res.count === 1 ? 'resolved' : 'already';
}

/** Runs work after the response has gone (Next's after()), or straight away outside a request. Never throws. */
function later(what: string, subject: Subject, work: () => Promise<unknown>): void {
  const run = () => work().then(() => undefined).catch((err) => logFailure(`Enyo prediction: ${what} failed`, subject.kind, subject.id, err));
  try { after(run); } catch { void run(); }
}

/** For the create actions: predict for the new record once it has committed. Errors are only logged. */
export function schedulePrediction(subject: Subject): void {
  later('record', subject, () => recordPrediction(subject));
}

/** For the final-approval actions: score the prediction. Errors are only logged. */
export function scheduleResolution(subject: Subject): void {
  later('resolve', subject, () => resolvePrediction(subject));
}
