import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CustomerJobWorkUpdateEmailOptions = {
  /** RESUMED: parts arrived and work carried on. REWORK: sent back for further work after checks. */
  kind: 'RESUMED' | 'REWORK';
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * A work update that says what happened. The rework wording never exposes an
 * internal technician note and never promises a date.
 */
export function renderCustomerJobWorkUpdateEmail(o: CustomerJobWorkUpdateEmailOptions): string {
  const resumed = o.kind === 'RESUMED';
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${resumed
      ? para(`The parts we were waiting for have arrived, and work on your ${o.vehicleDescription} has started again.`)
      : para(`During our final checks on your ${o.vehicleDescription}, we found something we want to put right before we hand the vehicle back. It has gone back into the workshop for that work.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Vehicle', o.vehicleDescription],
      ['Status', resumed ? 'Work in progress' : 'Additional work before hand-over'],
    ])}
    ${para(resumed ? 'There is nothing you need to do. We will email you when the vehicle is ready.' : 'There is nothing you need to do. We will email you as soon as the vehicle is ready.', 'small')}`;
  return renderEmailLayout({
    previewText: resumed ? `Work on your ${o.vehicleDescription} has started again.` : `Your ${o.vehicleDescription} needs a little more work before hand-over.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: resumed ? 'Work resumed' : 'Update', tone: 'info' },
    heading: resumed ? 'Work on your vehicle has resumed' : 'An update on your vehicle',
    bodyHtml,
    ctaLabel: 'Follow progress',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
