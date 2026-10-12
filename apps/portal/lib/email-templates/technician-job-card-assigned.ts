import { renderEmailLayout, html, greeting, para, details, list, sectionTitle } from './layout';

export type TechnicianJobCardAssignedEmailOptions = {
  technicianName: string;
  jobNumber: string;
  customerName: string;
  vehicleDescription: string;
  complaints: string[];
  supervisorName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderTechnicianJobCardAssignedEmail(o: TechnicianJobCardAssignedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.technicianName)}
    ${para(`${o.supervisorName} has assigned you to Job Card ${o.jobNumber}. Please review the details and accept the assignment, or decline it with a reason.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Vehicle', o.vehicleDescription],
      ['Assigned by', o.supervisorName],
    ])}
    ${sectionTitle("Customer's complaints")}
    ${o.complaints.length ? list(o.complaints, true) : para('No complaints recorded.', 'small')}`;
  return renderEmailLayout({
    previewText: `${o.supervisorName} assigned you to Job Card ${o.jobNumber}. Please accept or decline.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Response needed', tone: 'warning' },
    heading: `You are assigned to ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: 'Review and respond',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
