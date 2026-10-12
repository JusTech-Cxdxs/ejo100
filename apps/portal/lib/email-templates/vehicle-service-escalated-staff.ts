import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type VehicleServiceEscalatedStaffEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  jobNumber: string;
  customerName: string;
  escalatedByName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** A Vehicle Service found work beyond routine maintenance and moved to a Job Card. */
export function renderVehicleServiceEscalatedStaffEmail(o: VehicleServiceEscalatedStaffEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.escalatedByName} moved Vehicle Service ${o.serviceNumber} for ${o.customerName} to Job Card ${o.jobNumber}, because the work needed goes beyond routine maintenance.`)}
    ${details([
      ['Vehicle Service', `${o.serviceNumber} (now closed)`],
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Moved by', o.escalatedByName],
    ])}
    ${callout('The Vehicle Service is now closed and read-only. The estimate, payment and check-out continue on the Job Card, and the next-service count starts when the Job Card is checked out.', 'info')}`;
  return renderEmailLayout({
    previewText: `Vehicle Service ${o.serviceNumber} continues as Job Card ${o.jobNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Escalated', tone: 'info' },
    heading: `${o.serviceNumber} moved to Job Card ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: `Open Job Card ${o.jobNumber}`,
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
