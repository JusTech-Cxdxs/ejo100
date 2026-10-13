import { renderEmailLayout, html, greeting, para, details, callout } from './layout';

export type EstimateNudgeEmailOptions = {
  recipientName: string;
  fromName: string;
  fromRole: 'supervisor' | 'technician';
  jobNumber: string;
  customerName: string;
  note?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/** A colleague asks the recipient to look at the estimate (add pricing, or check the figures). */
export function renderEstimateNudgeEmail(o: EstimateNudgeEmailOptions): string {
  const ask = o.fromRole === 'supervisor'
    ? 'add or confirm the pricing on the parts and work you sourced'
    : 'check the pricing and figures entered so far';
  const note = o.note?.trim();
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.fromName} has asked you to look at the estimate on Job Card ${o.jobNumber} for ${o.customerName} and ${ask}.`)}
    ${note ? callout(note, 'info', `Note from ${o.fromName}`) : ''}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
      ['Requested by', o.fromName],
    ])}`;
  return renderEmailLayout({
    previewText: `${o.fromName} asked you to look at the estimate on Job Card ${o.jobNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Your input needed', tone: 'warning' },
    heading: `Please look at the estimate for ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
