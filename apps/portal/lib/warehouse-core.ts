/**
 * Warehouse rules without the database: the finished-unit status machine,
 * transfer rules, pick validation and serial-list parsing. Relative imports
 * only — the unit tests compile this file on its own (tests/warehouse.test.ts).
 */

// ── Finished units ────────────────────────────────────────────────────────

export type UnitStatus = 'IN_STOCK' | 'RESERVED' | 'PICKED' | 'RELEASED' | 'DISPATCHED' | 'SOLD' | 'RETURNED' | 'QUARANTINE' | 'IN_SERVICE' | 'SCRAPPED';

export const UNIT_STATUSES: UnitStatus[] = ['IN_STOCK', 'RESERVED', 'PICKED', 'RELEASED', 'DISPATCHED', 'SOLD', 'RETURNED', 'QUARANTINE', 'IN_SERVICE', 'SCRAPPED'];

/** Where a unit may go from each status. A sold unit only comes back as a return or into service. */
export const UNIT_TRANSITIONS: Record<UnitStatus, UnitStatus[]> = {
  IN_STOCK: ['RESERVED', 'PICKED', 'QUARANTINE', 'SCRAPPED', 'IN_SERVICE'],
  RESERVED: ['IN_STOCK', 'PICKED', 'QUARANTINE'],
  PICKED: ['IN_STOCK', 'RESERVED', 'RELEASED'],
  RELEASED: ['DISPATCHED', 'PICKED'],
  DISPATCHED: ['SOLD', 'RELEASED'],
  SOLD: ['RETURNED', 'IN_SERVICE'],
  RETURNED: ['QUARANTINE', 'IN_STOCK', 'SCRAPPED'],
  QUARANTINE: ['IN_STOCK', 'SCRAPPED'],
  IN_SERVICE: ['IN_STOCK', 'SOLD', 'SCRAPPED'],
  SCRAPPED: [],
};

export function canMoveUnit(from: UnitStatus, to: UnitStatus): boolean {
  return (UNIT_TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses in which a unit physically sits in a location and counts as stock on hand. */
export const ON_HAND_STATUSES: UnitStatus[] = ['IN_STOCK', 'RESERVED', 'PICKED', 'RELEASED', 'QUARANTINE'];

/** Statuses a unit can be moved between locations in (not promised to anyone, not gone). */
export const MOVABLE_STATUSES: UnitStatus[] = ['IN_STOCK', 'QUARANTINE', 'RETURNED'];

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  IN_STOCK: 'In stock',
  RESERVED: 'Reserved',
  PICKED: 'Picked',
  RELEASED: 'Released',
  DISPATCHED: 'Dispatched',
  SOLD: 'Sold',
  RETURNED: 'Returned',
  QUARANTINE: 'Quarantine',
  IN_SERVICE: 'In service',
  SCRAPPED: 'Scrapped',
};

export type ChipTone = 'brand' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export const UNIT_STATUS_TONE: Record<UnitStatus, ChipTone> = {
  IN_STOCK: 'success',
  RESERVED: 'warning',
  PICKED: 'info',
  RELEASED: 'info',
  DISPATCHED: 'info',
  SOLD: 'neutral',
  RETURNED: 'warning',
  QUARANTINE: 'warning',
  IN_SERVICE: 'info',
  SCRAPPED: 'error',
};

// ── Serial lists ──────────────────────────────────────────────────────────

/** One serial per line (commas, semicolons and spaces also separate); trimmed, de-duplicated, order kept. */
export function parseSerials(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,;\s]+/)) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** A serial on a label: letters, digits, dashes, dots and slashes; 4–64 characters. */
export function serialProblem(serial: string): string | null {
  if (serial.length < 4) return `"${serial}" is too short for a serial number.`;
  if (serial.length > 64) return `"${serial.slice(0, 20)}…" is too long for a serial number.`;
  if (!/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(serial)) return `"${serial}" has characters a serial number cannot have.`;
  return null;
}

/** How many of a purchase-order line may still be received. */
export function remainingToReceive(line: { quantity: number; receivedQuantity: number }): number {
  return Math.max(0, Math.round((line.quantity - line.receivedQuantity) * 1000) / 1000);
}

// ── Transfers ─────────────────────────────────────────────────────────────

export type TransferStatus = 'DRAFT' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';

export const TRANSFER_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  DRAFT: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
};

export function canMoveTransfer(from: TransferStatus, to: TransferStatus): boolean {
  return (TRANSFER_TRANSITIONS[from] ?? []).includes(to);
}

/** A transfer between two branches needs the Warehouse Manager's approval before it leaves. */
export function transferNeedsApproval(from: { branchId: string }, to: { branchId: string }): boolean {
  return from.branchId !== to.branchId;
}

export function transferProblem(input: { fromLocationId: string; toLocationId: string; unitIds: string[]; fromActive?: boolean; toActive?: boolean }): string | null {
  if (!input.fromLocationId || !input.toLocationId) return 'Choose where the units come from and where they are going.';
  if (input.fromLocationId === input.toLocationId) return 'The units are already there — choose a different destination.';
  if (input.unitIds.length === 0) return 'Pick at least one unit to move.';
  if (input.fromActive === false) return 'The source location has been retired.';
  if (input.toActive === false) return 'The destination location has been retired.';
  return null;
}

