import 'server-only';
/**
 * Similar past jobs: the finished Job Cards and Vehicle Services of an
 * organisation whose complaints read most like a new one, with the lines
 * their FINAL (Manager-approved) estimate carried.
 *
 * Works on plain Postgres (no extensions): a bounded candidate query — same
 * make and model family first, then same make, then anything — over the last
 * three years, at most CANDIDATE_LIMIT rows, then TF-IDF cosine + a vehicle
 * bonus in TypeScript (similar-core.ts).
 *
 * Server-only and NOT a server action: callers decide the reach (which
 * branches) after their own permission checks and pass it in.
 */
import { prisma } from '@ejo/database';
import { learningSince } from './learn-from';
import { scoreCandidates, type Candidate, type Scored, type VehicleFeatures } from './similar-core';
import { modelFamily } from './text';
import type { HistLine, LineType } from './lines-core';

export const CANDIDATE_LIMIT = 500;
export const YEARS_BACK = 3;

/** Which jobs may be compared with: the organisation, optionally only some of its branches. */
export type SimilarScope = {
  /** Null only for the platform team (no organisation fence). */
  organisationId: string | null;
  /** Undefined/null = every branch of the organisation. An empty list matches nothing. */
  branchIds?: string[] | null;
};

export type SimilarQuery = VehicleFeatures & {
  text: string;
  kind?: 'JOB_CARD' | 'SERVICE';
  /** The record being predicted for — never its own neighbour. */
  exclude?: { kind: 'JOB_CARD' | 'SERVICE'; id: string };
};

