import { renderEmailLayout, html, greeting, para, details } from './layout';

export type JobCardClosedStaffEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  closedByName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderJobCardClosedStaffEmail(o: JobCardClosedStaffEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.closedByName} closed Job Card ${o.jobNumber} for ${o.customerName}. The work and payment are settled and the record is now read-only.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Closed by', o.closedByName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.closedByName} closed Job Card ${o.jobNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Closed', tone: 'success' },
    heading: `Job Card ${o.jobNumber} closed`,
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
