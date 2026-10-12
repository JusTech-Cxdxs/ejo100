import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type CustomerServiceCheckedOutEmailOptions = {
  customerName: string;
  serviceNumber: string;
  vehicleDescription: string;
  collectedByName: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** Confirms the vehicle left the branch after a Vehicle Service, and who collected it. */
export function renderCustomerServiceCheckedOutEmail(o: CustomerServiceCheckedOutEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${para(`This confirms that your ${o.vehicleDescription} has been collected from ${o.branchName || 'the branch'}.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Vehicle', o.vehicleDescription],
      ['Collected by', o.collectedByName],
    ])}
    ${callout('If you did not collect the vehicle yourself or authorise this person to collect it, contact the branch straight away.', 'warning')}
    ${para(`Thank you for choosing ${o.companyName}. We will remind you when the next routine service is due.`)}`;
  return renderEmailLayout({
    previewText: `Your ${o.vehicleDescription} was collected by ${o.collectedByName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Collected', tone: 'success' },
    heading: 'Your vehicle has been collected',
    bodyHtml,
    ctaLabel: 'View in customer portal',
    ctaUrl: o.dashboardUrl,
    audience: 'customer',
  });
}
