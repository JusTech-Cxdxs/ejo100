/**
 * The cut-over checklist (P9): for one branch, every file it needs from SAP
 * or the old registers, in the order they load, and where each stands —
 * worked out from the imports themselves, never typed in by hand. Pure (no
 * database), unit-tested in tests/data-exchange-cutover.test.ts; the server
 * part is lib/actions/data-exchange-cutover.ts.
 *
 * A step is done when an import of it has loaded (and, for opening stock and
 * invoice history, Finance has confirmed its totals). A step the branch has
 * nothing for is marked "not needed", with a reason, by someone who approves
 * imports there. The branch is signed off as cut over once every step is
 * done or not needed; the sign-off records the whole checklist as it stood,
 * and can be reopened with a reason. Marks and sign-offs are entries in the
 * audit trail (append-only): the latest one counts, and every earlier one
 * stays as history.
 */
import { ENTITIES, type EntityKey } from './fields';
import type { BranchType } from '../branch-types';

export type CutoverStep = {
  entity: EntityKey;
  /** Shown when the step is essential for working from day one; the others are history or extras some branches do not have. */
  essential: boolean;
  /** Why the branch needs it, in a line. */
  why: string;
};

/** The steps of each kind of branch, in the order they load (each names what the one before brought in). */
export const CUTOVER_PLAN: Partial<Record<BranchType, CutoverStep[]>> = {
  WORKSHOP: [
    { entity: 'staff', essential: true, why: 'Everyone signs in as themselves; job cards and services name their technician.' },
    { entity: 'customers', essential: true, why: 'Every vehicle, job and warranty belongs to a customer.' },
    { entity: 'vehicles', essential: true, why: 'Job cards, services, bookings and warranties are on a vehicle.' },
    { entity: 'suppliers', essential: false, why: 'Goods receipts name the supplier.' },
    { entity: 'parts', essential: true, why: 'The Store issues parts from the catalogue.' },
    { entity: 'stock', essential: true, why: 'What is on the shelves on the day, confirmed by Finance.' },
    { entity: 'invoices', essential: false, why: 'Past invoices for the customer’s history, confirmed by Finance.' },
    { entity: 'jobs', essential: false, why: 'Past job cards and services: each vehicle’s history and its next-service clock.' },
    { entity: 'openJobs', essential: true, why: 'The vehicles in the workshop on the day carry on in EJO.' },
    { entity: 'openServices', essential: true, why: 'Routine services under way, and the bookings already in the diary.' },
    { entity: 'warranties', essential: false, why: 'Warranties sold before EJO, still honoured.' },
    { entity: 'claims', essential: false, why: 'Warranty claims open on the day.' },
    { entity: 'registers', essential: false, why: 'Past production, QC and PDI register rows, for the vehicles’ history.' },
  ],
  WAREHOUSE: [
    { entity: 'staff', essential: true, why: 'Everyone signs in as themselves.' },
    { entity: 'suppliers', essential: false, why: 'Goods receipts name the supplier.' },
    { entity: 'parts', essential: true, why: 'The Store issues parts from the catalogue.' },
    { entity: 'stock', essential: true, why: 'What is on the shelves on the day, confirmed by Finance.' },
    { entity: 'invoices', essential: false, why: 'Past invoices, confirmed by Finance.' },
  ],
  ASSEMBLY_PLANT: [
    { entity: 'staff', essential: true, why: 'Inspectors, operators and deciders sign in as themselves; the kits name them.' },
    { entity: 'plantShipments', essential: true, why: 'The kits on the floor are on their shipment.' },
    { entity: 'plantVehicles', essential: true, why: 'The vehicles on the line, in audit, waiting for PDI and in the yard.' },
    { entity: 'plantKits', essential: true, why: 'The packing lists: kits to check, waiting for release, released or rejected.' },
    { entity: 'plantKitIssues', essential: false, why: 'Shortages and damage still open, so the line knows what is missing.' },
  ],
};

export const cutoverStepsFor = (type: string | null | undefined): CutoverStep[] => CUTOVER_PLAN[type as BranchType] ?? [];

/** Kinds of record that belong to the whole organisation: loaded once, counted on every branch's checklist. */
export const organisationWide = (e: EntityKey): boolean => !ENTITIES[e].branch;

export type CutoverJob = {
  id: string; number: string; entity: string; branchId: string | null; status: string; createdRows: number; updatedRows: number;
  completedAt: Date | null; signedOffAt: Date | null; createdAt: Date;
};
export type CutoverMark = { action: 'not_needed' | 'needed' | 'signed_off' | 'reopened'; entity?: string; reason?: string; at: Date; by: string };

export type StepState = 'DONE' | 'AWAITING_FINANCE' | 'AWAITING_APPROVAL' | 'IN_PROGRESS' | 'UNDONE' | 'NOT_NEEDED' | 'NOT_STARTED';
export const STEP_WORDS: Record<StepState, string> = {
  DONE: 'Loaded', AWAITING_FINANCE: 'Loaded — waiting for Finance to confirm the totals', AWAITING_APPROVAL: 'Waiting for approval',
  IN_PROGRESS: 'Being prepared', UNDONE: 'Undone — load it again', NOT_NEEDED: 'Not needed', NOT_STARTED: 'Not started',
};
const IN_PROGRESS = ['UPLOADING', 'UPLOADED', 'VALIDATING', 'VALIDATED', 'APPROVED', 'LOADING', 'PAUSED', 'UNDOING'];

