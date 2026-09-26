/**
 * Claim readiness — does this claim have what a provider needs to accept
 * it? One shared rule for the claim page, the submit action and the claim
 * pack. BLOCKING items stop the claim being sent for approval; WARNINGS
 * are allowed but flagged (a late claim is usually rejected).
 */
export type ReadinessItem = { key: string; label: string; ok: boolean; blocking: boolean; hint?: string };
export type Readiness = { items: ReadinessItem[]; blockers: number; warnings: number; score: number; ready: boolean };

export const MIN_3C_LENGTH = 15;
export const DEADLINE_WARNING_DAYS = 5;

function fmt(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
}

export function claimReadiness(
  claim: {
    complaint: string;
    cause: string;
    correction: string;
    causalPart: string;
    causalPartNumber: string | null;
    failureDate: Date;
    failureReading: number | null;
    labourAmount: number;
    partsAmount: number;
    otherAmount: number;
    deadlineAt: Date | null;
    jobCardId: string | null;
    vehicleServiceId: string | null;
  },
  warranty: { status: string; startsAt: Date; endsAt: Date; startReading: number | null; distanceLimit: number | null; isSamplePolicy: boolean },
  now: Date = new Date(),
): Readiness {
  const items: ReadinessItem[] = [];
  const add = (key: string, label: string, ok: boolean, blocking: boolean, hint?: string) => items.push({ key, label, ok, blocking, hint });
  const long = (t: string) => t.trim().length >= MIN_3C_LENGTH;

  add('complaint', 'Complaint — what the customer reported', long(claim.complaint), true, `Describe it in at least ${MIN_3C_LENGTH} characters.`);
  add('cause', 'Cause — what the technician found (root cause)', long(claim.cause), true, `Describe the diagnosis in at least ${MIN_3C_LENGTH} characters.`);
  add('correction', 'Correction — what was done to fix it', long(claim.correction), true, `Describe the repair in at least ${MIN_3C_LENGTH} characters.`);
  add('causalPart', 'Causal part identified', claim.causalPart.trim().length > 0, true, 'Name the part that caused the failure.');
  add('causalPartNumber', 'Causal part number', Boolean(claim.causalPartNumber?.trim()), false, 'Providers usually expect the part number.');

  const failure = new Date(claim.failureDate);
  add('failureDate', 'Failure date is not in the future', failure.getTime() <= now.getTime(), true);
  const statusOk = warranty.status === 'ACTIVE';
  add('warrantyActive', 'Warranty is active (verified, not suspended or void)', statusOk, true, `Warranty status: ${warranty.status.replace(/_/g, ' ').toLowerCase()}.`);
  const inDates = failure.getTime() >= new Date(warranty.startsAt).getTime() && failure.getTime() <= new Date(warranty.endsAt).getTime();
  add('withinDates', 'Failure happened inside the warranty period', inDates, true, `Covered ${fmt(new Date(warranty.startsAt))} – ${fmt(new Date(warranty.endsAt))}.`);
  const distanceEnd = warranty.startReading !== null && warranty.distanceLimit !== null ? warranty.startReading + warranty.distanceLimit : null;
  if (distanceEnd !== null) {
    add('readingRecorded', 'Odometer at failure recorded', claim.failureReading !== null, true, 'The warranty has a km limit, so the failure reading is required.');
    if (claim.failureReading !== null) {
      add('withinDistance', 'Failure happened inside the km limit', claim.failureReading <= distanceEnd, true, `Limit: ${distanceEnd.toLocaleString('en-NG')} km.`);
      add('readingSane', 'Odometer at failure is not below the reading at warranty start', warranty.startReading === null || claim.failureReading >= warranty.startReading, true);
    }
  } else {
    add('readingRecorded', 'Odometer at failure recorded', claim.failureReading !== null, false, 'Recommended even without a km limit.');
  }
  const amounts = [claim.labourAmount, claim.partsAmount, claim.otherAmount];
  add('amountsValid', 'Amounts are not negative', amounts.every((a) => Number.isFinite(a) && a >= 0), true);
  add('amountClaimed', 'An amount is being claimed', amounts.reduce((s, a) => s + (a > 0 ? a : 0), 0) > 0, true);
  add('linked', 'Linked to the Job Card / Vehicle Service that did the repair', Boolean(claim.jobCardId || claim.vehicleServiceId), false, 'The repair record is the claim’s evidence.');
  if (claim.deadlineAt) {
    const deadline = new Date(claim.deadlineAt);
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
    add('deadline', daysLeft < 0 ? `Submission deadline passed on ${fmt(deadline)} — expect rejection` : daysLeft <= DEADLINE_WARNING_DAYS ? `Submission deadline is close — ${fmt(deadline)}` : `Within the submission deadline (${fmt(deadline)})`, daysLeft > DEADLINE_WARNING_DAYS, false);
  }
  add('realTerms', 'Warranty uses real (not sample) terms', !warranty.isSamplePolicy, false, 'Sample terms are for demonstration only.');

  const blockers = items.filter((i) => !i.ok && i.blocking).length;
  const warnings = items.filter((i) => !i.ok && !i.blocking).length;
  const score = Math.round((items.filter((i) => i.ok).length / items.length) * 100);
  return { items, blockers, warnings, score, ready: blockers === 0 };
}
