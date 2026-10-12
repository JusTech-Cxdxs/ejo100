import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type CancellationRequestedEmailOptions = {
  managerName: string;
  jobNumber: string;
  customerName: string;
  requestedByName: string;
  reason: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** To each workshop manager of the branch when someone asks to cancel a Job Card. */
export function renderCancellationRequestedEmail(o: CancellationRequestedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.managerName)}
    ${para(`${o.requestedByName} has asked to cancel Job Card ${o.jobNumber} for ${o.customerName}. Please review the request and approve or decline it.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Requested by', o.requestedByName],
    ])}
    ${o.reason?.trim() ? callout(o.reason.trim(), 'warning', 'Reason given') : ''}`;
  return renderEmailLayout({
    previewText: `${o.requestedByName} asked to cancel Job Card ${o.jobNumber}. Your decision is needed.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Decision needed', tone: 'warning' },
    heading: `Cancellation request for ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: 'Review request',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
