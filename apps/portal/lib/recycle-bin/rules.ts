/**
 * Recycle bin rules — pure, no database (unit-tested in tests/recycle-bin.test.ts).
 *
 * A record created by mistake can be moved to the Recycle bin only while
 * nothing of consequence has happened to it. Anything with money, approvals,
 * parts, warranties or gate movements keeps its own route (cancel, close,
 * switch off), because that history must never disappear.
 */
import { pluralize } from '../utils/pluralize';

export type BinEntity = 'JobCard' | 'VehicleService' | 'Customer' | 'CustomerVehicle' | 'Part';
export const BIN_ENTITIES: BinEntity[] = ['JobCard', 'VehicleService', 'Customer', 'CustomerVehicle', 'Part'];

/** How each kind is named to people, and the verb prefix of its audit entries. */
export const BIN_KIND: Record<BinEntity, { noun: string; plural: string; audit: string; icon: string }> = {
  JobCard: { noun: 'Job Card', plural: 'Job Cards', audit: 'job_card', icon: 'clipboard' },
  VehicleService: { noun: 'Vehicle Service', plural: 'Vehicle Services', audit: 'vehicle_service', icon: 'droplet' },
  Customer: { noun: 'Customer', plural: 'Customers', audit: 'customer', icon: 'user' },
  CustomerVehicle: { noun: 'Vehicle', plural: 'Vehicles', audit: 'vehicle', icon: 'car' },
  Part: { noun: 'Part', plural: 'Parts', audit: 'part', icon: 'boxes' },
};

/** The record's own page. */
export function binHref(entity: BinEntity, id: string): string {
  switch (entity) {
    case 'JobCard': return `/workshop/job-cards/${id}`;
    case 'VehicleService': return `/workshop/vehicle-service/${id}`;
    case 'Customer': return `/crm/customers/${id}`;
    case 'CustomerVehicle': return `/workshop/vehicles/${id}/edit`;
    case 'Part': return `/inventory/parts/${id}`;
  }
}

export function isBinEntity(v: unknown): v is BinEntity {
  return typeof v === 'string' && (BIN_ENTITIES as string[]).includes(v);
}

// ── Retention ─────────────────────────────────────────────────────────

export const DEFAULT_RETENTION_DAYS = 30;
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

/** RECYCLE_BIN_DAYS, kept between 7 and 90 days (30 when unset or not a number). */
export function retentionDays(raw: string | undefined | null): number {
  const n = raw === undefined || raw === null || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.round(n)));
}

export function purgeAfterFrom(deletedAt: Date, days: number): Date {
  return new Date(deletedAt.getTime() + days * DAY_MS);
}

/** Whole days left before the item can be purged (0 on the last day and after). */
export function daysLeft(purgeAfter: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((purgeAfter.getTime() - now.getTime()) / DAY_MS));
}

export type BinState = 'IN_BIN' | 'EXPIRED' | 'RESTORED' | 'PURGED';
export function binState(item: { purgeAfter: Date; restoredAt: Date | null; purgedAt: Date | null }, now: Date = new Date()): BinState {
  if (item.purgedAt) return 'PURGED';
  if (item.restoredAt) return 'RESTORED';
  return item.purgeAfter.getTime() <= now.getTime() ? 'EXPIRED' : 'IN_BIN';
}

// ── Reason ────────────────────────────────────────────────────────────

export const REASON_MIN = 5;
export const REASON_MAX = 300;

/** The reason is required: a few words on what the mistake was. */
export function cleanReason(raw: unknown): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (reason.length < REASON_MIN) return { ok: false, message: 'Say in a few words why this was created by mistake (at least 5 characters).' };
  if (reason.length > REASON_MAX) return { ok: false, message: `Keep the reason under ${REASON_MAX} characters.` };
  return { ok: true, reason };
}

// ── Eligibility: what must NOT have happened ──────────────────────────

/** finished: the record has reached the end of its life, so "cancel it instead" no longer applies. */
export type Eligibility = { eligible: boolean; blockers: string[]; message: string; advice: string; finished?: boolean };

function verdict(noun: string, blockers: string[], advice: string): Eligibility {
  if (blockers.length === 0) return { eligible: true, blockers, message: '', advice };
  // At most three reasons are named, so the sentence stays short enough to show as it is.
  const named = blockers.length > 3 ? [...blockers.slice(0, 2), `has ${blockers.length - 2} other things recorded`] : blockers;
  const what = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  return { eligible: false, blockers, message: `This ${noun} ${what}, so it can't be deleted. ${advice}`, advice };
}

