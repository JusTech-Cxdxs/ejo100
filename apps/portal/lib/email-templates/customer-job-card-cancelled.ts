import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CustomerJobCardCancelledEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderCustomerJobCardCancelledEmail(o: CustomerJobCardCancelledEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`As requested, Job Card ${o.jobNumber} for your ${o.vehicleDescription} has been cancelled. No further work will be carried out under it.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Status', 'Cancelled'],
    ])}
    ${para('If your vehicle is still with us, please arrange to collect it. If you paid anything towards this job, the branch will contact you about it. Whenever you need us again, we will be glad to help.')}`;
  return renderEmailLayout({
    previewText: `Job Card ${o.jobNumber} for your ${o.vehicleDescription} has been cancelled.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Cancelled', tone: 'neutral' },
    heading: 'Your Job Card has been cancelled',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
