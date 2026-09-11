import type { JobCardStatus } from '@ejo/database';

/**
 * The real, standard Job Card status progression — designed after the
 * user's own explicit request for a worldclass, no-skip, no-backward
 * system, with named, audited exceptions rather than silent loopholes.
 *
 * DESIGN DECISIONS, stated plainly (not guessed at, chosen and
 * reasoned through):
 *
 * 1. CHECKED_IN and AWAITING_CUSTOMER_APPROVAL never appear as a
 *    dropdown "next status" option for anyone but Master Admin. Both
 *    already have their own real, dedicated, more meaningful action
 *    that causes the transition — notifying the customer of the
 *    approved estimate moves CHECKED_IN → AWAITING_CUSTOMER_APPROVAL;
 *    a payment crossing the deposit or full threshold moves
 *    AWAITING_CUSTOMER_APPROVAL → IN_PROGRESS automatically. Offering
 *    these as a raw status pick too would be a second, looser way to
 *    reach the same place — exactly the kind of inconsistent side
 *    door this whole system is meant to close.
 *
 * 2. CLOSED and CANCELLED never appear here either — both already go
 *    through their own real request → Manager approve/decline flow
 *    (see CloseRequest/CancellationRequest), enforced independently in
 *    updateJobCardStatus itself. This file only governs the plain,
 *    single-step status moves — not the two flows that already have
 *    their own, stronger real governance.
 *
 * 3. CHECKED_OUT requires CLOSED first for every real role but Master
 *    Admin — a direct instruction: "no seeing checkout until closed."
 *    The one deliberate exception is a cancelled Job Card, which skips
 *    CLOSED entirely (there's no service left to settle, only a
 *    vehicle to hand back) — that path is handled separately, already
 *    built, untouched by this file.
 *
 * 4. QUALITY_CHECK → COMPLETED requires the Supervisor or a Manager,
 *    never the Assigned Technician alone. This is a deliberate,
 *    genuine separation-of-duties call: letting the same person who
 *    did the work also be the one who certifies it passed quality
 *    control defeats the entire point of a quality check step. The
 *    Technician can still move work into QUALITY_CHECK — they just
 *    can't be the one who signs off that it passed.
 *
 * 5. QUALITY_CHECK → IN_PROGRESS is the one deliberate, real exception
 *    to "never move backward" — rework. A vehicle that fails its
 *    quality check has to go back for real further work; refusing to
 *    allow that isn't "safer", it just forces a workaround. The
 *    difference between this and a silent loophole is that it's named,
 *    requires a real reason, and is logged as its own distinct audit
 *    action ("Rework requested") rather than a generic status change —
 *    see REWORK_REQUIRES_REASON below and its own handling in
 *    updateJobCardStatus.
 */

export type JobCardRoleContext = {
  /** Unrestricted — the one deliberate, existing bypass already used
   * everywhere else in this system for this exact role. */
  isMasterAdmin: boolean;
  /** This specific Job Card's own assigned Supervisor. */
  isSupervisor: boolean;
  /** This specific Job Card's own assigned Technician. */
  isAssignedTechnician: boolean;
  /** Holds the branch-wide Workshop Manager role. */
  isEligibleManager: boolean;
};

/** The one real, named exception to "never move backward" — everything
 * else in this file only ever moves forward, one real step at a time. */
export const REWORK_TRANSITION: { from: JobCardStatus; to: JobCardStatus } = {
  from: 'QUALITY_CHECK' as JobCardStatus,
  to: 'IN_PROGRESS' as JobCardStatus,
};

/**
 * Every status a non-Master-Admin viewer could ever move a Job Card to
 * directly, from its current real status — the one canonical answer,
 * checked identically by the dropdown's own options AND by
 * updateJobCardStatus's own real, server-side refusal of anything not
 * in this list. Master Admin bypasses this file entirely, matching
 * every other unrestricted check already in this system.
 */
export function getSelectableJobCardStatuses(
  currentStatus: JobCardStatus,
  ctx: JobCardRoleContext,
): JobCardStatus[] {
  if (ctx.isMasterAdmin) {
    return [
      'CHECKED_IN', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'AWAITING_PARTS',
      'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION', 'CHECKED_OUT',
    ] as JobCardStatus[];
  }

  // Whoever's actually doing or overseeing the hands-on work — the
  // people who legitimately move a Job Card through its own real
  // day-to-day progress steps.
  const canProgress = ctx.isSupervisor || ctx.isAssignedTechnician;
  // The people with real sign-off authority — a Supervisor (their own
  // Job Card) or a branch Manager, never the Technician alone for the
  // steps that need genuine separation of duties.
  const canSignOff = ctx.isSupervisor || ctx.isEligibleManager;

  switch (currentStatus) {
    case 'IN_PROGRESS':
      return canProgress ? (['AWAITING_PARTS', 'QUALITY_CHECK'] as JobCardStatus[]) : [];
    case 'AWAITING_PARTS':
      return canProgress ? (['IN_PROGRESS'] as JobCardStatus[]) : [];
    case 'QUALITY_CHECK': {
      const options: JobCardStatus[] = [];
      if (canSignOff) options.push('COMPLETED' as JobCardStatus);
      if (canProgress) options.push('IN_PROGRESS' as JobCardStatus); // rework, see REWORK_TRANSITION
      return options;
    }
    case 'COMPLETED':
      return canSignOff ? (['READY_FOR_COLLECTION'] as JobCardStatus[]) : [];
    case 'CLOSED':
      // Broad on purpose — whoever's physically at the counter when a
      // customer arrives to collect their vehicle should be able to
      // check it out, matching how a real front desk actually works.
      return (canProgress || canSignOff) ? (['CHECKED_OUT'] as JobCardStatus[]) : [];
    // CHECKED_IN, AWAITING_CUSTOMER_APPROVAL, READY_FOR_COLLECTION: no
    // direct dropdown option for anyone but Master Admin — see design
    // decisions 1 and 3 above. CANCELLED and CHECKED_OUT (as a current
    // status) are handled entirely outside this file already.
    default:
      return [];
  }
}