const some = (n: number, singular: string, plural?: string) => (n === 1 ? `a ${singular}` : pluralize(n, singular, plural));

/** Job Card statuses at the very start of its life. */
export const JOB_CARD_DELETABLE_STATUSES = ['CHECKED_IN'];

export type JobCardFacts = {
  status: string;
  payments: number;
  refunds: number;
  estimateStatus: string | null;
  partRequests: number;
  outsidePurchases: number;
  /** Parts-request or outside-purchase lines anywhere that point at this estimate's lines. */
  estimateLinesInUse: number;
  warranties: number;
  warrantyClaims: number;
  gateExit: boolean;
  roadTests: number;
  escalatedFromService: boolean;
  closeRequests: number;
};

export function jobCardEligibility(f: JobCardFacts): Eligibility {
  const b: string[] = [];
  if (f.payments > 0) b.push(`has ${some(f.payments, 'payment')} recorded`);
  if (f.refunds > 0) b.push(`has ${some(f.refunds, 'refund')} recorded`);
  if (!JOB_CARD_DELETABLE_STATUSES.includes(f.status)) b.push('has moved past check-in');
  if (f.estimateStatus && f.estimateStatus !== 'DRAFT') b.push('has an estimate that was submitted for approval');
  if (f.partRequests > 0) b.push(`has ${some(f.partRequests, 'parts request')}`);
  if (f.outsidePurchases > 0) b.push(`has ${some(f.outsidePurchases, 'outside purchase')}`);
  if (f.estimateLinesInUse > 0 && f.partRequests === 0 && f.outsidePurchases === 0) b.push('has estimate lines used by a parts request');
  if (f.warranties > 0) b.push(`has ${some(f.warranties, 'warranty', 'warranties')} linked to it`);
  if (f.warrantyClaims > 0) b.push(`has ${some(f.warrantyClaims, 'warranty claim')} linked to it`);
  if (f.gateExit) b.push('has a gate exit recorded');
  if (f.roadTests > 0) b.push(`has ${some(f.roadTests, 'road test')}`);
  if (f.escalatedFromService) b.push('was handed over from a Vehicle Service');
  if (f.closeRequests > 0) b.push('has a close request');
  return { ...verdict('Job Card', b, 'Ask for it to be cancelled instead.'), finished: ['CLOSED', 'CHECKED_OUT', 'CANCELLED'].includes(f.status) };
}

export const SERVICE_DELETABLE_STATUSES = ['SCHEDULED', 'CHECKED_IN'];

export type VehicleServiceFacts = {
  status: string;
  payments: number;
  refunds: number;
  estimateStatus: string | null;
  partRequests: number;
  estimateLinesInUse: number;
  inspectionStatus: string | null;
  primaryServiceRecorded: boolean;
  escalatedToJobCard: boolean;
  warranties: number;
  warrantyClaims: number;
  gateExit: boolean;
  roadTests: number;
  closeRequests: number;
};

export function vehicleServiceEligibility(f: VehicleServiceFacts): Eligibility {
  const b: string[] = [];
  if (f.payments > 0) b.push(`has ${some(f.payments, 'payment')} recorded`);
  if (f.refunds > 0) b.push(`has ${some(f.refunds, 'refund')} recorded`);
  if (f.escalatedToJobCard) b.push('was handed over to a Job Card');
  else if (!SERVICE_DELETABLE_STATUSES.includes(f.status)) b.push('has moved past check-in');
  if (f.estimateStatus && f.estimateStatus !== 'DRAFT') b.push('has an estimate that was submitted for approval');
  if (f.partRequests > 0) b.push(`has ${some(f.partRequests, 'parts request')}`);
  if (f.estimateLinesInUse > 0 && f.partRequests === 0) b.push('has estimate lines used by a parts request');
  if (f.inspectionStatus === 'COMPLETED' || f.inspectionStatus === 'SKIPPED') b.push('has a finished inspection');
  if (f.primaryServiceRecorded) b.push('has a primary service recorded');
  if (f.warranties > 0) b.push(`has ${some(f.warranties, 'warranty', 'warranties')} linked to it`);
  if (f.warrantyClaims > 0) b.push(`has ${some(f.warrantyClaims, 'warranty claim')} linked to it`);
  if (f.gateExit) b.push('has a gate exit recorded');
  if (f.roadTests > 0) b.push(`has ${some(f.roadTests, 'road test')}`);
  if (f.closeRequests > 0) b.push('has a close request');
  return { ...verdict('Vehicle Service', b, 'Ask for it to be cancelled instead.'), finished: f.escalatedToJobCard || ['CLOSED', 'COLLECTED', 'CANCELLED', 'ESCALATED'].includes(f.status) };
}