export type StepView = CutoverStep & {
  state: StepState; scope: 'organisation' | 'branch';
  /** Records added and filled in by the loaded imports (not undone). */
  added: number; filled: number;
  /** The imports of this step, newest first (up to five). */
  imports: { id: string; number: string; status: string }[];
  loadedAt: Date | null;
  notNeeded: { reason: string; at: Date; by: string } | null;
  /** An earlier step this one names, not loaded yet (and not marked not needed). */
  waitingFor: EntityKey | null;
};

/** Each step's state from the imports and the marks. Pure. */
export function cutoverSteps(steps: CutoverStep[], jobs: CutoverJob[], marks: CutoverMark[]): StepView[] {
  // The latest mark for each step counts (a "needed" undoes a "not needed").
  const notNeeded = new Map<string, { reason: string; at: Date; by: string }>();
  for (const m of [...marks].sort((a, b) => +a.at - +b.at)) {
    if (!m.entity) continue;
    if (m.action === 'not_needed') notNeeded.set(m.entity, { reason: m.reason ?? '', at: m.at, by: m.by });
    if (m.action === 'needed') notNeeded.delete(m.entity);
  }
  const views: StepView[] = steps.map((s) => {
    const mine = jobs.filter((j) => j.entity === s.entity).sort((a, b) => +b.createdAt - +a.createdAt);
    const loaded = mine.filter((j) => j.status === 'COMPLETED');
    const finance = Boolean(ENTITIES[s.entity].financeSignOff);
    let state: StepState;
    if (loaded.length) state = finance && loaded.some((j) => !j.signedOffAt) ? 'AWAITING_FINANCE' : 'DONE';
    else if (mine.some((j) => j.status === 'AWAITING_APPROVAL')) state = 'AWAITING_APPROVAL';
    else if (mine.some((j) => IN_PROGRESS.includes(j.status))) state = 'IN_PROGRESS';
    else if (notNeeded.has(s.entity)) state = 'NOT_NEEDED';
    else if (mine.some((j) => j.status === 'UNDONE')) state = 'UNDONE';
    else state = 'NOT_STARTED';
    return {
      ...s, state, scope: organisationWide(s.entity) ? 'organisation' : 'branch',
      added: loaded.reduce((n, j) => n + j.createdRows, 0), filled: loaded.reduce((n, j) => n + j.updatedRows, 0),
      imports: mine.slice(0, 5).map((j) => ({ id: j.id, number: j.number, status: j.status })),
      loadedAt: loaded.reduce<Date | null>((d, j) => (j.completedAt && (!d || j.completedAt > d) ? j.completedAt : d), null),
      notNeeded: state === 'NOT_NEEDED' ? notNeeded.get(s.entity)! : null,
      waitingFor: null,
    };
  });
  // A step that names an earlier one (fields.ts `after`) waits for it, unless that one is loaded or not needed.
  const settled = (e: EntityKey) => { const v = views.find((x) => x.entity === e); return !v || v.state === 'DONE' || v.state === 'AWAITING_FINANCE' || v.state === 'NOT_NEEDED'; };
  for (const v of views) {
    const before = ENTITIES[v.entity].after;
    if (before && v.state === 'NOT_STARTED' && !settled(before)) v.waitingFor = before;
  }
  return views;
}

/** Done or not needed: what the sign-off asks of every step. Finance's confirmation counts too. */
export const stepSettled = (v: Pick<StepView, 'state'>) => v.state === 'DONE' || v.state === 'NOT_NEEDED';

export type CutoverView = {
  steps: StepView[];
  settled: number;
  total: number;
  /** The first step to do now: not settled and not waiting for another. */
  next: EntityKey | null;
  signedOff: { at: Date; by: string } | null;
  /** Why it cannot be signed off yet, in plain words (empty when it can). */
  blockers: string[];
};

export function cutoverView(steps: CutoverStep[], jobs: CutoverJob[], marks: CutoverMark[]): CutoverView {
  const views = cutoverSteps(steps, jobs, marks);
  const settled = views.filter(stepSettled).length;
  let signedOff: { at: Date; by: string } | null = null;
  for (const m of [...marks].sort((a, b) => +a.at - +b.at)) {
    if (m.action === 'signed_off') signedOff = { at: m.at, by: m.by };
    if (m.action === 'reopened') signedOff = null;
  }
  const blockers = views.filter((v) => !stepSettled(v)).map((v) => `${ENTITIES[v.entity].label}: ${STEP_WORDS[v.state].toLowerCase()}.`);
  const next = views.find((v) => !stepSettled(v) && !v.waitingFor && v.state !== 'AWAITING_APPROVAL' && v.state !== 'AWAITING_FINANCE' && v.state !== 'IN_PROGRESS')?.entity ?? null;
  return { steps: views, settled, total: views.length, next, signedOff, blockers };
}

/** The checklist as it stood, for the sign-off's record (what was loaded, how much, and what was not needed and why). */
export function cutoverSnapshot(v: CutoverView): { entity: string; state: StepState; added: number; filled: number; imports: string[]; reason?: string }[] {
  return v.steps.map((s) => ({ entity: s.entity, state: s.state, added: s.added, filled: s.filled, imports: s.imports.filter((i) => i.status === 'COMPLETED').map((i) => i.number), ...(s.notNeeded ? { reason: s.notNeeded.reason } : {}) }));
}

/** A reason a person gives: a few real words, trimmed, at most 300 characters. */
export function cleanCutoverReason(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return s.length >= 5 && /[a-z]{2}/i.test(s) ? s : null;
}
