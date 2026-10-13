import { renderEmailLayout, html, greeting, para, details } from './layout';

export type PaymentRecordedUpdateEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  amountReceived: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  balanceRemaining?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderPaymentRecordedUpdateEmail(o: PaymentRecordedUpdateEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`A payment of ${o.amountReceived} was recorded on Job Card ${o.jobNumber} for ${o.customerName}.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['This payment', o.amountReceived],
      ['Paid so far', `${o.totalPaidSoFar} of ${o.totalEstimate}`],
      ['Balance due', o.balanceRemaining],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.amountReceived} recorded on Job Card ${o.jobNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Payment recorded', tone: 'success' },
    heading: `Payment recorded on ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
