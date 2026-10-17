import type { JobCardStatus } from '@ejo/database';

/**
 * Which status a Job Card may move to next, for everyone except Master
 * Admin. Forward only, one step at a time, with rework as the one named
 * exception.
 *
 * 1. CHECKED_IN and AWAITING_CUSTOMER_APPROVAL are never offered: notifying
 *    the customer of the approved estimate moves CHECKED_IN →
 *    AWAITING_CUSTOMER_APPROVAL, and the deposit payment moves it on to
 *    IN_PROGRESS.
 * 2. CLOSED and CANCELLED are never offered: both go through a request that
 *    a Manager approves (CloseRequest / CancellationRequest), enforced in
 *    updateJobCardStatus.
 * 3. CHECKED_OUT requires CLOSED first. A cancelled Job Card skips CLOSED;
 *    that hand-back is handled outside this file.
 * 4. QUALITY_CHECK → COMPLETED needs the supervisor or a Manager, never the
 *    assigned technician alone (separation of duties). The technician can
 *    still move work into QUALITY_CHECK.
 * 5. Rework (back to IN_PROGRESS) needs a reason and is audited as its own
 *    action ("Rework requested"); see REWORK_FROM_STATUSES.
 */

export type JobCardRoleContext = {
  /** Unrestricted (bypasses this file). */
  isMasterAdmin: boolean;
  /** This Job Card's assigned supervisor. */
  isSupervisor: boolean;
  /** This Job Card's assigned technician. */
  isAssignedTechnician: boolean;
  /** Holds the branch-wide Manager role. */
  isEligibleManager: boolean;
};

/** Rework: the one allowed backward move. */
export const REWORK_TRANSITION: { from: JobCardStatus; to: JobCardStatus } = {
  from: 'QUALITY_CHECK' as JobCardStatus,
  to: 'IN_PROGRESS' as JobCardStatus,
};

/**
 * Every status rework can start from. Beyond a failed quality check, a
 * vehicle can fail its road test after sign-off — at COMPLETED, or even
 * at READY_FOR_COLLECTION before the customer takes it. It goes back to
 * IN_PROGRESS with a required reason, logged as "Sent back for rework".
 * Never from CLOSED or later: once closed (settled) or checked out, a
 * problem is a new visit (a comeback), not rework of this one.
 */
export const REWORK_FROM_STATUSES = ['QUALITY_CHECK', 'COMPLETED', 'READY_FOR_COLLECTION'] as const;

export function isReworkTransition(from: string, to: string): boolean {
  return to === 'IN_PROGRESS' && (REWORK_FROM_STATUSES as readonly string[]).includes(from);
}

/**
 * Statuses a non-Master-Admin viewer may move this Job Card to directly.
 * Used for the dropdown options and by updateJobCardStatus to refuse
 * anything else server-side. Master Admin bypasses it.
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

  // The people doing or overseeing the work move it through day-to-day steps.
  const canProgress = ctx.isSupervisor || ctx.isAssignedTechnician;
  // Sign-off authority: the supervisor (own Job Card) or a branch Manager,
  // never the technician alone.
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
      // On to collection, or back for rework (e.g. failed road test), by whoever
      // holds sign-off authority, since rework revokes their sign-off.
      return canSignOff ? (['READY_FOR_COLLECTION', 'IN_PROGRESS'] as JobCardStatus[]) : [];
    case 'READY_FOR_COLLECTION':
      // Onward only via the close request (Manager-approved); the one
      // direct move is rework before the customer takes the vehicle.
      return canSignOff ? (['IN_PROGRESS'] as JobCardStatus[]) : [];
    case 'CLOSED':
      // Broad on purpose: whoever is at the counter when the customer arrives
      // can check the vehicle out.
      return (canProgress || canSignOff) ? (['CHECKED_OUT'] as JobCardStatus[]) : [];
    // CHECKED_IN, AWAITING_CUSTOMER_APPROVAL: no direct option (see 1 above).
    // CANCELLED and CHECKED_OUT are handled outside this file.
    default:
      return [];
  }
}