export type VehicleFacts = {
  jobCards: number;
  vehicleServices: number;
  warranties: number;
  warrantyClaims: number;
  gateExits: number;
  roadTests: number;
};

function vehicleBlockers(f: VehicleFacts): string[] {
  const b: string[] = [];
  if (f.jobCards > 0) b.push(`has ${some(f.jobCards, 'Job Card')}`);
  if (f.vehicleServices > 0) b.push(`has ${some(f.vehicleServices, 'Vehicle Service')}`);
  if (f.warranties > 0) b.push(`has ${some(f.warranties, 'warranty', 'warranties')}`);
  if (f.warrantyClaims > 0) b.push(`has ${some(f.warrantyClaims, 'warranty claim')}`);
  if (f.gateExits > 0) b.push('has gate exits recorded');
  if (f.roadTests > 0) b.push(`has ${some(f.roadTests, 'road test')}`);
  return b;
}

export function vehicleEligibility(f: VehicleFacts): Eligibility {
  return verdict('vehicle', vehicleBlockers(f), 'Its history must stay. Correct its details with Edit instead.');
}

export type CustomerFacts = VehicleFacts & {
  /** Has signed in to the customer portal at least once. */
  signedIn: boolean;
};

export function customerEligibility(f: CustomerFacts): Eligibility {
  const b = vehicleBlockers(f);
  if (f.signedIn) b.push('has signed in to the customer portal');
  return verdict('customer', b, 'Their history must stay. Correct the details, or switch off their portal access, instead.');
}

export type PartFacts = {
  goodsReceiptLines: number;
  batches: number;
  serials: number;
  consumptions: number;
  requestLines: number;
  estimateMatches: number;
  warranties: number;
  pricingAlerts: number;
  stockOnHand: number;
  stockReserved: number;
};

export function partEligibility(f: PartFacts): Eligibility {
  const b: string[] = [];
  if (f.goodsReceiptLines > 0 || f.batches > 0 || f.serials > 0) b.push('has been received into stock');
  if (f.stockOnHand !== 0 || f.stockReserved !== 0) b.push('has stock on hand or reserved');
  if (f.consumptions > 0) b.push('has been issued to a job');
  if (f.requestLines > 0) b.push(`is on ${some(f.requestLines, 'parts request line')}`);
  if (f.estimateMatches > 0) b.push('has been matched on an estimate');
  if (f.warranties > 0) b.push(`has ${some(f.warranties, 'warranty', 'warranties')}`);
  if (f.pricingAlerts > 0) b.push('has pricing alerts');
  return verdict('part', b, 'Switch it off (inactive) on its edit page instead.');
}

// ── Who may move a record to the bin ──────────────────────────────────

export const CREATOR_WINDOW_HOURS = 24;

export type DeleterRights = {
  userId: string;
  isSuperAdmin: boolean;
  /** admin.recycle_bin.manage on the record. */
  manageBin: boolean;
  /** The workflow right that normally ends this kind of record (Manager / customer / store rights). */
  ownerRight: boolean;
  /** workshop.job_card.create on the record (front desk). */
  openJobs?: boolean;
};

/** Job Cards and Vehicle Services: the person who opened it (front desk)
 * within 24 hours, or a Workshop Manager / administrator while it is eligible. */
export function mayDeleteJob(r: DeleterRights, rec: { createdById: string; createdAt: Date }, now: Date = new Date()): boolean {
  if (r.isSuperAdmin || r.manageBin || r.ownerRight) return true;
  const fresh = now.getTime() - rec.createdAt.getTime() <= CREATOR_WINDOW_HOURS * 3_600_000;
  return Boolean(r.openJobs) && rec.createdById === r.userId && fresh;
}

