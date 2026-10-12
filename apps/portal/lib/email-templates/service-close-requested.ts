import { renderEmailLayout, html, greeting, para, details } from './layout';

export type ServiceCloseRequestedEmailOptions = {
  managerName: string;
  serviceNumber: string;
  customerName: string;
  requestedByName: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** To each workshop manager of the branch when someone asks to close a Vehicle Service. */
export function renderServiceCloseRequestedEmail(o: ServiceCloseRequestedEmailOptions): string {
  const bodyHtml = html`
    ${greeting(o.managerName)}
    ${para(`${o.requestedByName} has asked to close Vehicle Service ${o.serviceNumber} for ${o.customerName}. Please review the service and approve or decline the request.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Requested by', o.requestedByName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.requestedByName} asked to close Vehicle Service ${o.serviceNumber}. Your decision is needed.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Decision needed', tone: 'warning' },
    heading: `Close request for ${o.serviceNumber}`,
    bodyHtml,
    ctaLabel: 'Review request',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
