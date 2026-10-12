import { renderEmailLayout, html, greeting, para, details, list, sectionTitle } from './layout';

export type SupervisorVehicleServiceAssignedEmailOptions = {
  supervisorName: string;
  serviceNumber: string;
  customerName: string;
  vehicleDescription: string;
  reasons: string[];
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderSupervisorVehicleServiceAssignedEmail(o: SupervisorVehicleServiceAssignedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.supervisorName)}
    ${para(`A new Vehicle Service has been opened${o.departmentName ? ` in ${o.departmentName}` : ''} and assigned to you. Please review the vehicle and the customer's requests, then approve it so work can start.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Vehicle', o.vehicleDescription],
    ])}
    ${sectionTitle("Customer's requests")}
    ${o.reasons.length ? list(o.reasons, true) : para('No additional requests recorded.', 'small')}`;
  return renderEmailLayout({
    previewText: `Vehicle Service ${o.serviceNumber} for ${o.customerName} is assigned to you.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Assigned to you', tone: 'warning' },
    heading: `New Vehicle Service ${o.serviceNumber}`,
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
