import { renderEmailLayout, escapeHtml } from './layout';

export type ServiceStoreMatchingRequestedEmailOptions = {
  recipientName: string;
  requestedByName: string;
  serviceNumber: string;
  customerName: string;
  lines: { description: string; quantity: number }[];
  note?: string;
  matchingUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * The real Vehicle Service equivalent of Job Card's own
 * renderStoreMatchingRequestedEmail — to Store specifically, the one
 * audience that actually acts on it, so this is the one that carries
 * real line-level detail.
 */
export function renderServiceStoreMatchingRequestedEmail(opts: ServiceStoreMatchingRequestedEmailOptions): string {
  const { recipientName, requestedByName, serviceNumber, customerName, lines, note, matchingUrl, logoUrl, companyName, branchName } = opts;

  const lineItems = lines.map((l) => `<li style="margin-bottom: 4px;">${escapeHtml(l.description)} (x${l.quantity})</li>`).join('');

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(requestedByName)} has asked Store to match the following parts for Vehicle Service ${escapeHtml(serviceNumber)} for
      ${escapeHtml(customerName)}:
    </p>
    <ul style="margin: 0 0 16px 0; padding-left: 20px;">${lineItems}</ul>
    <p style="margin: 0 0 16px 0;">Match each to a real, vehicle-fitting Part from the catalog — the price fills in automatically from the Part's own current selling price.</p>
    ${note?.trim()
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Note</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(note.trim())}</p>
        </td>
      </tr>
    </table>
    `
      : ''}
  `;

  return renderEmailLayout({
    previewText: `${requestedByName} has asked Store to match parts for Vehicle Service ${serviceNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Store matching requested',
    bodyHtml,
    ctaLabel: 'Open Service Estimate Matching',
    ctaUrl: matchingUrl,
    logoUrl,
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

/**
 * The real Vehicle Service equivalent of Job Card's own
 * renderStoreMatchingStatusEmail — to the supervisor/technician,
 * status only, same one shared template for both real moments.
 */
export function renderServiceStoreMatchingStatusEmail(opts: ServiceStoreMatchingStatusEmailOptions): string {
  const { recipientName, kind, serviceNumber, customerName, note, vehicleServiceUrl, logoUrl, companyName, branchName } = opts;

  const statusLine =
    kind === 'awaiting'
      ? 'This estimate now has Store Part lines awaiting a match — Store has been notified. Submission is on hold until matching is done.'
      : 'Store has finished matching every Store Part line on this estimate — pricing is complete and you can now proceed with submission.';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      Vehicle Service ${escapeHtml(serviceNumber)} for ${escapeHtml(customerName)}: ${statusLine}
    </p>
    ${note?.trim()
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Note</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(note.trim())}</p>
        </td>
      </tr>
    </table>
    `
      : ''}
  `;

  return renderEmailLayout({
    previewText: statusLine,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: kind === 'complete' ? '\u2713' : '!',
    iconTone: kind === 'complete' ? 'positive' : 'neutral',
    heading: kind === 'awaiting' ? 'Awaiting Store match' : 'Store matching complete',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: vehicleServiceUrl,
    logoUrl,
  });
}
