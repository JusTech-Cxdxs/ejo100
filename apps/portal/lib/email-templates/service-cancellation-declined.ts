import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type ServiceCancellationDeclinedEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  declinedByName: string;
  decisionNotes?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderServiceCancellationDeclinedEmail(o: ServiceCancellationDeclinedEmailOptions): string {
  const notes = o.decisionNotes?.trim();
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.declinedByName} declined your request to cancel Vehicle Service ${o.serviceNumber} for ${o.customerName}. The Vehicle Service stays open and work continues as normal.`)}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
      ['Declined by', o.declinedByName],
    ])}
    ${notes ? callout(notes, 'neutral', 'Note from the manager') : ''}`;
  return renderEmailLayout({
    previewText: `Your request to cancel Vehicle Service ${o.serviceNumber} was declined.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Declined', tone: 'danger' },
    heading: 'Cancellation request declined',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.serviceUrl,
    audience: 'staff',
  });
}