export type SimilarJob = Scored & {
  lines: HistLine[];
  /** "Toyota Corolla 2018". */
  vehicleLabel: string;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function complaintText(legacy: string | null | undefined, items: { description: string }[]): string {
  return [...items.map((c) => c.description), legacy ?? ''].map((s) => s.trim()).filter(Boolean).join('. ').slice(0, 2000);
}

type Tier = { make: string | null; family: string | null };

function vehicleFilter(t: Tier) {
  if (!t.make) return {};
  return {
    vehicle: {
      make: { equals: t.make, mode: 'insensitive' as const },
      ...(t.family ? { model: { startsWith: t.family, mode: 'insensitive' as const } } : {}),
    },
  };
}

function scopeFilter(scope: SimilarScope) {
  return {
    ...(scope.organisationId ? { branch: { businessUnit: { organisationId: scope.organisationId } } } : {}),
    ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
  };
}

async function jobCandidates(scope: SimilarScope, since: Date, tier: Tier, notIn: string[], take: number): Promise<Candidate[]> {
  if (take <= 0) return [];
  const rows = await prisma.jobCard.findMany({
    where: {
      ...scopeFilter(scope),
      ...vehicleFilter(tier),
      createdAt: { gte: since },
      status: { not: 'CANCELLED' },
      estimate: { is: { status: 'MANAGER_APPROVED' } },
      ...(notIn.length ? { id: { notIn } } : {}),
    },
    select: {
      id: true, jobNumber: true, branchId: true, createdAt: true, complaint: true, mileageAtCheckIn: true,
      complaints: { select: { description: true }, orderBy: { sequenceNumber: 'asc' } },
      vehicle: { select: { make: true, model: true, year: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map((r: (typeof rows)[number]) => ({
    id: r.id, kind: 'JOB_CARD' as const, number: r.jobNumber, branchId: r.branchId, createdAt: r.createdAt,
    text: complaintText(r.complaint, r.complaints), make: r.vehicle.make, model: r.vehicle.model, year: r.vehicle.year, mileage: r.mileageAtCheckIn,
  }));
}

async function serviceCandidates(scope: SimilarScope, since: Date, tier: Tier, notIn: string[], take: number): Promise<Candidate[]> {
  if (take <= 0) return [];
  const rows = await prisma.vehicleService.findMany({
    where: {
      ...scopeFilter(scope),
      ...vehicleFilter(tier),
      createdAt: { gte: since },
      status: { notIn: ['CANCELLED', 'ESCALATED'] },
      serviceEstimate: { is: { status: 'MANAGER_APPROVED' } },
      ...(notIn.length ? { id: { notIn } } : {}),
    },
    select: {
      id: true, serviceNumber: true, branchId: true, createdAt: true, customerComplaint: true, odometerAtService: true,
      complaints: { select: { description: true }, orderBy: { sequenceNumber: 'asc' } },
      vehicle: { select: { make: true, model: true, year: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map((r: (typeof rows)[number]) => ({
    id: r.id, kind: 'SERVICE' as const, number: r.serviceNumber, branchId: r.branchId, createdAt: r.createdAt,
    text: complaintText(r.customerComplaint, r.complaints), make: r.vehicle.make, model: r.vehicle.model, year: r.vehicle.year, mileage: r.odometerAtService,
  }));
}

/**
 * The candidate set: look-alike vehicles first (same make and model family),
 * then the same make, then any vehicle — newest first, never more than
 * `limit` in all, never older than YEARS_BACK years.
 */
export async function loadCandidates(query: SimilarQuery, scope: SimilarScope, limit = CANDIDATE_LIMIT, now = new Date()): Promise<Candidate[]> {
  if (scope.branchIds && scope.branchIds.length === 0) return [];
  const threeYears = new Date(now);
  threeYears.setFullYear(threeYears.getFullYear() - YEARS_BACK);
  // Never learn from before the organisation's go-live ("learn from") day.
  const since = await learningSince(scope.organisationId, threeYears);
  const make = query.make?.trim() || null;
  const family = modelFamily(query.model) || null;
  const tiers: Tier[] = [];
  if (make && family) tiers.push({ make, family });
  if (make) tiers.push({ make, family: null });
  tiers.push({ make: null, family: null });

  const out: Candidate[] = [];
  const seen = new Set<string>(query.exclude ? [query.exclude.id] : []);
  for (const tier of tiers) {
    const room = limit - out.length;
    if (room <= 0) break;
    const ids = [...seen];
    const [jobs, services] = await Promise.all([jobCandidates(scope, since, tier, ids, room), serviceCandidates(scope, since, tier, ids, room)]);
    const merged = [...jobs, ...services].filter((c) => !seen.has(c.id)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, room);
    for (const c of merged) { seen.add(c.id); out.push(c); }
  }
  return out;
}

/** The final approved lines of these jobs, by job id. */
export async function loadFinalLines(jobCardIds: string[], serviceIds: string[]): Promise<Map<string, HistLine[]>> {
  const map = new Map<string, HistLine[]>();
  const push = (id: string, l: HistLine) => { const a = map.get(id) ?? []; a.push(l); map.set(id, a); };
  const [jobLines, serviceLines] = await Promise.all([
    jobCardIds.length
      ? prisma.estimateLineItem.findMany({
          where: { estimate: { jobCardId: { in: jobCardIds }, status: 'MANAGER_APPROVED' } },
          select: { type: true, description: true, quantity: true, unitPrice: true, amount: true, partType: { select: { name: true, category: { select: { name: true } } } }, estimate: { select: { jobCardId: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    serviceIds.length
      ? prisma.serviceEstimateLineItem.findMany({
          where: { estimate: { vehicleServiceId: { in: serviceIds }, status: 'MANAGER_APPROVED' } },
          select: { type: true, description: true, quantity: true, unitPrice: true, amount: true, partType: { select: { name: true, category: { select: { name: true } } } }, estimate: { select: { vehicleServiceId: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
  ]);
  type Row = { type: string; description: string; quantity: unknown; unitPrice: unknown; amount: unknown; partType: { name: string; category: { name: string } } | null };
  const toLine = (r: Row): HistLine => ({
    type: r.type as LineType,
    description: r.description,
    partTypeName: r.partType?.name ?? null,
    categoryName: r.partType?.category.name ?? null,
    quantity: Number(r.quantity) || 1,
    unitPrice: num(r.unitPrice),
    amount: num(r.amount),
  });
  for (const r of jobLines as (Row & { estimate: { jobCardId: string } })[]) push(r.estimate.jobCardId, toLine(r));
  for (const r of serviceLines as (Row & { estimate: { vehicleServiceId: string } })[]) push(r.estimate.vehicleServiceId, toLine(r));
  return map;
}

/** Top-k similar finished jobs with what was done on each. */
export async function findSimilarJobs(query: SimilarQuery, scope: SimilarScope, opts: { k?: number; limit?: number; now?: Date } = {}): Promise<{ jobs: SimilarJob[]; considered: number }> {
  const candidates = await loadCandidates(query, scope, opts.limit ?? CANDIDATE_LIMIT, opts.now);
  const top = scoreCandidates(query, candidates, { k: opts.k ?? 9, kind: query.kind });
  const lines = await loadFinalLines(top.filter((t) => t.kind === 'JOB_CARD').map((t) => t.id), top.filter((t) => t.kind === 'SERVICE').map((t) => t.id));
  return {
    considered: candidates.length,
    jobs: top
      .map((t) => ({ ...t, lines: lines.get(t.id) ?? [], vehicleLabel: [t.make, t.model, t.year].filter(Boolean).join(' ') || 'Vehicle' }))
      // A job whose approved estimate has no lines teaches nothing.
      .filter((j) => j.lines.length > 0),
  };
}
