import { renderEmailLayout, html, greeting, para, details } from './layout';

export type TechnicianVehicleServiceAssignedEmailOptions = {
  technicianName: string;
  serviceNumber: string;
  customerName: string;
  vehicleDescription: string;
  supervisorName: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderTechnicianVehicleServiceAssignedEmail(o: TechnicianVehicleServiceAssignedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.technicianName)}
    ${para(`${o.supervisorName} has assigned you to Vehicle Service ${o.serviceNumber}. Please open it to accept the assignment or say why you cannot take it.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Vehicle', o.vehicleDescription],
      ['Assigned by', o.supervisorName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.supervisorName} assigned you to Vehicle Service ${o.serviceNumber} (${o.vehicleDescription}).`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Assigned to you', tone: 'warning' },
    heading: `You are assigned to ${o.serviceNumber}`,
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
