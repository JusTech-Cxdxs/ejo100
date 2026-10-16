/**
 * Customer-friendly words for every workshop status — what it means for
 * the customer, in plain, reassuring English. Pure (no database), shared by
 * every customer portal page so a status always reads the same way.
 */

export type Tone = 'info' | 'progress' | 'attention' | 'success' | 'neutral' | 'danger';

export type StatusInfo = { label: string; explain: string; tone: Tone };

export const JOB_CARD_STATUS: Record<string, StatusInfo> = {
  CHECKED_IN: { label: 'Checked in', tone: 'info', explain: 'Your vehicle is with us. Our team is inspecting it and preparing your estimate.' },
  AWAITING_CUSTOMER_APPROVAL: { label: 'Waiting for your approval', tone: 'attention', explain: 'Your estimate is ready. Paying the minimum deposit approves the work so we can start.' },
  IN_PROGRESS: { label: 'Work in progress', tone: 'progress', explain: 'Our technicians are working on your vehicle right now.' },
  AWAITING_PARTS: { label: 'Waiting for parts', tone: 'progress', explain: 'We’re waiting for a part to arrive. Work carries on the moment it’s here — nothing is needed from you.' },
  QUALITY_CHECK: { label: 'Final checks', tone: 'progress', explain: 'The work is done and we’re checking everything carefully before handing it back.' },
  COMPLETED: { label: 'Work completed', tone: 'success', explain: 'All the work is finished. We’ll let you know as soon as it’s ready to collect.' },
  READY_FOR_COLLECTION: { label: 'Ready for collection', tone: 'success', explain: 'Your vehicle is ready. Settle any balance and come and pick it up.' },
  CLOSED: { label: 'Signed off', tone: 'success', explain: 'Everything is settled and signed off. Your vehicle is ready to leave with you.' },
  CHECKED_OUT: { label: 'Collected', tone: 'neutral', explain: 'Your vehicle has left the workshop. Thank you for choosing us!' },
  CANCELLED: { label: 'Cancelled', tone: 'danger', explain: 'This Job Card was cancelled. If you paid anything, our team will talk to you about a refund.' },
};

export const SERVICE_STATUS: Record<string, StatusInfo> = {
  SCHEDULED: { label: 'Booked', tone: 'info', explain: 'Your service is booked. We look forward to seeing you and your vehicle.' },
  CHECKED_IN: { label: 'Checked in', tone: 'info', explain: 'Your vehicle is with us and is being prepared for its service.' },
  IN_SERVICE: { label: 'Being serviced', tone: 'progress', explain: 'Our technicians are servicing your vehicle right now.' },
  COMPLETED: { label: 'Service completed', tone: 'success', explain: 'The service is finished. We’ll let you know as soon as it’s ready to collect.' },
  READY_FOR_COLLECTION: { label: 'Ready for collection', tone: 'success', explain: 'Your vehicle is ready. Settle any balance and come and pick it up.' },
  CLOSED: { label: 'Signed off', tone: 'success', explain: 'Everything is settled and signed off. Your vehicle is ready to leave with you.' },
  COLLECTED: { label: 'Collected', tone: 'neutral', explain: 'Your vehicle has left the workshop. Thank you for choosing us!' },
  CANCELLED: { label: 'Cancelled', tone: 'danger', explain: 'This service was cancelled. If you paid anything, our team will talk to you about a refund.' },
  ESCALATED: { label: 'Moved to a Job Card', tone: 'info', explain: 'We found something that needs a fuller repair, so this visit continues as a Job Card.' },
};

export function jobCardStatus(s: string): StatusInfo {
  return JOB_CARD_STATUS[s] ?? { label: titleCase(s), tone: 'neutral', explain: '' };
}
export function serviceStatus(s: string): StatusInfo {
  return SERVICE_STATUS[s] ?? { label: titleCase(s), tone: 'neutral', explain: '' };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Which stage of the journey a record is in. */
export type Phase = 'active' | 'completed' | 'cancelled';

export function jobCardPhase(status: string): Phase {
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'CHECKED_OUT') return 'completed';
  return 'active';
}
export function servicePhase(status: string): Phase {
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'COLLECTED' || status === 'ESCALATED') return 'completed';
  return 'active';
}

/** The progress stepper — the steps every Job Card / service goes through. */
export const JOB_CARD_STEPS = ['Checked in', 'Approval', 'Repair', 'Final checks', 'Ready', 'Collected'] as const;
export const SERVICE_STEPS = ['Booked', 'Checked in', 'Servicing', 'Ready', 'Collected'] as const;

/** Index of the current step (all earlier steps are done). -1 = cancelled. */
export function jobCardStep(status: string): number {
  switch (status) {
    case 'CHECKED_IN': return 0;
    case 'AWAITING_CUSTOMER_APPROVAL': return 1;
    case 'IN_PROGRESS':
    case 'AWAITING_PARTS': return 2;
    case 'QUALITY_CHECK': return 3;
    case 'COMPLETED':
    case 'READY_FOR_COLLECTION':
    case 'CLOSED': return 4;
    case 'CHECKED_OUT': return 6; // every step done
    default: return -1;
  }
}
export function serviceStep(status: string): number {
  switch (status) {
    case 'SCHEDULED': return 0;
    case 'CHECKED_IN': return 1;
    case 'IN_SERVICE': return 2;
    case 'COMPLETED':
    case 'READY_FOR_COLLECTION':
    case 'CLOSED': return 3;
    case 'COLLECTED':
    case 'ESCALATED': return 5;
    default: return -1;
  }
}

