import { renderEmailLayout, html, greeting, para, details, highlight } from './layout';

export type ServiceUnitReadyEmailOptions = {
  customerName: string;
  jobNumber: string;
  productName: string;
  serialNumber: string;
  resolution: string;
  /** Balance still to pay before collection, formatted (null when nothing is due). */
  amountDue: string | null;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** To the customer: the repair passed its quality check and the unit can be collected. */
export function renderServiceUnitReadyEmail(o: ServiceUnitReadyEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`Your ${o.productName} (serial ${o.serialNumber}) has been repaired, has passed our quality check, and is ready for collection at ${o.branchName || 'the Service Centre'}.`)}
    ${details([
      ['Service job', o.jobNumber],
      ['Unit', o.productName],
      ['Serial', o.serialNumber],
      ['What was done', o.resolution],
    ])}
    ${o.amountDue ? highlight('Balance to pay before collection', o.amountDue, 'Pay at the Service Centre or by transfer, quoting the job number.', 'warning') : highlight('Nothing to pay', 'Covered', 'Bring this job number and a form of identification.', 'success')}
    ${para('If someone else is collecting for you, let the Service Centre know beforehand.', 'small')}`;
  return renderEmailLayout({
    previewText: `Your ${o.productName} is ready for collection (${o.jobNumber}).`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Ready for collection', tone: 'success' },
    heading: 'Your unit is ready for collection',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
