import 'server-only';
/**
 * A prediction made ready for one person: Store parts priced from TODAY's
 * selling price and stock (through the Store's own readers, which check the
 * person's reach), lines already on the estimate marked, and the similar
 * jobs behind it filtered to those this person may open.
 *
 * Used by the "Likely lines from similar jobs" card and by Enyo's
 * likely_estimate_lines tool. Callers check first that the person may see
 * the record; this module never widens what anyone sees.
 */
import { prisma } from '@ejo/database';
import { allows } from '@/lib/authz/server';
import { getFittingPartsForVehicle, listPartTypes } from '@/lib/actions/store';
import { getEnyoSettings, type EnyoSettings } from '@/lib/enyo/settings';
import { lineKey, type HistLine, type PredictedLine } from './lines-core';
import { normaliseText } from './text';
import { loadSubject, PREDICTION_KIND, predictLines, recordPrediction, SUBJECT_TYPE, type PredictionOutput, type Subject, type SubjectFacts } from './lines';

export type StorePrice = {
  /** Lowest and highest selling price of the fitting parts that have one. */
  priceMin: number | null;
  priceMax: number | null;
  /** Units available now (on hand less reserved), across the fitting parts. */
  available: number;
  /** How many catalogue parts of this type fit the vehicle. */
  parts: number;
};

export type SuggestedLine = PredictedLine & {
  /** This branch's Part Type for a Store part line (null: not in this branch's catalogue). */
  partTypeId: string | null;
  store: StorePrice | null;
  alreadyOnEstimate: boolean;
};

export type EvidenceJob = { number: string; href: string; kind: 'JOB_CARD' | 'SERVICE'; similarity: number; vehicle: string; complaint: string; shared: string[] };

export type Suggestion = {
  predictionId: string;
  status: string;
  settings: EnyoSettings;
  ok: boolean;
  reason: string | null;
  lines: SuggestedLine[];
  /** Similar jobs this person may open. */
  evidence: EvidenceJob[];
  /** Similar jobs used that this person may not open (counted, never named). */
  hiddenEvidence: number;
  facts: SubjectFacts;
};

const hrefOf = (kind: 'JOB_CARD' | 'SERVICE', id: string) => (kind === 'JOB_CARD' ? `/workshop/job-cards/${id}` : `/workshop/vehicle-service/${id}`);

/** Today's Store figures for the Store part lines (only what the person's Store reach shows). */
export async function priceFromStore(lines: PredictedLine[], facts: Pick<SubjectFacts, 'branchId' | 'make' | 'model' | 'year' | 'engineType'>): Promise<Map<string, { partTypeId: string | null; store: StorePrice | null }>> {
  const out = new Map<string, { partTypeId: string | null; store: StorePrice | null }>();
  const storeLines = lines.filter((l) => l.type === 'STORE_PART');
  if (storeLines.length === 0) return out;
  const types = await listPartTypes(facts.branchId);
  const byName = new Map<string, string>(types.map((t: { id: string; name: string }) => [normaliseText(t.name), t.id]));
  await Promise.all(storeLines.map(async (l) => {
    const partTypeId = byName.get(normaliseText(l.partTypeName ?? l.label)) ?? null;
    if (!partTypeId) { out.set(l.key, { partTypeId: null, store: null }); return; }
    const parts = await getFittingPartsForVehicle(facts.branchId, { make: facts.make, model: facts.model, year: facts.year, engineType: facts.engineType }, undefined, partTypeId);
    const prices = parts.map((p: { sellingPrice: unknown }) => (p.sellingPrice === null || p.sellingPrice === undefined ? null : Number(p.sellingPrice))).filter((n: number | null): n is number => n !== null && Number.isFinite(n));
    const available = parts.reduce((s: number, p: { stock: { quantityOnHand: unknown; quantityReserved: unknown } | null }) => s + Math.max(0, Number(p.stock?.quantityOnHand ?? 0) - Number(p.stock?.quantityReserved ?? 0)), 0);
    out.set(l.key, {
      partTypeId,
      store: { priceMin: prices.length ? Math.min(...prices) : null, priceMax: prices.length ? Math.max(...prices) : null, available: Math.round(available * 100) / 100, parts: parts.length },
    });
  }));
  return out;
}

/** The similar jobs behind a prediction that this person may open, and how many they may not. */
export async function visibleEvidence(output: PredictionOutput): Promise<{ evidence: EvidenceJob[]; hidden: number }> {
  const evidence: EvidenceJob[] = [];
  let hidden = 0;
  for (const n of output.neighbours ?? []) {
    if (await allows('workshop.job_card.view', { branchId: n.branchId })) {
      evidence.push({ number: n.number, href: hrefOf(n.kind, n.id), kind: n.kind, similarity: n.similarity, vehicle: n.vehicle, complaint: n.complaint, shared: n.shared });
    } else hidden++;
  }
  return { evidence, hidden };
}

/**
 * The prediction for a record, ready for one person.
 *
 * display: for the estimate page — only in Suggest mode (null otherwise, and
 * null once dismissed or resolved); computes and stores a prediction when
 * none exists yet (a record opened before predictions were on), and records
 * that people now see it (SHADOW → SHOWN).
 *
 * Without display (Enyo's tool): the stored prediction, or a fresh one that
 * is not stored. Null when predictions are switched off.
 */
export async function suggestionFor(subject: Subject, existing: Pick<HistLine, 'type' | 'description' | 'partTypeName'>[], opts: { display?: boolean } = {}): Promise<Suggestion | null> {
  const facts = await loadSubject(subject);
  if (!facts || !facts.organisationId) return null;
  const settings = await getEnyoSettings(facts.organisationId);
  if (!settings.enabled || settings.predictionsMode === 'OFF') return null;
  if (opts.display && settings.predictionsMode !== 'SUGGEST') return null;
  const where = { kind_subjectType_subjectId: { kind: PREDICTION_KIND[subject.kind], subjectType: SUBJECT_TYPE[subject.kind], subjectId: subject.id } };
  let row: { id: string; status: string; output: unknown } | null = await prisma.enyoPrediction.findUnique({ where, select: { id: true, status: true, output: true } });
  if (opts.display) {
    if (!row) {
      await recordPrediction(subject, { status: 'SHOWN' });
      row = await prisma.enyoPrediction.findUnique({ where, select: { id: true, status: true, output: true } });
    }
    if (!row || row.status === 'DISMISSED' || row.status === 'RESOLVED') return null;
    if (row.status === 'SHADOW') {
      await prisma.enyoPrediction.updateMany({ where: { id: row.id, status: 'SHADOW' }, data: { status: 'SHOWN' } });
      row = { ...row, status: 'SHOWN' };
    }
  }
  const output = (row?.output as PredictionOutput | undefined) ?? (await predictLines(facts));
  const onEstimate = new Set(existing.map((l) => lineKey(l)));
  const prices = output.ok ? await priceFromStore(output.lines, facts) : new Map<string, { partTypeId: string | null; store: StorePrice | null }>();
  const { evidence, hidden } = await visibleEvidence(output);
  return {
    predictionId: row?.id ?? '',
    status: row?.status ?? 'NOT_STORED',
    settings,
    ok: Boolean(output.ok),
    reason: output.reason ?? null,
    lines: (output.lines ?? []).map((l) => ({ ...l, partTypeId: prices.get(l.key)?.partTypeId ?? null, store: prices.get(l.key)?.store ?? null, alreadyOnEstimate: onEstimate.has(l.key) })),
    evidence,
    hiddenEvidence: hidden,
    facts,
  };
}
