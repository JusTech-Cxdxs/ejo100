import { renderEmailLayout, escapeHtml } from './layout';

export type PaymentRecordedUpdateEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  amountReceived: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  balanceRemaining?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to Finance and Manager — the people who actually track money on
 * this Job Card — every time a payment is recorded. Deliberately NOT
 * sent to the technician or supervisor: what concerns them is a
 * genuinely different, separate event (see
 * payment-requirement-met.ts) — being told about every individual
 * amount recorded, when they have no financial role, is noise, not
 * signal. Also deliberately makes no claim about any threshold being
 * met — "recorded" and "requirement met" are two different facts, and
 * a customer could easily pay in several installments (a bank
 * transfer, then cash, then another transfer) well before or after
 * crossing 70%; this email only ever reports what actually happened
 * with this specific payment, nothing more.
 */
export function renderPaymentRecordedUpdateEmail(opts: PaymentRecordedUpdateEmailOptions): string {
  const { recipientName, jobNumber, customerName, amountReceived, totalPaidSoFar, totalEstimate, balanceRemaining, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      A payment of ${escapeHtml(amountReceived)} was recorded on Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)}.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Received So Far</p>
          <p style="margin: 0 ${balanceRemaining ? '0 16px 0' : '0'}; font-size: 15px; color: #0F172A;">${escapeHtml(totalPaidSoFar)} of ${escapeHtml(totalEstimate)}</p>
          ${balanceRemaining
            ? `<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Balance Remaining</p><p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(balanceRemaining)}</p>`
            : ''}
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `${amountReceived} recorded on Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Payment recorded',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
