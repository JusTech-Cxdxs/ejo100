import 'server-only';
/**
 * The training set for the Python ML phase (docs/AI_READINESS.md, "Training
 * data"): every finished job of the organisation in the last three years —
 * complaint text, vehicle features, final approved lines — and, where Enyo
 * predicted it, how that prediction did.
 *
 * No personal data leaves: the reader below selects no contact details, no
 * plates, VINs or engine numbers, and no record ids; people's names are read
 * only so they can be scrubbed out of the free text (dataset-core.ts).
 *
 * Server-only, NOT a server action: the export route checks the person
 * (enyo.manage) and passes the reach in.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '@ejo/database';
import { lagosDayKey } from '@/lib/utils/format-date';
import { datasetLines, mileageBand, opaqueId, scrubText, type DatasetRow } from './dataset-core';
import { loadFinalLines, YEARS_BACK } from './similar';
import type { PredictionOutput } from './lines';
import type { HistLine } from './lines-core';

export const DATASET_ROW_LIMIT = 20_000;

export type DatasetScope = { organisationId: string; branchIds: string[] | null };

const BATCH = 500;
function chunks<T>(xs: T[], n = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

type Job = {
  id: string;
  kind: 'JOB_CARD' | 'SERVICE';
  createdAt: Date;
  branchCode: string | null;
  complaint: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  vehicleType: string | null;
  /** Only to scrub them out of free text. */
  names: string[];
};

const nameOf = (u: { fullName: string } | null | undefined) => (u?.fullName ? [u.fullName] : []);

export async function buildTrainingRows(scope: DatasetScope, opts: { limit?: number; now?: Date } = {}): Promise<DatasetRow[]> {
  const limit = Math.min(opts.limit ?? DATASET_ROW_LIMIT, DATASET_ROW_LIMIT);
  const since = new Date(opts.now ?? new Date());
  since.setFullYear(since.getFullYear() - YEARS_BACK);
  const where = {
    branch: { businessUnit: { organisationId: scope.organisationId } },
    ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
    createdAt: { gte: since },
  };
  const people = { select: { fullName: true } } as const;
  const [jobRows, serviceRows] = await Promise.all([
    prisma.jobCard.findMany({
      where: { ...where, status: { not: 'CANCELLED' }, estimate: { is: { status: 'MANAGER_APPROVED' } } },
      select: {
        id: true, createdAt: true, complaint: true, mileageAtCheckIn: true,
        complaints: { select: { description: true }, orderBy: { sequenceNumber: 'asc' } },
        branch: { select: { code: true } },
        vehicle: { select: { make: true, model: true, year: true, vehicleType: true } },
        customer: { select: { fullName: true, contacts: { select: { name: true } } } },
        supervisor: people, assignedTechnician: people, createdBy: people,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
    prisma.vehicleService.findMany({
      where: { ...where, status: { notIn: ['CANCELLED', 'ESCALATED'] }, serviceEstimate: { is: { status: 'MANAGER_APPROVED' } } },
      select: {
        id: true, createdAt: true, customerComplaint: true, odometerAtService: true,
        complaints: { select: { description: true }, orderBy: { sequenceNumber: 'asc' } },
        branch: { select: { code: true } },
        vehicle: { select: { make: true, model: true, year: true, vehicleType: true } },
        customer: { select: { fullName: true, contacts: { select: { name: true } } } },
        supervisor: people, assignedTechnician: people, createdBy: people,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
  ]);

  type Row = (typeof jobRows)[number] | (typeof serviceRows)[number];
  const namesOf = (r: Row) => [r.customer.fullName, ...r.customer.contacts.map((c: { name: string }) => c.name), ...nameOf(r.supervisor), ...nameOf(r.assignedTechnician), ...nameOf(r.createdBy)];
  const jobs: Job[] = [
    ...jobRows.map((r: (typeof jobRows)[number]) => ({
      id: r.id, kind: 'JOB_CARD' as const, createdAt: r.createdAt, branchCode: r.branch.code,
      complaint: [...r.complaints.map((c: { description: string }) => c.description), r.complaint ?? ''].map((s) => s.trim()).filter(Boolean).join('. '),
      make: r.vehicle.make, model: r.vehicle.model, year: r.vehicle.year, mileage: r.mileageAtCheckIn, vehicleType: r.vehicle.vehicleType, names: namesOf(r),
    })),
    ...serviceRows.map((r: (typeof serviceRows)[number]) => ({
      id: r.id, kind: 'SERVICE' as const, createdAt: r.createdAt, branchCode: r.branch.code,
      complaint: [...r.complaints.map((c: { description: string }) => c.description), r.customerComplaint ?? ''].map((s) => s.trim()).filter(Boolean).join('. '),
      make: r.vehicle.make, model: r.vehicle.model, year: r.vehicle.year, mileage: r.odometerAtService, vehicleType: r.vehicle.vehicleType, names: namesOf(r),
    })),
  ]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-limit);

  const lines = new Map<string, HistLine[]>();
  for (const part of chunks(jobs)) {
    const m = await loadFinalLines(part.filter((j) => j.kind === 'JOB_CARD').map((j) => j.id), part.filter((j) => j.kind === 'SERVICE').map((j) => j.id));
    for (const [k, v] of m) lines.set(k, v);
  }
  const predictions = new Map<string, { output: unknown; precision: number | null; recall: number | null; modelVersion: string }>();
  for (const part of chunks(jobs)) {
    const rows = await prisma.enyoPrediction.findMany({
      where: { organisationId: scope.organisationId, status: 'RESOLVED', subjectId: { in: part.map((j) => j.id) } },
      select: { subjectId: true, output: true, precision: true, recall: true, modelVersion: true },
    });
    for (const p of rows) predictions.set(p.subjectId, p);
  }

  const salt = randomBytes(16).toString('hex');
  const out: DatasetRow[] = [];
  for (const j of jobs) {
    const final = lines.get(j.id) ?? [];
    if (final.length === 0) continue;
    const p = predictions.get(j.id);
    const pOut = p?.output as Partial<PredictionOutput> | undefined;
    const labour = final.filter((l) => l.type === 'LABOUR');
    out.push({
      row_id: opaqueId(j.id, salt),
      kind: j.kind,
      opened_on: lagosDayKey(j.createdAt),
      branch_code: j.branchCode,
      complaint_text: scrubText(j.complaint, j.names),
      make: j.make,
      model: j.model,
      year: j.year,
      mileage_band_km: mileageBand(j.mileage),
      vehicle_type: j.vehicleType,
      lines: datasetLines(final, j.names),
      labour_total: labour.length ? Math.round(labour.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100 : null,
      predicted_keys: p ? (pOut?.ok && Array.isArray(pOut.lines) ? pOut.lines.map((l) => l.key) : []) : null,
      precision: p?.precision ?? null,
      recall: p?.recall ?? null,
      model_version: p?.modelVersion ?? null,
    });
  }
  return out;
}
