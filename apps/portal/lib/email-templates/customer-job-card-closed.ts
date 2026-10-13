import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CustomerJobCardClosedEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderCustomerJobCardClosedEmail(o: CustomerJobCardClosedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Job Card ${o.jobNumber} for your ${o.vehicleDescription} is now closed. The work and payment are fully settled, and the full record stays available in your customer portal.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Status', 'Closed'],
    ])}
    ${para(`Thank you for choosing ${o.companyName}.`)}`;
  return renderEmailLayout({
    previewText: `Job Card ${o.jobNumber} is closed. Thank you for choosing ${o.companyName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Closed', tone: 'success' },
    heading: 'Your Job Card is closed',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
