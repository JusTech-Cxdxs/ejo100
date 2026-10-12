import { renderEmailLayout, html, greeting, para, details } from './layout';

export type PaymentRequirementMetEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderPaymentRequirementMetEmail(o: PaymentRequirementMetEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.customerName} has paid the required deposit on Job Card ${o.jobNumber}. Work can start now.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Paid so far', `${o.totalPaidSoFar} of ${o.totalEstimate}`],
    ])}`;
  return renderEmailLayout({
    previewText: `Deposit paid on Job Card ${o.jobNumber}. Work can start.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Ready to start', tone: 'success' },
    heading: `Deposit paid on ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
