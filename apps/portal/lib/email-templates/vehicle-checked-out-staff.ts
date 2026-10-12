import { renderEmailLayout, html, greeting, para, details } from './layout';

export type VehicleCheckedOutStaffEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  collectedByName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderVehicleCheckedOutStaffEmail(o: VehicleCheckedOutStaffEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`The vehicle on Job Card ${o.jobNumber} for ${o.customerName} has been checked out and has left the branch.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Collected by', o.collectedByName],
    ])}`;
  return renderEmailLayout({
    previewText: `Job Card ${o.jobNumber}: vehicle collected by ${o.collectedByName}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Checked out', tone: 'success' },
    heading: 'Vehicle checked out',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
