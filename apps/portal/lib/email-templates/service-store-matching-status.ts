import { renderEmailLayout, html, greeting, para, details, sectionTitle, callout, plural } from './layout';
import { storeMatchLines } from './store-matching-status';

export type ServiceStoreMatchingRequestedEmailOptions = {
  recipientName: string;
  requestedByName: string;
  serviceNumber: string;
  customerName: string;
  lines: { description: string; quantity: number; unit: string | null }[];
  note?: string;
  matchingUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/** To Store: match Vehicle Service estimate lines to catalogue parts. */
export function renderServiceStoreMatchingRequestedEmail(o: ServiceStoreMatchingRequestedEmailOptions): string {
  const note = o.note?.trim();
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`${o.requestedByName} has asked Store to match ${plural(o.lines.length, 'part')} on the estimate for Vehicle Service ${o.serviceNumber} (${o.customerName}).`)}
    ${sectionTitle('Parts to match')}
    ${storeMatchLines(o.lines)}
    ${note ? callout(note, 'info', `Note from ${o.requestedByName}`) : ''}
    ${para("Match each line to a catalogue part that fits the vehicle. The price fills in from the part's current selling price.", 'small')}`;
  return renderEmailLayout({
    previewText: `${o.requestedByName} asked Store to match ${plural(o.lines.length, 'part')} for Vehicle Service ${o.serviceNumber}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: { label: 'Matching needed', tone: 'warning' },
    heading: `Match parts for ${o.serviceNumber}`,
    bodyHtml,
    ctaLabel: 'Open estimate matching',
    ctaUrl: o.matchingUrl,
    audience: 'staff',
  });
}

export type ServiceStoreMatchingStatusEmailOptions = {
  recipientName: string;
  kind: 'awaiting' | 'complete';
  serviceNumber: string;
  customerName: string;
  note?: string;
  vehicleServiceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

export function renderServiceStoreMatchingStatusEmail(o: ServiceStoreMatchingStatusEmailOptions): string {
  const awaiting = o.kind === 'awaiting';
  const note = o.note?.trim();
  const line = awaiting
    ? 'The estimate has store part lines waiting to be matched. Store has been told, and the estimate cannot be submitted until matching is done.'
    : 'Store has matched every store part line on the estimate. Pricing is complete and the estimate can be submitted.';
  const bodyHtml = html`
    ${greeting(o.recipientName)}
    ${para(`Vehicle Service ${o.serviceNumber} for ${o.customerName}: ${line}`)}
    ${note ? callout(note, 'info', 'Note') : ''}
    ${details([
      ['Vehicle Service', o.serviceNumber],
      ['Customer', o.customerName],
    ])}`;
  return renderEmailLayout({
    previewText: `Vehicle Service ${o.serviceNumber}: ${awaiting ? 'waiting for Store to match parts.' : 'Store matching is complete.'}`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName],
    status: awaiting ? { label: 'Waiting for Store', tone: 'warning' } : { label: 'Matching complete', tone: 'success' },
    heading: awaiting ? `Waiting for Store to match parts on ${o.serviceNumber}` : `Store matching complete on ${o.serviceNumber}`,
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: o.vehicleServiceUrl,
    audience: 'staff',
  });
}
