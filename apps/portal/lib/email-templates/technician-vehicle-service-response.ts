import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type TechnicianVehicleServiceResponseEmailOptions = {
  response: 'ACCEPTED' | 'REJECTED';
  supervisorName: string;
  serviceNumber: string;
  customerName: string;
  technicianName: string;
  rejectionReason?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/** To the supervisor: the technician accepted or declined the Vehicle Service assignment. */
export function renderTechnicianVehicleServiceResponseEmail(o: TechnicianVehicleServiceResponseEmailOptions): string {
  const accepted = o.response === 'ACCEPTED';
  const reason = o.rejectionReason?.trim();
  const bodyHtml = html`
    ${greeting(o.supervisorName)}
    ${accepted
      ? para(`${o.technicianName} accepted the assignment on Vehicle Service ${o.serviceNumber} for ${o.customerName} and can start work.`)
      : para(`${o.technicianName} declined the assignment on Vehicle Service ${o.serviceNumber} for ${o.customerName}. Please assign another technician.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Technician', o.technicianName],
    ])}
    ${!accepted && reason ? callout(reason, 'danger', 'Reason given') : ''}`;
  return renderEmailLayout({
    previewText: accepted ? `${o.technicianName} accepted Vehicle Service ${o.serviceNumber}.` : `${o.technicianName} declined Vehicle Service ${o.serviceNumber}. It needs a new technician.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: accepted ? { label: 'Accepted', tone: 'success' } : { label: 'Needs reassigning', tone: 'danger' },
    heading: accepted ? `${o.technicianName} accepted ${o.serviceNumber}` : `${o.technicianName} declined ${o.serviceNumber}`,
    bodyHtml,
    ctaLabel: accepted ? 'Open Vehicle Service' : 'Reassign technician',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
