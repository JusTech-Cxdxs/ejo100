import { renderEmailLayout, html, greeting, para, details } from './layout';

export type ServicePaymentCompletedInFullEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  totalPaid: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderServicePaymentCompletedInFullEmail(o: ServicePaymentCompletedInFullEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.customerName} has paid Vehicle Service ${o.serviceNumber} in full.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Total paid', o.totalPaid],
    ])}`;
  return renderEmailLayout({
    previewText: `Vehicle Service ${o.serviceNumber} is paid in full (${o.totalPaid}).`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Paid in full', tone: 'success' },
    heading: `Vehicle Service ${o.serviceNumber} paid in full`,
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
