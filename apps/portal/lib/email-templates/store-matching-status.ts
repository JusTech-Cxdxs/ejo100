import { renderEmailLayout, html, greeting, para, details, list, sectionTitle, callout, plural } from './layout';

export type StoreMatchingRequestedEmailOptions = {
  recipientName: string;
  requestedByName: string;
  jobNumber: string;
  customerName: string;
  lines: { description: string; quantity: number; unit: string | null }[];
  note?: string;
  matchingUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function storeMatchLines(lines: { description: string; quantity: number; unit: string | null }[]) {
  return list(lines.map((l) => `${l.description}: ${l.unit ? plural(l.quantity, l.unit) : `quantity ${l.quantity}`}`));
}

/** To Store: match estimate lines to catalogue parts so the estimate can be priced. */
export function renderStoreMatchingRequestedEmail(o: StoreMatchingRequestedEmailOptions): string {
  const note = o.note?.trim();
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.requestedByName} has asked Store to match ${plural(o.lines.length, 'part')} on the estimate for Job Card ${o.jobNumber} (${o.customerName}).`)}
    ${sectionTitle('Parts to match')}
    ${storeMatchLines(o.lines)}
    ${note ? callout(note, 'info', `Note from ${o.requestedByName}`) : ''}
    ${para('Match each line to a catalogue part that fits the vehicle. The price fills in from the last goods receipt cost.', 'small')}`;
  return renderEmailLayout({
    previewText: `${o.requestedByName} asked Store to match ${plural(o.lines.length, 'part')} for Job Card ${o.jobNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: { label: 'Matching needed', tone: 'warning' },
    heading: `Match parts for ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: 'Open estimate matching',
    ctaUrl: o.matchingUrl,
    audience: 'staff',
  });
}

export type StoreMatchingStatusEmailOptions = {
  recipientName: string;
  kind: 'awaiting' | 'complete';
  jobNumber: string;
  customerName: string;
  note?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderStoreMatchingStatusEmail(o: StoreMatchingStatusEmailOptions): string {
  const awaiting = o.kind === 'awaiting';
  const note = o.note?.trim();
  const line = awaiting
    ? 'The estimate has store part lines waiting to be matched. Store has been told, and the estimate cannot be submitted until matching is done.'
    : 'Store has matched every store part line on the estimate. Pricing is complete and the estimate can be submitted.';
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`Job Card ${o.jobNumber} for ${o.customerName}: ${line}`)}
    ${note ? callout(note, 'info', 'Note') : ''}
    ${details([
      ['Job Card', o.jobNumber],
      ['Customer', o.customerName],
    ])}`;
  return renderEmailLayout({
    previewText: `Job Card ${o.jobNumber}: ${awaiting ? 'waiting for Store to match parts.' : 'Store matching is complete.'}`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: awaiting ? { label: 'Waiting for Store', tone: 'warning' } : { label: 'Matching complete', tone: 'success' },
    heading: awaiting ? `Waiting for Store to match parts on ${o.jobNumber}` : `Store matching complete on ${o.jobNumber}`,
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: o.jobCardUrl,
    audience: 'staff',
  });
}
