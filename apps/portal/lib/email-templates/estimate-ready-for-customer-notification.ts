import { renderEmailLayout, html, greeting, para, details } from './layout';

export type EstimateReadyForCustomerNotificationEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  approvedByManagerName: string;
  totalAmount: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** To whoever opened the Job Card: the manager approved the estimate, so the customer can now be told. */
export function renderEstimateReadyForCustomerNotificationEmail(o: EstimateReadyForCustomerNotificationEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.approvedByManagerName} approved the estimate on Job Card ${o.jobNumber} for ${o.customerName}. Please give it a final check, then send it to the customer from the Job Card.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Approved by', o.approvedByManagerName],
      ['Estimate total', o.totalAmount],
    ])}
    ${para('The customer receives the estimate, the deposit due and the payment details by email once you notify them.', 'small')}`;
  return renderEmailLayout({
    previewText: `The estimate on ${o.jobNumber} is approved and ready to send to ${o.customerName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Ready for the customer', tone: 'success' },
    heading: `Estimate for ${o.jobNumber} approved by the manager`,
    bodyHtml,
    ctaLabel: 'Review and notify customer',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
