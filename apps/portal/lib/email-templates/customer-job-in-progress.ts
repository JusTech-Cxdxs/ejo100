import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CustomerJobInProgressEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** Sent once, when work on a Job Card starts. */
export function renderCustomerJobInProgressEmail(o: CustomerJobInProgressEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Our technicians have started work on your ${o.vehicleDescription}. We will email you again when the work has passed our quality checks and when the vehicle is ready for collection.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Status', 'Work in progress'],
    ])}
    ${para('There is nothing you need to do for now. You can follow each step in your customer portal.', 'small')}`;
  return renderEmailLayout({
    previewText: `Our technicians have started work on your ${o.vehicleDescription}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'In progress', tone: 'info' },
    heading: 'Work on your vehicle has started',
    bodyHtml,
    ctaLabel: 'Follow progress',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
