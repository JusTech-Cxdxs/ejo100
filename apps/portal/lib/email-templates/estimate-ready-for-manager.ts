import { renderEmailLayout, html, greeting, para, details } from './layout';

export type EstimateReadyForManagerEmailOptions = {
  managerName: string;
  jobNumber: string;
  customerName: string;
  approvedByName: string;
  totalAmount: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** The supervisor validated the estimate; the manager approves it before the customer sees it. */
export function renderEstimateReadyForManagerEmail(o: EstimateReadyForManagerEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.managerName)}
    ${para(`${o.approvedByName} has validated the estimate on Job Card ${o.jobNumber} for ${o.customerName}. It needs your approval before the customer can be told.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Validated by', o.approvedByName],
      ['Estimate total', o.totalAmount],
    ])}`;
  return renderEmailLayout({
    previewText: `Estimate of ${o.totalAmount} on Job Card ${o.jobNumber} is waiting for your approval.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Approval needed', tone: 'warning' },
    heading: `Estimate for ${o.jobNumber} needs your approval`,
    bodyHtml,
    ctaLabel: 'Review estimate',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
