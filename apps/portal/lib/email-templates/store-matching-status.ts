import { renderEmailLayout, escapeHtml } from './layout';

export type StoreMatchingRequestedEmailOptions = {
  recipientName: string;
  requestedByName: string;
  jobNumber: string;
  customerName: string;
  lines: { description: string; quantity: number }[];
  note?: string;
  matchingUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * To Store specifically — the one email in this pair that genuinely
 * needs real detail, since it's the only audience that actually acts
 * on it: exactly which Part Types are still waiting to be matched for
 * this one Job Card, nothing about the rest of the estimate they have
 * no reason to see.
 */
export function renderStoreMatchingRequestedEmail(opts: StoreMatchingRequestedEmailOptions): string {
  const { recipientName, requestedByName, jobNumber, customerName, lines, note, matchingUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const lineItems = lines.map((l) => `<li style="margin-bottom: 4px;">${escapeHtml(l.description)} (x${l.quantity})</li>`).join('');

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(requestedByName)} has asked Store to match the following parts for Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)}:
    </p>
    <ul style="margin: 0 0 16px 0; padding-left: 20px;">${lineItems}</ul>
    <p style="margin: 0 0 16px 0;">Match each to a real, vehicle-fitting Part from the catalog — the price fills in automatically from the last Goods Receipt cost.</p>
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
    previewText: `${requestedByName} has asked Store to match parts for Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Store matching requested',
    bodyHtml,
    ctaLabel: 'Open Estimate Matching',
    ctaUrl: matchingUrl,
    logoUrl,
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

/**
 * To the Supervisor/Technician — status only, no line-level detail,
 * since neither role acts on the matching itself. One shared template
 * for both real moments (matching just requested, and matching now
 * complete) since the only real difference is which sentence applies.
 */
export function renderStoreMatchingStatusEmail(opts: StoreMatchingStatusEmailOptions): string {
  const { recipientName, kind, jobNumber, customerName, note, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const statusLine =
    kind === 'awaiting'
      ? 'This estimate now has Store Part lines awaiting a match — Store has been notified. Submission is on hold until matching is done.'
      : 'Store has finished matching every Store Part line on this estimate — pricing is complete and you can now proceed with submission.';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)}: ${statusLine}
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
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: kind === 'complete' ? '\u2713' : '!',
    iconTone: kind === 'complete' ? 'positive' : 'neutral',
    heading: kind === 'awaiting' ? 'Awaiting Store match' : 'Store matching complete',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
