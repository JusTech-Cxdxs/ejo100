import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CustomerQualityCheckEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** Sent once, when the work is done and the vehicle goes to quality checks. */
export function renderCustomerQualityCheckEmail(o: CustomerQualityCheckEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`The work on your ${o.vehicleDescription} is finished. Our quality team is now carrying out final checks, including a road test, before the vehicle is handed back to you.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Status', 'Final quality checks'],
    ])}
    ${para('We will email you when the checks are complete.', 'small')}`;
  return renderEmailLayout({
    previewText: `Work on your ${o.vehicleDescription} is finished and in final quality checks.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Quality checks', tone: 'info' },
    heading: 'Your vehicle is in final checks',
    bodyHtml,
    ctaLabel: 'Follow progress',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
