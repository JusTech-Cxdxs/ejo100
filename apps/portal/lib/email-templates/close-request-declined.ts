import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type CloseRequestDeclinedEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  declinedByName: string;
  decisionNotes?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderCloseRequestDeclinedEmail(o: CloseRequestDeclinedEmailOptions): string {
  const notes = o.decisionNotes?.trim();
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.declinedByName} declined the request to close Job Card ${o.jobNumber} for ${o.customerName}. The Job Card stays open.`)}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Declined by', o.declinedByName],
    ])}
    ${notes ? callout(notes, 'neutral', 'Note from the manager') : ''}`;
  return renderEmailLayout({
    previewText: `The request to close Job Card ${o.jobNumber} was declined.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Declined', tone: 'danger' },
    heading: 'Close request declined',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
