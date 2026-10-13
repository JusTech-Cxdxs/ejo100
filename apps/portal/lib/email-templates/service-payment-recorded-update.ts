import { renderEmailLayout, html, greeting, para, details } from './layout';

export type ServicePaymentRecordedUpdateEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  amountReceived: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  balanceRemaining?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderServicePaymentRecordedUpdateEmail(o: ServicePaymentRecordedUpdateEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`A payment of ${o.amountReceived} was recorded on Vehicle Service ${o.serviceNumber} for ${o.customerName}.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['This payment', o.amountReceived],
      ['Paid so far', `${o.totalPaidSoFar} of ${o.totalEstimate}`],
      ['Balance due', o.balanceRemaining],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.amountReceived} recorded on Vehicle Service ${o.serviceNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Payment recorded', tone: 'success' },
    heading: `Payment recorded on ${o.serviceNumber}`,
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