export const JOB_DELETE_REFUSED = `Only the person who opened it (within ${CREATOR_WINDOW_HOURS} hours), a Workshop Manager or an administrator can delete it.`;

/** Customers, vehicles and parts: whoever manages them, or an administrator. */
export function mayDeleteOther(r: DeleterRights): boolean {
  return r.isSuperAdmin || r.manageBin || r.ownerRight;
}

// ── Snapshot ──────────────────────────────────────────────────────────

/** Every model a snapshot may hold, in the order rows are re-inserted (parents first). */
export const SNAPSHOT_ORDER: Record<BinEntity, string[]> = {
  JobCard: ['jobCard', 'jobCardComplaint', 'estimate', 'estimateLineItem', 'cancellationRequest', 'closeRequest'],
  VehicleService: ['vehicleService', 'vehicleServiceComplaint', 'vehicleInspection', 'vehicleInspectionItem', 'serviceEstimate', 'serviceEstimateLineItem', 'vehicleServiceCancellationRequest', 'vehicleServiceCloseRequest'],
  Customer: ['customer', 'customerCompany', 'customerAddress', 'customerContact', 'customerNote', 'customerNotificationRead', 'customerVehicle', 'serviceReminderLog'],
  CustomerVehicle: ['customerVehicle', 'serviceReminderLog'],
  Part: ['part', 'partUnitOfMeasure', 'partStock', 'partFitment'],
};

export type SnapshotRow = { model: string; data: Record<string, unknown> };
export type Snapshot = { v: 1; entity: BinEntity; rows: SnapshotRow[] };

/** Rows in re-insert order (stable within a model). Refuses a model that does
 * not belong to this kind of record, or anything but exactly one root row. */
export function orderedSnapshot(entity: BinEntity, rows: SnapshotRow[]): Snapshot {
  const order = SNAPSHOT_ORDER[entity];
  for (const r of rows) if (!order.includes(r.model)) throw new Error(`Snapshot of ${entity} cannot hold ${r.model}`);
  const roots = rows.filter((r) => r.model === order[0]).length;
  if (roots !== 1) throw new Error(`Snapshot of ${entity} needs exactly one ${order[0]} row`);
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => order.indexOf(a.r.model) - order.indexOf(b.r.model) || a.i - b.i).map((x) => x.r);
  return { v: 1, entity, rows: sorted };
}

/** A stored snapshot read back — or null when it is missing or malformed. */
export function parseSnapshot(json: unknown): Snapshot | null {
  if (!json || typeof json !== 'object') return null;
  const s = json as { v?: unknown; entity?: unknown; rows?: unknown };
  if (s.v !== 1 || !isBinEntity(s.entity) || !Array.isArray(s.rows)) return null;
  const rows = s.rows.filter((r): r is SnapshotRow => Boolean(r) && typeof (r as SnapshotRow).model === 'string' && typeof (r as SnapshotRow).data === 'object' && (r as SnapshotRow).data !== null);
  if (rows.length !== s.rows.length) return null;
  try {
    return orderedSnapshot(s.entity, rows);
  } catch {
    return null;
  }
}

/** Plain JSON for storage: dates as ISO text, decimals as text (both are
 * accepted back by Prisma on create), relation objects left out. */
export function plainRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const maybe = v as { toJSON?: () => unknown };
      if (typeof maybe.toJSON === 'function') out[k] = maybe.toJSON();
      // Any other object is a loaded relation, never a column of these tables.
    } else out[k] = v;
  }
  return out;
}

// ── Reference numbers ─────────────────────────────────────────────────

/** "JC-2026-" + the next 6-digit sequence after the latest number this year. */
export function nextReference(prefix: string, latest: string | null): string {
  const seq = latest && latest.startsWith(prefix) ? parseInt(latest.slice(prefix.length), 10) : 0;
  return `${prefix}${String((Number.isFinite(seq) ? seq : 0) + 1).padStart(6, '0')}`;
}

/** On restore: the original number when it is still free, else the next one. */
export function restoredReference(original: string, originalTaken: boolean, prefix: string, latest: string | null): { reference: string; changed: boolean } {
  if (!originalTaken) return { reference: original, changed: false };
  return { reference: nextReference(prefix, latest), changed: true };
}

/** "JC-2026-000123 · Toyota Hilux KJA-219-XY · Ada Okafor" */
export function binLabel(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join(' · ').slice(0, 200);
}
