/** One set of labels and colours for warranty claim statuses — every page,
 * list and print uses these, so a status reads the same everywhere. */
export const CLAIM_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_HOD: 'Awaiting Warranty HOD',
  PENDING_MANAGER: 'Awaiting Branch Manager',
  APPROVED_TO_SUBMIT: 'Approved — ready to submit',
  SUBMITTED: 'With the provider',
  ACCEPTED: 'Accepted',
  PARTIALLY_ACCEPTED: 'Partially accepted',
  REJECTED: 'Rejected',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
};

export const CLAIM_STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  PENDING_HOD: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  PENDING_MANAGER: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  APPROVED_TO_SUBMIT: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  SUBMITTED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  ACCEPTED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  PARTIALLY_ACCEPTED: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  REJECTED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
  SETTLED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  CANCELLED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
};

/** Status groups used for filters and KPIs. */
export const CLAIM_GROUPS: Record<string, string[]> = {
  draft: ['DRAFT'],
  approval: ['PENDING_HOD', 'PENDING_MANAGER'],
  to_submit: ['APPROVED_TO_SUBMIT'],
  with_provider: ['SUBMITTED'],
  accepted: ['ACCEPTED', 'PARTIALLY_ACCEPTED'],
  rejected: ['REJECTED'],
  settled: ['SETTLED'],
  cancelled: ['CANCELLED'],
};
