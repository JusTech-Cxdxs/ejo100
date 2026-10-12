import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type ServiceCancellationRequestedEmailOptions = {
  managerName: string;
  serviceNumber: string;
  customerName: string;
  requestedByName: string;
  reason: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderServiceCancellationRequestedEmail(o: ServiceCancellationRequestedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.managerName)}
    ${para(`${o.requestedByName} has asked to cancel Vehicle Service ${o.serviceNumber} for ${o.customerName}. Please review the request and approve or decline it.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Requested by', o.requestedByName],
    ])}
    ${o.reason?.trim() ? callout(o.reason.trim(), 'warning', 'Reason given') : ''}`;
  return renderEmailLayout({
    previewText: `${o.requestedByName} asked to cancel Vehicle Service ${o.serviceNumber}. Your decision is needed.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Decision needed', tone: 'warning' },
    heading: `Cancellation request for ${o.serviceNumber}`,
    bodyHtml,
    ctaLabel: 'Review request',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
