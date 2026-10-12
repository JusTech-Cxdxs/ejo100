import { renderEmailLayout, html, greeting, para, details, highlight } from './layout';

export type CustomerRefundReceiptEmailOptions = {
  customerName: string;
  referenceNumber: string;
  /** "Job Card" or "Vehicle Service" */
  recordLabel: string;
  recordNumber: string;
  vehicleDescription: string;
  amount: string;
  method: string;
  paidToName: string;
  totalRefunded: string;
  remaining: string | null;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** The customer's receipt for each refund payment. */
export function renderCustomerRefundReceiptEmail(o: CustomerRefundReceiptEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`We have refunded ${o.amount} relating to ${o.recordLabel} ${o.recordNumber} for your ${o.vehicleDescription}. Please keep this email as your receipt.`)}
    ${highlight('Amount refunded', o.amount, o.remaining ? `Still to be refunded: ${o.remaining}` : 'Your refund is complete.', 'success')}
    ${details([
      ['Refund receipt', o.referenceNumber],
      [o.recordLabel, o.recordNumber],
      ['Refunded by', o.method],
      ['Received by', o.paidToName],
      ['Total refunded so far', o.totalRefunded],
      ['Still to be refunded', o.remaining],
    ])}
    ${o.remaining ? para('The rest of the refund will follow. You will receive a receipt like this one for each payment.', 'small') : ''}`;
  return renderEmailLayout({
    previewText: `Refund receipt ${o.referenceNumber}: ${o.amount} refunded.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: o.remaining ? 'Part refund' : 'Refund complete', tone: 'success' },
    heading: 'Your refund receipt',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
