import { renderEmailLayout, escapeHtml } from './layout';

export type PaymentConfirmedEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  amountPaid: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Broadcast to every real party on a Job Card the moment Finance
 * confirms the minimum deposit has been received — the creator, the
 * supervisor, the assigned technician, and every eligible Manager for
 * the branch each get this, one send per recipient (not a single CC'd
 * email), matching the same "notify everyone with their own copy"
 * pattern already used for the Manager-review broadcast. Deliberately
 * generic content — the actual jobs-to-do (supervisor oversight,
 * technician starting work) are already clear from role, not
 * restated per-recipient here.
 */
export function renderPaymentConfirmedEmail(opts: PaymentConfirmedEmailOptions): string {
  const { recipientName, jobNumber, customerName, amountPaid, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      Finance has confirmed payment on Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)}. Work can
      now proceed.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Amount Confirmed</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(amountPaid)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Payment confirmed on Job Card ${jobNumber} — work can proceed.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Payment confirmed — work can proceed',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
