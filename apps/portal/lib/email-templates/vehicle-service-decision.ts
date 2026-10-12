import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type VehicleServiceDecisionEmailOptions = {
  decision: 'APPROVED' | 'REJECTED';
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  approverName: string;
  rejectionReason?: string;
  notes?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/** To whoever opened a Vehicle Service, when the supervisor approves it or returns it for correction. */
export function renderVehicleServiceDecisionEmail(o: VehicleServiceDecisionEmailOptions): string {
  const approved = o.decision === 'APPROVED';
  const notes = o.notes?.trim();
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${approved
      ? para(`${o.approverName} approved Vehicle Service ${o.serviceNumber} for ${o.customerName}. The work can now go ahead.`)
      : para(`${o.approverName} returned Vehicle Service ${o.serviceNumber} for ${o.customerName} for correction. Please make the changes below and submit it again.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      [approved ? 'Approved by' : 'Returned by', o.approverName],
    ])}
    ${!approved && o.rejectionReason?.trim() ? callout(o.rejectionReason.trim(), 'danger', 'What needs correcting') : ''}
    ${notes ? callout(notes, 'neutral', 'Notes') : ''}`;
  return renderEmailLayout({
    previewText: approved ? `${o.approverName} approved Vehicle Service ${o.serviceNumber}.` : `Vehicle Service ${o.serviceNumber} needs correcting before it can go ahead.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: approved ? { label: 'Approved', tone: 'success' } : { label: 'Returned for correction', tone: 'danger' },
    heading: approved ? `Vehicle Service ${o.serviceNumber} approved` : `Vehicle Service ${o.serviceNumber} needs correcting`,
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
