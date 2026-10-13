import { renderEmailLayout, html, greeting, para, details, highlight } from './layout';

export type CustomerServicePaymentReceivedEmailOptions = {
  customerName: string;
  serviceNumber: string;
  amountReceived: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  balanceRemaining?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** A receipt-style confirmation each time the branch records a Vehicle Service payment. */
export function renderCustomerServicePaymentReceivedEmail(o: CustomerServicePaymentReceivedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Thank you. We have received your payment towards Vehicle Service ${o.serviceNumber}.`)}
    ${highlight('Amount received', o.amountReceived, o.balanceRemaining ? `Balance still due: ${o.balanceRemaining}` : 'This service is now paid in full.', 'success')}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Estimate total', o.totalEstimate],
      ['Paid so far', o.totalPaidSoFar],
      ['Balance due', o.balanceRemaining ?? 'None (paid in full)'],
    ])}
    ${para('Keep this email as your confirmation. Your full payment history is in your customer portal.', 'small')}`;
  return renderEmailLayout({
    previewText: `Payment of ${o.amountReceived} received for Vehicle Service ${o.serviceNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: o.balanceRemaining ? 'Payment received' : 'Paid in full', tone: 'success' },
    heading: 'Payment received',
    bodyHtml,
    ctaLabel: 'View payments',
    ctaUrl: o.serviceUrl,
    audience: 'customer',
  });
}
