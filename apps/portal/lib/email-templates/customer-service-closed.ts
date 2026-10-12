import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CustomerServiceClosedEmailOptions = {
  customerName: string;
  serviceNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderCustomerServiceClosedEmail(o: CustomerServiceClosedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Vehicle Service ${o.serviceNumber} for your ${o.vehicleDescription} is now closed. The work and payment are fully settled, and the full record stays available in your customer portal.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Vehicle', o.vehicleDescription],
      ['Status', 'Closed'],
    ])}
    ${para(`Thank you for choosing ${o.companyName}.`)}`;
  return renderEmailLayout({
    previewText: `Vehicle Service ${o.serviceNumber} is closed. Thank you for choosing ${o.companyName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Closed', tone: 'success' },
    heading: 'Your vehicle service is closed',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
