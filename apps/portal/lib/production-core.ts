/**
 * Production rules that need no database: the build-order and unit stage
 * machines, checklist evaluation, material availability against the BOM,
 * and the family → serial code table. Relative imports only (unit-tested
 * without Prisma).
 */
import type { ProductFamilyCode } from './catalogue-core';

// ── Build orders ───────────────────────────────────────────────────────────

export type BuildOrderStatusCode = 'PLANNED' | 'MATERIALS_CHECKED' | 'RELEASED' | 'IN_PROGRESS' | 'QA' | 'ON_HOLD' | 'COMPLETED' | 'CLOSED' | 'CANCELLED';

export const BUILD_STATUS_LABEL: Record<BuildOrderStatusCode, string> = {
  PLANNED: 'Planned', MATERIALS_CHECKED: 'Materials checked', RELEASED: 'Released to the line', IN_PROGRESS: 'In progress', QA: 'At QA',
  ON_HOLD: 'On hold', COMPLETED: 'Completed', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};

/** Where a build order may go from each status. */
export const BUILD_ORDER_TRANSITIONS: Record<BuildOrderStatusCode, BuildOrderStatusCode[]> = {
  PLANNED: ['MATERIALS_CHECKED', 'CANCELLED'],
  MATERIALS_CHECKED: ['MATERIALS_CHECKED', 'RELEASED', 'CANCELLED'],
  RELEASED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['QA', 'ON_HOLD', 'COMPLETED'],
  QA: ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED'],
  ON_HOLD: ['RELEASED', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canMoveBuildOrder(from: BuildOrderStatusCode, to: BuildOrderStatusCode): boolean {
  return (BUILD_ORDER_TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses in which the line may still start units. */
export const BUILD_OPEN_FOR_UNITS: BuildOrderStatusCode[] = ['RELEASED', 'IN_PROGRESS', 'QA'];
/** Statuses in which the parts warehouse may issue materials. */
export const BUILD_OPEN_FOR_ISSUE: BuildOrderStatusCode[] = ['RELEASED', 'IN_PROGRESS', 'QA'];
export const BUILD_FINAL: BuildOrderStatusCode[] = ['CLOSED', 'CANCELLED'];

// ── Units ──────────────────────────────────────────────────────────────────

export type UnitStageCode = 'ASSEMBLY' | 'SOFTWARE' | 'LINE_CHECK' | 'QA' | 'REWORK' | 'PACKING' | 'RELEASED' | 'SCRAPPED';

export const UNIT_STAGE_LABEL: Record<UnitStageCode, string> = {
  ASSEMBLY: 'Assembly', SOFTWARE: 'Software', LINE_CHECK: 'Line check', QA: 'QA test', REWORK: 'Rework', PACKING: 'Packing', RELEASED: 'Released to store', SCRAPPED: 'Scrapped',
};

/** The stations in order, for the traveller's stage strip. */
export const UNIT_STAGE_ORDER: UnitStageCode[] = ['ASSEMBLY', 'SOFTWARE', 'LINE_CHECK', 'QA', 'PACKING', 'RELEASED'];

export const UNIT_STAGE_TRANSITIONS: Record<UnitStageCode, UnitStageCode[]> = {
  ASSEMBLY: ['SOFTWARE', 'SCRAPPED'],
  SOFTWARE: ['LINE_CHECK', 'SCRAPPED'],
  LINE_CHECK: ['QA', 'REWORK', 'SCRAPPED'],
  QA: ['PACKING', 'REWORK', 'SCRAPPED'],
  REWORK: ['LINE_CHECK', 'SCRAPPED'],
  PACKING: ['RELEASED', 'SCRAPPED'],
  RELEASED: [],
  SCRAPPED: [],
};

export function canMoveUnit(from: UnitStageCode, to: UnitStageCode): boolean {
  return (UNIT_STAGE_TRANSITIONS[from] ?? []).includes(to);
}

/** A unit still on the line (not yet in the store, not scrapped). */
export const UNIT_ON_LINE: UnitStageCode[] = ['ASSEMBLY', 'SOFTWARE', 'LINE_CHECK', 'QA', 'REWORK', 'PACKING'];

/** How many times a unit may be sent to rework before the Production Manager must approve the next attempt. */
export const REWORK_APPROVAL_THRESHOLD = 2;

export function reworkNeedsApproval(reworkCount: number): boolean {
  return reworkCount >= REWORK_APPROVAL_THRESHOLD;
}

// ── Checklists ─────────────────────────────────────────────────────────────

export type CheckResultCode = 'PASS' | 'FAIL' | 'NA';
export type ChecklistAnswer = { item: string; result: CheckResultCode; note?: string | null };

/**
 * One submit of a checklist: every PASS → the unit passes; any FAIL → it
 * fails (and the failed items are the rework note); NA items are ignored.
 */
export function evaluateChecklist(answers: ChecklistAnswer[]): { passed: boolean; failed: string[]; passes: number; notApplicable: number } {
  const failed = answers.filter((a) => a.result === 'FAIL').map((a) => a.item);
  const passes = answers.filter((a) => a.result === 'PASS').length;
  const notApplicable = answers.filter((a) => a.result === 'NA').length;
  return { passed: failed.length === 0, failed, passes, notApplicable };
}

/** Answers typed on a form (item → PASS/FAIL/NA) against the template's items; an unanswered item is refused. */
export function checklistFromForm(items: string[], answers: Record<string, string | undefined>, notes: Record<string, string | undefined> = {}): { ok: true; answers: ChecklistAnswer[] } | { ok: false; missing: string[] } {
  const out: ChecklistAnswer[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const r = (answers[item] ?? '').toUpperCase();
    if (r !== 'PASS' && r !== 'FAIL' && r !== 'NA') { missing.push(item); continue; }
    const note = (notes[item] ?? '').trim();
    out.push({ item, result: r, note: note ? note.slice(0, 300) : null });
  }
  return missing.length ? { ok: false, missing } : { ok: true, answers: out };
}

// ── Materials ──────────────────────────────────────────────────────────────

export type BomNeed = { partId: string; name: string; perUnit: number; isOptional: boolean; available: number; issued: number };
export type MaterialLine = BomNeed & { required: number; outstanding: number; shortage: number };

/**
 * BOM × quantity against what the parts warehouse has (on hand minus
 * reserved), net of what was already issued to this build order. Optional
 * lines are shown but never block a release.
 */
export function materialAvailability(lines: BomNeed[], quantity: number): { lines: MaterialLine[]; shortages: MaterialLine[]; ok: boolean; note: string | null } {
  const qty = Math.max(0, Math.floor(quantity));
  const out: MaterialLine[] = lines.map((l) => {
    const required = round3(l.perUnit * qty);
    const outstanding = Math.max(0, round3(required - l.issued));
    const shortage = Math.max(0, round3(outstanding - Math.max(0, l.available)));
    return { ...l, required, outstanding, shortage };
  });
  const shortages = out.filter((l) => l.shortage > 0 && !l.isOptional);
  const note = shortages.length ? shortages.map((s) => `${s.name}: short ${trim3(s.shortage)} (need ${trim3(s.outstanding)}, available ${trim3(Math.max(0, s.available))})`).join('; ') : null;
  return { lines: out, shortages, ok: shortages.length === 0, note };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const trim3 = (n: number) => String(round3(n));

// ── Serial numbers ─────────────────────────────────────────────────────────

/** The two-letter family code inside a Zinox serial (ZNX26LT0000123). */
export const FAMILY_SERIAL_CODE: Record<ProductFamilyCode, string> = {
  LAPTOP: 'LT', DESKTOP: 'DT', ALL_IN_ONE: 'AI', TABLET: 'TB', MONITOR: 'MN', SMART_BOARD: 'SB', SERVER: 'SV',
  INVERTER: 'IV', BATTERY: 'BT', SOLAR_PANEL: 'SP', SOLAR_KIT: 'SK',
  GENERATOR: 'GN', TELEVISION: 'TV', FAN: 'FN', STABILISER: 'ST', AIR_CONDITIONER: 'AC', REFRIGERATOR: 'RF', MICROWAVE: 'MW',
  ACCESSORY: 'AX', OTHER: 'OT',
};

export function familySerialCode(family: string): string {
  return FAMILY_SERIAL_CODE[family as ProductFamilyCode] ?? 'OT';
}

// ── Figures ────────────────────────────────────────────────────────────────

/** QA pass rate over a set of QA results (null when nothing was tested). */
export function qaPassRate(results: (boolean | null | undefined)[]): number | null {
  const tested = results.filter((r): r is boolean => typeof r === 'boolean');
  if (tested.length === 0) return null;
  return Math.round((tested.filter(Boolean).length / tested.length) * 1000) / 10;
}
