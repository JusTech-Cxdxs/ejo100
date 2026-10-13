import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type TechnicianResponseEmailOptions = {
  response: 'ACCEPTED' | 'REJECTED';
  supervisorName: string;
  jobNumber: string;
  customerName: string;
  technicianName: string;
  rejectionReason?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/** To the supervisor: the technician accepted or declined the Job Card assignment. */
export function renderTechnicianResponseEmail(o: TechnicianResponseEmailOptions): string {
  const accepted = o.response === 'ACCEPTED';
  const reason = o.rejectionReason?.trim();
  const bodyHtml = html`
    ${greeting(o.supervisorName)}
    ${accepted
      ? para(`${o.technicianName} accepted the assignment on Job Card ${o.jobNumber} for ${o.customerName} and can start work.`)
      : para(`${o.technicianName} declined the assignment on Job Card ${o.jobNumber} for ${o.customerName}. Please assign another technician.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Technician', o.technicianName],
    ])}
    ${!accepted && reason ? callout(reason, 'danger', 'Reason given') : ''}`;
  return renderEmailLayout({
    previewText: accepted ? `${o.technicianName} accepted Job Card ${o.jobNumber}.` : `${o.technicianName} declined Job Card ${o.jobNumber}. It needs a new technician.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: accepted ? { label: 'Accepted', tone: 'success' } : { label: 'Needs reassigning', tone: 'danger' },
    heading: accepted ? `${o.technicianName} accepted ${o.jobNumber}` : `${o.technicianName} declined ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: accepted ? 'Open Job Card' : 'Reassign technician',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
