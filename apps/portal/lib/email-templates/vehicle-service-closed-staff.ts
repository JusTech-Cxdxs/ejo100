import { renderEmailLayout, html, greeting, para, details } from './layout';

export type VehicleServiceClosedStaffEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  closedByName: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderVehicleServiceClosedStaffEmail(o: VehicleServiceClosedStaffEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.closedByName} closed Vehicle Service ${o.serviceNumber} for ${o.customerName}. The work and payment are settled and the record is now read-only.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Closed by', o.closedByName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.closedByName} closed Vehicle Service ${o.serviceNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Closed', tone: 'success' },
    heading: `Vehicle Service ${o.serviceNumber} closed`,
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
