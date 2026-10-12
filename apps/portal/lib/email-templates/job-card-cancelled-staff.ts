import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type JobCardCancelledStaffEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  approvedByName: string;
  reason: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderJobCardCancelledStaffEmail(o: JobCardCancelledStaffEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.approvedByName} approved the cancellation of Job Card ${o.jobNumber} for ${o.customerName}. Stop any work on it; no further work is needed.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Approved by', o.approvedByName],
    ])}
    ${o.reason?.trim() ? callout(o.reason.trim(), 'neutral', 'Reason') : ''}`;
  return renderEmailLayout({
    previewText: `Job Card ${o.jobNumber} for ${o.customerName} is cancelled.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Cancelled', tone: 'danger' },
    heading: `Job Card ${o.jobNumber} cancelled`,
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
