import { renderEmailLayout, escapeHtml } from './layout';

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

/**
 * A lightweight, repeatable "please take a look" nudge between the
 * supervisor and technician while an estimate is still in Draft —
 * genuinely different from estimate-submitted-for-validation.ts, which
 * is the one-time, formal "I'm done, this needs your sign-off" event.
 * This one carries no status change at all; it's just informal
 * back-and-forth communication, which is exactly why it needs its own
 * email rather than reusing that one. One shared template for both
 * directions (supervisor→technician and technician→supervisor) since
 * the content is functionally identical either way — only who's
 * asking and what they're asking for differs, both supplied by the
 * caller.
 */
export function renderEstimateNudgeEmail(opts: EstimateNudgeEmailOptions): string {
  const { recipientName, fromName, fromRole, jobNumber, customerName, note, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const ask = fromRole === 'supervisor'
    ? 'review the estimate and add or confirm your pricing on the parts/work you sourced'
    : 'check the estimate — review the pricing and figures entered so far';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(fromName)} is asking you to ${ask} on Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)}.
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
    previewText: `${fromName} is asking you to check the estimate on Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'A note on this estimate',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
