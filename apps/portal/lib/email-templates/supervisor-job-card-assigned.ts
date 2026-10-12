import { renderEmailLayout, html, greeting, para, details, list, sectionTitle } from './layout';

export type SupervisorJobCardAssignedEmailOptions = {
  supervisorName: string;
  jobNumber: string;
  customerName: string;
  vehicleDescription: string;
  complaints: string[];
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderSupervisorJobCardAssignedEmail(o: SupervisorJobCardAssignedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.supervisorName)}
    ${para(`A new Job Card has been opened${o.departmentName ? ` in ${o.departmentName}` : ''} and assigned to you. Please review the vehicle and the customer's complaints, then start your inspection.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Vehicle', o.vehicleDescription],
    ])}
    ${sectionTitle("Customer's complaints")}
    ${o.complaints.length ? list(o.complaints, true) : para('No complaints recorded.', 'small')}`;
  return renderEmailLayout({
    previewText: `Job Card ${o.jobNumber} for ${o.customerName} (${o.vehicleDescription}) is assigned to you.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Assigned to you', tone: 'warning' },
    heading: `New Job Card ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
