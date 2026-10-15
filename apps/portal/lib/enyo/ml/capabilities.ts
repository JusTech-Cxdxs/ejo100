/**
 * The automation ladder for Enyo's learning capabilities (docs: Enyo
 * Intelligence Architecture — "The automation ladder").
 *
 *   OFF      nothing runs
 *   SHADOW   the model runs and is measured; nobody sees it
 *   ASSIST   people see its estimate, warning or suggestion and decide
 *   PARTIAL  it may act alone inside an approved list of low-risk cases
 *   FULL     it handles the capability end to end, within hard limits
 *
 * The capabilities in this release only inform people, so they stop at
 * ASSIST: none of them saves, orders, changes a price or sends anything.
 * Pure: tested in tests/enyo-ml.test.ts.
 */
import type { MlTask } from './artifact-core';

export const LEVELS = ['OFF', 'SHADOW', 'ASSIST', 'PARTIAL', 'FULL'] as const;
export type Level = (typeof LEVELS)[number];

export type Capability = {
  key: Exclude<MlTask, 'ESTIMATE_LINES'>;
  label: string;
  /** What people see at ASSIST. */
  assist: string;
  /** Levels an administrator may choose for it. */
  levels: readonly Level[];
  /** Before anyone chooses. */
  initial: Level;
};

export const CAPABILITIES: readonly Capability[] = [
  { key: 'JOB_DURATION', label: 'Job time estimates', assist: 'Job Cards and Vehicle Services show when the vehicle is likely to be ready (a low–high range), once the estimate is approved.', levels: ['OFF', 'SHADOW', 'ASSIST'], initial: 'SHADOW' },
  { key: 'PRICE_ANOMALY', label: 'Unusual price warnings', assist: 'Estimates show a warning next to a typed-in price that is far from the usual for that work (a mistyped zero, for example). Nothing is changed.', levels: ['OFF', 'SHADOW', 'ASSIST'], initial: 'SHADOW' },
  { key: 'PARTS_DEMAND', label: 'Parts reorder suggestions', assist: 'Store staff see which parts are at or below a reorder point worked out from real use, and how many to order. They raise the order themselves.', levels: ['OFF', 'ASSIST'], initial: 'ASSIST' },
  { key: 'COMPLAINT_THEMES', label: 'Complaint themes', assist: 'Managers see what customers bring their vehicles in for most, month by month.', levels: ['OFF', 'ASSIST'], initial: 'ASSIST' },
];

export type CapabilityKey = Capability['key'];

export const capabilityOf = (key: string): Capability | undefined => CAPABILITIES.find((c) => c.key === key);

/** The stored levels (EnyoSetting.capabilityLevels), each checked against what that capability allows. */
export function readLevels(stored: unknown): Record<CapabilityKey, Level> {
  const s = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const out = {} as Record<CapabilityKey, Level>;
  for (const c of CAPABILITIES) {
    const v = s[c.key];
    out[c.key] = typeof v === 'string' && (c.levels as readonly string[]).includes(v) ? (v as Level) : c.initial;
  }
  return out;
}

/** Runs at all (measured or shown). */
export const runs = (level: Level) => level !== 'OFF';
/** Shown to people. */
export const shown = (level: Level) => level === 'ASSIST' || level === 'PARTIAL' || level === 'FULL';
