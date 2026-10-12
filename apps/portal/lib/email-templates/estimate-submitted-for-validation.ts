import { renderEmailLayout, html, greeting, para, details } from './layout';

export type EstimateSubmittedEmailOptions = {
  supervisorName: string;
  jobNumber: string;
  customerName: string;
  submittedByName: string;
  totalAmount: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/** The technician finished the estimate; the supervisor checks and validates it. */
export function renderEstimateSubmittedEmail(o: EstimateSubmittedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.supervisorName)}
    ${para(`${o.submittedByName} has finished the estimate on Job Card ${o.jobNumber} for ${o.customerName} and sent it to you. Please check it, correct anything that needs it, and validate it.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Prepared by', o.submittedByName],
      ['Estimate total', o.totalAmount],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.submittedByName} sent you the estimate on Job Card ${o.jobNumber} (${o.totalAmount}).`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Validation needed', tone: 'warning' },
    heading: `Estimate for ${o.jobNumber} needs your validation`,
    bodyHtml,
    ctaLabel: 'Review estimate',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
