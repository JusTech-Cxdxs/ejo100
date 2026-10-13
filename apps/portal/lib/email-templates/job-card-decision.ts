import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type JobCardDecisionEmailOptions = {
  decision: 'APPROVED' | 'REJECTED';
  recipientName: string;
  jobNumber: string;
  customerName: string;
  approverName: string;
  rejectionReason?: string;
  notes?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/** To whoever opened a Job Card, when the supervisor approves it or returns it for correction. */
export function renderJobCardDecisionEmail(o: JobCardDecisionEmailOptions): string {
  const approved = o.decision === 'APPROVED';
  const notes = o.notes?.trim();
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${approved
      ? para(`${o.approverName} approved Job Card ${o.jobNumber} for ${o.customerName}. The work can now go ahead.`)
      : para(`${o.approverName} returned Job Card ${o.jobNumber} for ${o.customerName} for correction. Please make the changes below and submit it again.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      [approved ? 'Approved by' : 'Returned by', o.approverName],
    ])}
    ${!approved && o.rejectionReason?.trim() ? callout(o.rejectionReason.trim(), 'danger', 'What needs correcting') : ''}
    ${notes ? callout(notes, 'neutral', 'Notes') : ''}`;
  return renderEmailLayout({
    previewText: approved ? `${o.approverName} approved Job Card ${o.jobNumber}.` : `Job Card ${o.jobNumber} needs correcting before it can go ahead.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: approved ? { label: 'Approved', tone: 'success' } : { label: 'Returned for correction', tone: 'danger' },
    heading: approved ? `Job Card ${o.jobNumber} approved` : `Job Card ${o.jobNumber} needs correcting`,
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
