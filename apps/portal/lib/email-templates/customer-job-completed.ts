import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type CustomerJobCompletedEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  afterRework?: boolean;
};

/** The vehicle passed the final quality inspection; collection details follow in a separate email. */
export function renderCustomerJobCompletedEmail(o: CustomerJobCompletedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Your ${o.vehicleDescription} has passed our final quality inspection. We are now preparing it for collection and will email you shortly with the collection details.`)}
    ${o.afterRework ? callout('The additional work we told you about is complete.', 'success') : ''}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Status', 'Passed quality inspection'],
    ])}`;
  return renderEmailLayout({
    previewText: `Your ${o.vehicleDescription} has passed its final quality inspection.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Inspection passed', tone: 'success' },
    heading: 'Your vehicle passed its quality inspection',
    bodyHtml,
    ctaLabel: 'Follow progress',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
