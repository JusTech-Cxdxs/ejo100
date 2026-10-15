import 'server-only';
/**
 * Using the organisation's trained models inside the portal.
 *
 *   - Only an ACTIVE model is ever used — one a person chose on the Enyo
 *     models page (never the trainer, never automatically).
 *   - Only while the master switch is on and the capability's level allows it
 *     (lib/enyo/ml/capabilities.ts): SHADOW = measured, ASSIST = shown.
 *   - Nothing here saves, orders or changes a price; it only informs.
 *
 * Server-only, NOT a server action: callers check the person first.
 */
import { after } from 'next/server';
import { prisma } from '@ejo/database';
import { getEnyoSettings } from '@/lib/enyo/settings';
import { logFailure } from '@/lib/log';
import { loadFinalLines } from '@/lib/enyo/predict/similar';
import { lineKey } from '@/lib/enyo/predict/lines-core';
import { scrubText } from '@/lib/enyo/predict/dataset-core';
import { validateArtifact, type AnomalyArtifact, type Artifact, type DemandArtifact, type DurationArtifact, type MlTask, type ThemesArtifact } from './artifact-core';
import { runs, shown, type CapabilityKey, type Level } from './capabilities';
import { complaintTokens, featureTokens, lineTokens, workNumbers } from './features-core';
import { checkPrice, predictDuration, reorderSuggestions, type DurationOutput, type PriceCheck, type ReorderSuggestion } from './runtime-core';

const CACHE_MS = 60_000;

/** A line's identity exactly as in the training data (dataset-core.ts datasetLines): from the scrubbed description. */
export function mlLineKey(l: { type: string; description: string; partTypeName?: string | null }): string {
  return lineKey({ type: l.type as never, description: scrubText(l.description), partTypeName: l.partTypeName ?? null });
}

/** The organisation a branch belongs to (a record's own organisation, never the viewer's). */
export async function organisationOfBranch(branchId: string): Promise<string | null> {
  const b = await prisma.branch.findUnique({ where: { id: branchId }, select: { businessUnit: { select: { organisationId: true } } } });
  return b?.businessUnit.organisationId ?? null;
}
const cache = new Map<string, { at: number; value: { id: string; version: string; artifact: Artifact } | null }>();

