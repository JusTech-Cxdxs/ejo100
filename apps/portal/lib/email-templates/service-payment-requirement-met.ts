import { renderEmailLayout, html, greeting, para, details } from './layout';

export type ServicePaymentRequirementMetEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderServicePaymentRequirementMetEmail(o: ServicePaymentRequirementMetEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.customerName} has paid the required deposit on Vehicle Service ${o.serviceNumber}. Work can start now.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Paid so far', `${o.totalPaidSoFar} of ${o.totalEstimate}`],
    ])}`;
  return renderEmailLayout({
    previewText: `Deposit paid on ${o.serviceNumber}. Work can start.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Ready to start', tone: 'success' },
    heading: `Deposit paid on ${o.serviceNumber}`,
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