/** Tone → badge classes (semantic colours; blue only for neutral information). */
export const TONE_BADGE: Record<Tone, string> = {
  info: 'bg-[var(--ejo-info)]/10 text-[var(--ejo-info)] ring-[var(--ejo-info)]/20',
  progress: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)] ring-[var(--ejo-primary)]/20',
  attention: 'bg-[var(--ejo-warning)]/12 text-[#b45309] ring-[var(--ejo-warning)]/30 dark:text-[var(--ejo-warning)]',
  success: 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)] ring-[var(--ejo-success)]/25',
  neutral: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)] ring-[var(--ejo-text-muted)]/20',
  danger: 'bg-[var(--ejo-error)]/10 text-[var(--ejo-error)] ring-[var(--ejo-error)]/20',
};

// ---------------------------------------------------------------- Warranties

export type WarrantyState = 'active' | 'expiring' | 'expired' | 'void' | 'pending' | 'other';

/** Warranties ending within this many days are "expiring soon". */
export const WARRANTY_EXPIRY_NOTICE_DAYS = 30;

export function warrantyState(w: { status: string; endsAt: Date }, now = new Date()): WarrantyState {
  if (w.status === 'VOID' || w.status === 'SUSPENDED') return 'void';
  if (w.status === 'PENDING_VERIFICATION') return 'pending';
  if (w.status === 'TRANSFERRED') return 'other';
  if (w.endsAt.getTime() < now.getTime()) return 'expired';
  if (w.endsAt.getTime() - now.getTime() <= WARRANTY_EXPIRY_NOTICE_DAYS * 86_400_000) return 'expiring';
  return 'active';
}

export const WARRANTY_STATE_INFO: Record<WarrantyState, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  expiring: { label: 'Expiring soon', tone: 'attention' },
  expired: { label: 'Expired', tone: 'neutral' },
  void: { label: 'Void', tone: 'danger' },
  pending: { label: 'Being verified', tone: 'info' },
  other: { label: 'Transferred', tone: 'neutral' },
};

export const CLAIM_STATUS: Record<string, StatusInfo> = {
  DRAFT: { label: 'Being prepared', tone: 'info', explain: 'Our team is preparing your claim.' },
  PENDING_HOD: { label: 'Under review', tone: 'info', explain: 'Your claim is being reviewed by our team.' },
  PENDING_MANAGER: { label: 'Under review', tone: 'info', explain: 'Your claim is being reviewed by our team.' },
  APPROVED_TO_SUBMIT: { label: 'Sending to the provider', tone: 'progress', explain: 'Approved by us and being sent to the warranty provider.' },
  SUBMITTED: { label: 'With the provider', tone: 'progress', explain: 'The warranty provider is considering your claim.' },
  ACCEPTED: { label: 'Accepted', tone: 'success', explain: 'Good news — the claim was accepted.' },
  PARTIALLY_ACCEPTED: { label: 'Partly accepted', tone: 'attention', explain: 'Part of the claim was accepted. Our team will explain the details.' },
  REJECTED: { label: 'Not accepted', tone: 'danger', explain: 'The provider did not accept this claim. Our team will talk you through your options.' },
  SETTLED: { label: 'Settled', tone: 'success', explain: 'This claim is complete.' },
  CANCELLED: { label: 'Withdrawn', tone: 'neutral', explain: 'This claim was withdrawn.' },
};

export const CUSTOMER_RESOLUTION: Record<string, string> = {
  REPAIRED_NO_CHARGE: 'Repaired at no charge',
  REPLACED_NO_CHARGE: 'Replaced at no charge',
  GOODWILL_REFUND: 'Goodwill refund',
  CUSTOMER_PAID: 'Paid by you',
  NOT_COVERED: 'Not covered',
};

// ------------------------------------------------------------------- Support

/** A support request (hand-over to the team), in the customer's words. */
export const SUPPORT_STATUS: Record<string, StatusInfo> = {
  OPEN: { label: 'With our team', tone: 'info', explain: 'Our customer care team has your request and will reply here.' },
  WAITING_ON_CUSTOMER: { label: 'Waiting for your reply', tone: 'attention', explain: 'Our team replied and needs an answer from you.' },
  // Waiting on the manufacturer, a supplier or an insurer: still with the team.
  ON_HOLD: { label: 'With our team', tone: 'info', explain: 'Our team is waiting on someone else (for example the manufacturer or a supplier) and will update you here.' },
  RESOLVED: { label: 'Resolved', tone: 'success', explain: 'Our team marked this as sorted. Reply below if it is not.' },
  CLOSED: { label: 'Closed', tone: 'neutral', explain: 'This request is closed.' },
};
export function supportStatus(s: string): StatusInfo {
  return SUPPORT_STATUS[s] ?? { label: titleCase(s), tone: 'neutral', explain: '' };
}
