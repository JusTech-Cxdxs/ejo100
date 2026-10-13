/**
 * Constants shared by Workshop pages and server actions. Not a 'use server'
 * file: those may only export async functions, so plain data lives here.
 */

/** Suggestions for the estimate line description (a <datalist>; free text
 * is always allowed). One list for every line type. The Labour entries
 * follow the workshop's paper estimate ("Labour for Service", "Labour for
 * Brake" as separate lines). */
export const COMMON_ESTIMATE_LINE_DESCRIPTIONS = [
  'Wheel Alignment',
  'Wheel Balancing',
  'Body Job',
  'Painting',
  'Gas / AC Refill',
  'Engine Overhauling',
  'Battery Charging',
  'Injector Servicing (Diesel)',
  'Labour for Service',
  'Labour for Brake',
];

/** Minimum deposit before work begins, as a fraction of the estimate total.
 * One constant so emails and dashboards always agree. */
export const MINIMUM_DEPOSIT_FRACTION = 0.7;

/** Working days after the customer is notified of an approved estimate
 * before it is overdue (enough time for a bank transfer to clear). A
 * reminder goes out partway through; see APPROVAL_REMINDER_WORKING_DAYS. */
export const APPROVAL_DEADLINE_WORKING_DAYS = 5;

/** Working days after notification before the "action required" reminder. */
export const APPROVAL_REMINDER_WORKING_DAYS = 3;

/** Working days after a cancellation is approved before an uncollected
 * vehicle is flagged for staff review. Not automatic: a Manager or HOD
 * decides whether to notify the customer. */
export const CANCELLED_COLLECTION_GRACE_WORKING_DAYS = 7;

/** Working days a finished vehicle can wait after Ready for Collection
 * before charges may apply. Separate from
 * CANCELLED_COLLECTION_GRACE_WORKING_DAYS so the two can differ later. */
export const READY_FOR_COLLECTION_GRACE_WORKING_DAYS = 7;
