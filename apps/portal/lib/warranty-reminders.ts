import { onOrAfterWorkingDay } from '@/lib/utils/working-days';

/**
 * Warranty expiry reminders — semi-automatic like every EJO 100 reminder:
 * the system works out WHEN each is due; a person clicks Send.
 *   1st — 90 days before the warranty ends
 *   2nd — 30 days before
 *   3rd — 7 days before (final)
 * Each window opens on a working day (a weekend rolls to Monday). Only
 * the latest open reminder is offered (a missed 90-day one is not sent
 * late once the 30-day window has opened), each stage at most once, and
 * nothing once the warranty has ended or isn't active.
 */
export const EXPIRY_REMINDER_STAGES = [
  { stage: 1, daysBefore: 90, label: '90 days before expiry' },
  { stage: 2, daysBefore: 30, label: '30 days before expiry' },
  { stage: 3, daysBefore: 7, label: '7 days before expiry (final)' },
] as const;

export type ExpiryReminderState = {
  /** Stage that can be sent now, or null. */
  dueStage: 1 | 2 | 3 | null;
  /** When the next stage opens (a working day), if any. */
  nextStage: 1 | 2 | 3 | null;
  nextDueFrom: Date | null;
  sentStages: number[];
};

export function expiryReminderState(endsAt: Date, sentStages: number[], isCovering: boolean, now: Date = new Date()): ExpiryReminderState {
  const sent = [...new Set(sentStages)].sort();
  const end = new Date(endsAt);
  if (!isCovering || now.getTime() >= end.getTime()) return { dueStage: null, nextStage: null, nextDueFrom: null, sentStages: sent };
  const windows = EXPIRY_REMINDER_STAGES.map((s) => ({ ...s, opens: onOrAfterWorkingDay(new Date(end.getTime() - s.daysBefore * 86400000)) }));
  const open = windows.filter((w) => now.getTime() >= w.opens.getTime());
  const latest = open[open.length - 1];
  const highestSent = sent.length ? Math.max(...sent) : 0;
  const dueStage = latest && !sent.includes(latest.stage) && latest.stage > highestSent ? (latest.stage as 1 | 2 | 3) : null;
  const upcoming = windows.find((w) => w.opens.getTime() > now.getTime());
  return {
    dueStage,
    nextStage: upcoming ? (upcoming.stage as 1 | 2 | 3) : null,
    nextDueFrom: upcoming ? upcoming.opens : null,
    sentStages: sent,
  };
}
