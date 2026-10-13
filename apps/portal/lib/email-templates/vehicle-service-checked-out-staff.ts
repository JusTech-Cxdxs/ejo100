import { renderEmailLayout, html, greeting, para, details } from './layout';

export type VehicleServiceCheckedOutStaffEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  collectedByName: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderVehicleServiceCheckedOutStaffEmail(o: VehicleServiceCheckedOutStaffEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`The vehicle on Vehicle Service ${o.serviceNumber} for ${o.customerName} has been checked out and has left the branch.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Collected by', o.collectedByName],
    ])}`;
  return renderEmailLayout({
    previewText: `Vehicle Service ${o.serviceNumber}: vehicle collected by ${o.collectedByName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Checked out', tone: 'success' },
    heading: 'Vehicle checked out',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
