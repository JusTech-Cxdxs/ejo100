import { renderEmailLayout, html, greeting, para, details, highlight } from './layout';

export type CustomerPaymentReceivedEmailOptions = {
  customerName: string;
  jobNumber: string;
  amountReceived: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  balanceRemaining?: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** A receipt-style confirmation each time the branch records a payment. */
export function renderCustomerPaymentReceivedEmail(o: CustomerPaymentReceivedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Thank you. We have received your payment towards Job Card ${o.jobNumber}.`)}
    ${highlight('Amount received', o.amountReceived, o.balanceRemaining ? `Balance still due: ${o.balanceRemaining}` : 'This Job Card is now paid in full.', 'success')}
    ${details([
      ['Job Card', o.jobNumber],
      ['Estimate total', o.totalEstimate],
      ['Paid so far', o.totalPaidSoFar],
      ['Balance due', o.balanceRemaining ?? 'None (paid in full)'],
    ])}
    ${para('Keep this email as your confirmation. Your full payment history is in your customer portal.', 'small')}`;
  return renderEmailLayout({
    previewText: `Payment of ${o.amountReceived} received for Job Card ${o.jobNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: o.balanceRemaining ? 'Payment received' : 'Paid in full', tone: 'success' },
    heading: 'Payment received',
    bodyHtml,
    ctaLabel: 'View payments',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
