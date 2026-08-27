import { renderEmailLayout, escapeHtml } from './layout';

export type PaymentRequirementMetEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent exactly once — the moment the cumulative recorded total first
 * reaches the 70% minimum deposit, to every real party on the Job Card
 * (creator, supervisor, technician, every eligible Manager, and every
 * eligible Finance Officer for the branch). Genuinely different content
 * from payment-recorded-update.ts: this is the one thing a technician
 * or supervisor actually needs to know — the requirement is met and
 * work can begin now — not the raw amount or running total, which
 * means nothing to them. Approval is automatic the moment this fires;
 * there is no separate manual approval step for Finance to action.
 * Never repeated on a later payment; that's the whole point of gating
 * this on "just crossed the threshold" rather than "is currently at or
 * above it."
 */
export function renderPaymentRequirementMetEmail(opts: PaymentRequirementMetEmailOptions): string {
  const { recipientName, jobNumber, customerName, totalPaidSoFar, totalEstimate, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      The required 70% deposit has been met on Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)}.
      Work can begin now.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Received</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(totalPaidSoFar)} of ${escapeHtml(totalEstimate)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Required deposit met on Job Card ${jobNumber} — work can begin.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Deposit requirement met',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