/** Whether a transfer can be dispatched now: a draft, and approved when it crosses branches. */
export function canDispatchTransfer(t: { status: TransferStatus; needsApproval: boolean; approved: boolean }): { ok: boolean; why?: string } {
  if (t.status !== 'DRAFT') return { ok: false, why: 'Only a draft transfer can be dispatched.' };
  if (t.needsApproval && !t.approved) return { ok: false, why: 'A transfer to another branch needs the Warehouse Manager\'s approval before it leaves.' };
  return { ok: true };
}

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = { DRAFT: 'Draft', DISPATCHED: 'On the way', RECEIVED: 'Received', CANCELLED: 'Cancelled' };

// ── Picking against a goods release note ──────────────────────────────────

export type ReleaseStatus = 'ISSUED' | 'PICKED' | 'RELEASED' | 'CANCELLED';

export const RELEASE_TRANSITIONS: Record<ReleaseStatus, ReleaseStatus[]> = {
  ISSUED: ['PICKED', 'CANCELLED'],
  PICKED: ['RELEASED', 'ISSUED', 'CANCELLED'],
  RELEASED: [],
  CANCELLED: [],
};

export const RELEASE_STATUS_LABEL: Record<ReleaseStatus, string> = { ISSUED: 'Waiting to pick', PICKED: 'Picked', RELEASED: 'Released', CANCELLED: 'Cancelled' };

export type PickLine = { id: string; productId: string; configurationId: string | null; serialised: boolean; finishedUnitId: string | null };
export type PickUnit = { id: string; productId: string; configurationId: string | null; status: UnitStatus; branchId: string; salesOrderId: string | null };

/** Why a unit cannot be picked for a line (null = it can). */
export function pickProblem(line: PickLine, unit: PickUnit, ctx: { branchId: string; salesOrderId: string }): string | null {
  if (line.finishedUnitId) return 'This line already has a unit picked — unpick it first.';
  if (!line.serialised) return 'This line is quantity-tracked; nothing to pick by serial.';
  if (unit.productId !== line.productId) return 'That unit is a different product from the one ordered.';
  if (line.configurationId && unit.configurationId && unit.configurationId !== line.configurationId) return 'That unit is a different configuration from the one ordered.';
  if (unit.branchId !== ctx.branchId) return 'That unit is held at another branch.';
  if (unit.status === 'RESERVED') return unit.salesOrderId === ctx.salesOrderId ? null : 'That unit is reserved for another order.';
  if (unit.status !== 'IN_STOCK') return `That unit is ${UNIT_STATUS_LABEL[unit.status].toLowerCase()}, not in stock.`;
  return null;
}

/** Lines that still need a serial picked (quantity-tracked lines never do). */
export function linesLeftToPick(lines: PickLine[]): number {
  return lines.filter((l) => l.serialised && !l.finishedUnitId).length;
}

export function releaseReadyToRelease(lines: PickLine[]): boolean {
  return lines.length > 0 && linesLeftToPick(lines) === 0;
}

// ── Dispatch and delivery ─────────────────────────────────────────────────

export type DispatchStatus = 'DISPATCHED' | 'DELIVERED' | 'FAILED';

export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = { DISPATCHED: 'On the road', DELIVERED: 'Delivered', FAILED: 'Not delivered' };

export function dispatchProblem(input: { releaseStatus: ReleaseStatus; hasDispatch: boolean; driverName: string; vehiclePlate: string; carrier: string }): string | null {
  if (input.hasDispatch) return 'This release note has already been dispatched.';
  if (input.releaseStatus !== 'RELEASED') return 'Only released goods can be dispatched — release the note first.';
  if (!input.driverName.trim() && !input.carrier.trim()) return 'Name the driver or the carrier taking the goods.';
  if (input.driverName.trim() && !input.vehiclePlate.trim() && !input.carrier.trim()) return 'Enter the vehicle plate the driver is using.';
  return null;
}

// ── Incoming QC ───────────────────────────────────────────────────────────

export function inspectionProblem(input: { sampleSize: number; defects: number }): string | null {
  if (!Number.isInteger(input.sampleSize) || input.sampleSize < 1) return 'Enter how many items were sampled (at least 1).';
  if (!Number.isInteger(input.defects) || input.defects < 0) return 'Defects must be a whole number.';
  if (input.defects > input.sampleSize) return 'There cannot be more defects than items sampled.';
  return null;
}

/** Defect rate as a percentage, one decimal. */
export function defectRate(sampleSize: number, defects: number): number {
  if (sampleSize <= 0) return 0;
  return Math.round((defects / sampleSize) * 1000) / 10;
}

// ── Stock summaries ───────────────────────────────────────────────────────

/** Units in stock, grouped by a key (product family, location …), sorted by count. */
export function tally<T extends string>(items: { key: T; count?: number }[]): { key: T; count: number }[] {
  const m = new Map<T, number>();
  for (const i of items) m.set(i.key, (m.get(i.key) ?? 0) + (i.count ?? 1));
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

export const FG_LOCATION_KINDS = ['WAREHOUSE', 'SHOWROOM', 'CONSIGNMENT', 'TRANSIT', 'SERVICE', 'QUARANTINE'] as const;
export type FgLocationKind = (typeof FG_LOCATION_KINDS)[number];
export const FG_LOCATION_KIND_LABEL: Record<FgLocationKind, string> = {
  WAREHOUSE: 'Warehouse', SHOWROOM: 'Showroom', CONSIGNMENT: 'Consignment (partner)', TRANSIT: 'In transit', SERVICE: 'Service centre', QUARANTINE: 'Quarantine',
};
