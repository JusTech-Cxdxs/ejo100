import { renderEmailLayout, html, greeting, para, details } from './layout';

export type PaymentCompletedInFullEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  totalPaid: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderPaymentCompletedInFullEmail(o: PaymentCompletedInFullEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.customerName} has paid Job Card ${o.jobNumber} in full.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Total paid', o.totalPaid],
    ])}`;
  return renderEmailLayout({
    previewText: `Job Card ${o.jobNumber} is paid in full (${o.totalPaid}).`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Paid in full', tone: 'success' },
    heading: `Job Card ${o.jobNumber} paid in full`,
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
