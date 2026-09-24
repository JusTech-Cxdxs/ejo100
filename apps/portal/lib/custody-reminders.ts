import { addWorkingDays } from '@/lib/utils/working-days';

/**
 * Staged, semi-automatic reminders for vehicles in custody — the same
 * behaviour as the Service Tracker: the system works out WHEN the next
 * reminder is due and which number it is; a person clicks Send. Nothing
 * is ever emailed on its own, and a reminder can't be sent early (the
 * server refuses and says when it can).
 *
 * All timing is in working days (Mon–Fri): a reminder never falls due on
 * a weekend.
 */
export type CustodyReminderKind = 'APPROVAL' | 'COLLECTION' | 'CANCELLED_COLLECTION';

export const CUSTODY_REMINDER_SCHEDULE: Record<CustodyReminderKind, { firstAfterWorkingDays: number; spacingWorkingDays: number; label: string }> = {
  // Estimate sent, customer hasn't approved/paid: first nudge after 3
  // working days (unchanged from before), then every 2.
  APPROVAL: { firstAfterWorkingDays: 3, spacingWorkingDays: 2, label: 'approval reminder' },
  // Vehicle ready, not collected: first reminder 2 working days after
  // the ready notice, then every 2.
  COLLECTION: { firstAfterWorkingDays: 2, spacingWorkingDays: 2, label: 'collection reminder' },
  // Cancelled, vehicle still here: first notice once the 7-working-day
  // grace has passed, then every 2.
  CANCELLED_COLLECTION: { firstAfterWorkingDays: 7, spacingWorkingDays: 2, label: 'collection notice' },
};

export type CustodyReminderState = {
  /** Reminders already sent. */
  sent: number;
  /** Which number the next one would be (1st, 2nd, …). */
  nextNumber: number;
  /** The next reminder can be sent now. */
  dueNow: boolean;
  /** When the next reminder becomes due (a working day). */
  dueFrom: Date;
};

export function custodyReminderState(kind: CustodyReminderKind, anchor: Date, sentAt: Date[], now: Date = new Date()): CustodyReminderState {
  const rule = CUSTODY_REMINDER_SCHEDULE[kind];
  const sorted = [...sentAt].map((d) => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
  const last = sorted[sorted.length - 1];
  const dueFrom = last ? addWorkingDays(last, rule.spacingWorkingDays) : addWorkingDays(new Date(anchor), rule.firstAfterWorkingDays);
  return { sent: sorted.length, nextNumber: sorted.length + 1, dueNow: now.getTime() >= dueFrom.getTime(), dueFrom };
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

/** "3rd approval reminder can be sent from Mon, 12 Oct" — refusal text. */
export function notDueYetMessage(kind: CustodyReminderKind, state: CustodyReminderState): string {
  const when = state.dueFrom.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
  return `The ${ordinal(state.nextNumber)} ${CUSTODY_REMINDER_SCHEDULE[kind].label} isn't due yet — it can be sent from ${when}.`;
}