/** The organisation's ACTIVE model for a task (checked once, remembered for a minute per server). */
export async function activeModel<T extends Artifact>(organisationId: string, task: MlTask): Promise<{ id: string; version: string; artifact: T } | null> {
  const key = `${organisationId}:${task}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as { id: string; version: string; artifact: T } | null;
  let value: { id: string; version: string; artifact: Artifact } | null = null;
  try {
    const row = await prisma.enyoModel.findFirst({ where: { organisationId, task, status: 'ACTIVE' }, orderBy: { promotedAt: 'desc' }, select: { id: true, version: true, artifact: true } });
    if (row) value = { id: row.id, version: row.version, artifact: validateArtifact(task, row.artifact) };
  } catch (err) {
    logFailure('Enyo model could not be loaded', task, organisationId, err);
    value = null;
  }
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.clear();
  return value as { id: string; version: string; artifact: T } | null;
}

/** Forget remembered models (after a person changes which model is in use). */
export function forgetModels(organisationId: string): void {
  for (const k of cache.keys()) if (k.startsWith(`${organisationId}:`)) cache.delete(k);
}

/** The capability's level for the organisation, and its model when it may run. */
export async function capability<T extends Artifact>(organisationId: string | null | undefined, key: CapabilityKey): Promise<{ level: Level; model: { id: string; version: string; artifact: T } | null }> {
  if (!organisationId) return { level: 'OFF', model: null };
  const settings = await getEnyoSettings(organisationId);
  const level: Level = settings.enabled ? settings.capabilityLevels[key] : 'OFF';
  if (!runs(level)) return { level, model: null };
  return { level, model: await activeModel<T>(organisationId, key) };
}

// ------------------------------------------------------------------ job duration

export type DurationSubject = { kind: 'JOB_CARD' | 'SERVICE'; id: string };
export const DURATION_KIND = 'JOB_DURATION';
const SUBJECT_TYPE = { JOB_CARD: 'JobCard', SERVICE: 'VehicleService' } as const;

/** Stored as EnyoPrediction.output for JOB_DURATION. */
export type DurationPrediction = DurationOutput & { modelVersion: string; openedAt: string; computedAt: string };

async function durationFacts(s: DurationSubject) {
  const pick = { make: true, model: true, year: true, vehicleType: true, mileage: true } as const;
  const row = s.kind === 'JOB_CARD'
    ? await prisma.jobCard.findUnique({ where: { id: s.id }, select: { createdAt: true, branchId: true, complaint: true, mileageAtCheckIn: true, complaints: { select: { description: true }, orderBy: { sequenceNumber: 'asc' } }, vehicle: { select: pick }, branch: { select: { code: true, businessUnit: { select: { organisationId: true } } } }, department: { select: { name: true } } } })
    : await prisma.vehicleService.findUnique({ where: { id: s.id }, select: { createdAt: true, branchId: true, customerComplaint: true, odometerAtService: true, complaints: { select: { description: true }, orderBy: { sequenceNumber: 'asc' } }, vehicle: { select: pick }, branch: { select: { code: true, businessUnit: { select: { organisationId: true } } } }, department: { select: { name: true } } } });
  if (!row) return null;
  const r = row as typeof row & { complaint?: string | null; customerComplaint?: string | null; mileageAtCheckIn?: number | null; odometerAtService?: number | null };
  const complaint = scrubText([...r.complaints.map((c: { description: string }) => c.description), (r.complaint ?? r.customerComplaint ?? '')].map((x) => x.trim()).filter(Boolean).join('. '));
  const lines = ((await loadFinalLines(s.kind === 'JOB_CARD' ? [s.id] : [], s.kind === 'SERVICE' ? [s.id] : [])).get(s.id) ?? []).map((l) => ({ type: l.type, key: mlLineKey(l), quantity: l.quantity }));
  return {
    organisationId: r.branch.businessUnit.organisationId, branchId: r.branchId, openedAt: r.createdAt, lines,
    tokens: [...complaintTokens(complaint), ...featureTokens({ kind: s.kind, complaint, make: r.vehicle.make, model: r.vehicle.model, year: r.vehicle.year, mileageKm: r.mileageAtCheckIn ?? r.odometerAtService ?? null, vehicleType: r.vehicle.vehicleType, branchCode: r.branch.code, department: r.department?.name ?? null, openedAt: r.createdAt }), ...lineTokens(lines)],
    numbers: workNumbers(complaint, lines),
  };
}

/**
 * At the estimate's final approval: store how long the job is likely to take
 * (SHADOW or ASSIST). Once per record; a repeat or a race changes nothing.
 */
export async function recordDuration(s: DurationSubject): Promise<'stored' | 'off' | 'exists' | 'gone'> {
  const where = { kind_subjectType_subjectId: { kind: DURATION_KIND, subjectType: SUBJECT_TYPE[s.kind], subjectId: s.id } };
  if (await prisma.enyoPrediction.findUnique({ where, select: { id: true } })) return 'exists';
  const f = await durationFacts(s);
  if (!f || !f.lines.length) return 'gone';
  const { level, model } = await capability<DurationArtifact>(f.organisationId, 'JOB_DURATION');
  if (!model || !runs(level)) return 'off';
  const out = predictDuration(model.artifact, { tokens: f.tokens, numbers: f.numbers });
  const output: DurationPrediction = { ...out, modelVersion: model.version, openedAt: f.openedAt.toISOString(), computedAt: new Date().toISOString() };
  try {
    await prisma.enyoPrediction.create({
      data: { organisationId: f.organisationId, branchId: f.branchId, kind: DURATION_KIND, subjectType: SUBJECT_TYPE[s.kind], subjectId: s.id, modelVersion: model.version, input: { tokens: f.tokens.length, lines: f.lines.length }, output: output as unknown as object, status: shown(level) ? 'SHOWN' : 'SHADOW' },
    });
    return 'stored';
  } catch (err) {
    if ((err as { code?: string } | null)?.code === 'P2002') return 'exists';
    throw err;
  }
}

/** For the final-approval actions: predict after the response has gone. Never throws. */
export function scheduleDuration(s: DurationSubject): void {
  const run = () => recordDuration(s).then(() => undefined).catch((err) => logFailure('Enyo job time estimate failed', s.kind, s.id, err));
  try { after(run); } catch { void run(); }
}

/**
 * Scores stored time estimates whose vehicle is now ready: the actual hours,
 * the error of the middle estimate, and whether it fell inside the range.
 * Run daily (the scheduled jobs). Pages through the open estimates oldest
 * first (at most `scan`), so jobs still in the workshop never block newer
 * ones; an estimate still open after 120 days, or whose record was
 * cancelled or removed, is set aside (DISMISSED). Each is scored exactly once.
 */
export async function resolveDurations(scan = 2_000): Promise<number> {
  const STALE = 120 * 86_400_000;
  let done = 0;
  let cursor: string | undefined;
  for (let seen = 0; seen < scan; ) {
    const open = await prisma.enyoPrediction.findMany({
      where: { kind: DURATION_KIND, resolvedAt: null }, select: { id: true, subjectType: true, subjectId: true, output: true, createdAt: true },
      orderBy: { id: 'asc' }, take: 300, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!open.length) break;
    seen += open.length;
    cursor = open.at(-1)!.id;
    const ids = (t: string) => open.filter((p: { subjectType: string }) => p.subjectType === t).map((p: { subjectId: string }) => p.subjectId);
    const pick = { id: true, createdAt: true, readyForCollectionAt: true, completedAt: true, status: true } as const;
    const [jobs, services] = await Promise.all([
      prisma.jobCard.findMany({ where: { id: { in: ids('JobCard') } }, select: pick }),
      prisma.vehicleService.findMany({ where: { id: { in: ids('VehicleService') } }, select: pick }),
    ]);
    type Rec = { id: string; createdAt: Date; readyForCollectionAt: Date | null; completedAt: Date | null; status: string };
    const recs = new Map<string, Rec>([...jobs, ...services].map((r: Rec) => [r.id, r]));
    for (const p of open) {
      const rec = recs.get(p.subjectId);
      const out = (p.output ?? {}) as Partial<DurationPrediction>;
      const end = rec ? rec.readyForCollectionAt ?? rec.completedAt : null;
      const actual = rec && end ? (end.getTime() - rec.createdAt.getTime()) / 3_600_000 : NaN;
      if (!rec || rec.status === 'CANCELLED' || typeof out.p50 !== 'number' || (end && !(actual > 0)) || (!end && Date.now() - p.createdAt.getTime() > STALE)) {
        await prisma.enyoPrediction.updateMany({ where: { id: p.id, resolvedAt: null }, data: { status: 'DISMISSED', resolvedAt: new Date() } });
        continue;
      }
      if (!end) continue;
      const inRange = actual >= (out.p10 ?? 0) && actual <= (out.p90 ?? Infinity);
      const res = await prisma.enyoPrediction.updateMany({
        where: { id: p.id, resolvedAt: null },
        data: { status: 'RESOLVED', outcome: { actualHours: Math.round(actual * 100) / 100, absErrorHours: Math.round(Math.abs(actual - out.p50) * 100) / 100, inRange }, resolvedAt: new Date() },
      });
      done += res.count;
    }
  }
  return done;
}

/** The stored estimate for a record, when its level shows it to people. */
export async function shownDuration(s: DurationSubject, organisationId: string | null): Promise<DurationPrediction | null> {
  const { level } = await capability(organisationId, 'JOB_DURATION');
  if (!shown(level)) return null;
  const row = await prisma.enyoPrediction.findFirst({ where: { kind: DURATION_KIND, subjectType: SUBJECT_TYPE[s.kind], subjectId: s.id, organisationId: organisationId ?? '__none__' }, select: { output: true } });
  const out = row?.output as Partial<DurationPrediction> | undefined;
  return out && typeof out.p50 === 'number' && typeof out.p10 === 'number' && typeof out.p90 === 'number' && typeof out.openedAt === 'string' ? (out as DurationPrediction) : null;
}

// ------------------------------------------------------------------ prices

export type PricedLine = { id: string; type: string; description: string; partTypeName?: string | null; quantity: number; unitPrice: number | null };

/** Unusual-price checks for the typed-in lines of an estimate (ASSIST only); empty when off or no model. */
export async function priceWarnings(organisationId: string | null, lines: PricedLine[]): Promise<Map<string, PriceCheck>> {
  const out = new Map<string, PriceCheck>();
  const { level, model } = await capability<AnomalyArtifact>(organisationId, 'PRICE_ANOMALY');
  if (!model || !shown(level)) return out;
  for (const l of lines) {
    if (l.type === 'STORE_PART' || !(l.unitPrice && l.unitPrice > 0)) continue;
    const c = checkPrice(model.artifact, { key: mlLineKey(l), unitPrice: l.unitPrice, quantity: l.quantity || 1 });
    if (c?.unusual) out.set(l.id, c);
  }
  return out;
}

// ------------------------------------------------------------------ parts

export type ReorderRow = ReorderSuggestion & { name: string; partNumber: string | null; unit: string; branchName: string };

/** Parts at or below their learned reorder point, within the given branches (null = all of the organisation). */
export async function reorderList(organisationId: string | null, branchIds: string[] | null): Promise<{ level: Level; asOf: string | null; version: string | null; rows: ReorderRow[] }> {
  const { level, model } = await capability<DemandArtifact>(organisationId, 'PARTS_DEMAND');
  if (!model || !shown(level)) return { level, asOf: null, version: null, rows: [] };
  const ids = model.artifact.parts.filter((p) => p.method !== 'none').map((p) => p.partId);
  const parts = await prisma.part.findMany({
    where: { id: { in: ids }, isActive: true, branch: { businessUnit: { organisationId: organisationId! } }, ...(branchIds ? { branchId: { in: branchIds } } : {}) },
    select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true, branch: { select: { name: true } }, stock: { select: { quantityOnHand: true, quantityReserved: true } } },
  });
  const byId = new Map(parts.map((p: (typeof parts)[number]) => [p.id, p]));
  const onHand = new Map(parts.map((p: (typeof parts)[number]) => [p.id, Math.max(0, Number(p.stock?.quantityOnHand ?? 0) - Number(p.stock?.quantityReserved ?? 0))]));
  const rows = reorderSuggestions(model.artifact, onHand).map((s) => {
    const p = byId.get(s.partId)!;
    return { ...s, name: p.name, partNumber: p.partNumber, unit: p.baseUnitOfMeasure, branchName: p.branch.name };
  });
  return { level, asOf: model.artifact.asOf, version: model.version, rows };
}

// ------------------------------------------------------------------ themes

export async function complaintThemes(organisationId: string | null): Promise<{ level: Level; version: string | null; themes: ThemesArtifact['themes'] }> {
  const { level, model } = await capability<ThemesArtifact>(organisationId, 'COMPLAINT_THEMES');
  if (!model || !shown(level)) return { level, version: null, themes: [] };
  return { level, version: model.version, themes: model.artifact.themes };
}
