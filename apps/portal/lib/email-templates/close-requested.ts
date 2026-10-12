import { renderEmailLayout, html, greeting, para, details } from './layout';

export type CloseRequestedEmailOptions = {
  managerName: string;
  jobNumber: string;
  customerName: string;
  requestedByName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** To each workshop manager of the branch when someone asks to close a Job Card. The Job Card itself is unchanged until a manager decides. */
export function renderCloseRequestedEmail(o: CloseRequestedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.managerName)}
    ${para(`${o.requestedByName} has asked to close Job Card ${o.jobNumber} for ${o.customerName}. Please review the Job Card and approve or decline the request.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Requested by', o.requestedByName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.requestedByName} asked to close Job Card ${o.jobNumber}. Your decision is needed.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Decision needed', tone: 'warning' },
    heading: `Close request for ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: 'Review request',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
