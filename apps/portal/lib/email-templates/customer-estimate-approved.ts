import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerEstimateApprovedEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  lineItems: { description: string; quantity: number; amount: string }[];
  /** Combined Store Part + External Part + External Job + Internal
   * Job — every kind of parts/work sourced or performed, merged into
   * one figure. Omit (undefined) when zero, so a Job Card with no
   * priced services doesn't show a confusing "₦0.00" line. */
  servicesSubtotal?: string;
  labourSubtotal?: string;
  sundrySubtotal?: string;
  totalAmount: string;
  minimumDepositAmount: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** A short suggested reference for the customer's bank transfer —
   * e.g. "JC-2026-000005 — Foton View CS2" — so their payment can be
   * matched back to this Job Card without them having to think about
   * what to write. */
  paymentRemarkSuggestion: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to the customer once whoever created the Job Card explicitly
 * decides to notify them (see notifyCustomerOfApprovedEstimate in
 * workshop.ts) — the first time an estimate reaches the customer at
 * all, and deliberately the ONE place in this whole workflow where the
 * internal type breakdown (Store Part / External Part / External Job /
 * Internal Job / Labour / Sundry) must never appear. Every other
 * estimate email in this codebase is staff-facing and shows the type
 * per line; this one groups everything into three plain subtotals —
 * Services, Labour, Sundry — with individual line items still shown
 * for transparency, just never labeled by internal category. The
 * options type has no `type` field on any line item, so there's
 * structurally nothing to leak, not just careful wording.
 *
 * Also carries the payment instructions a customer actually needs:
 * the exact minimum deposit (computed by the caller from
 * MINIMUM_DEPOSIT_FRACTION, never a bare percentage with no number
 * attached), and both payment methods available for now — bank
 * transfer or paying the cashier in person — since no payment gateway
 * is integrated yet. A gateway (e.g. a real-time generated invoice a
 * customer can pay by clicking straight from this email) is real,
 * valuable future scope, not guessed at or half-built here.
 */
export function renderCustomerEstimateApprovedEmail(opts: CustomerEstimateApprovedEmailOptions): string {
  const {
    customerName,
    jobNumber,
    vehicleDescription,
    lineItems,
    servicesSubtotal,
    labourSubtotal,
    sundrySubtotal,
    totalAmount,
    minimumDepositAmount,
    bankName,
    accountName,
    accountNumber,
    paymentRemarkSuggestion,
    dashboardUrl,
    logoUrl,
    companyName,
    branchName,
  } = opts;

  const lineItemsHtml = lineItems.length > 0
    ? `<ol style="margin: 0; padding-left: 20px;">${lineItems
        .map((li) => `<li style="margin-bottom: 4px;">${escapeHtml(li.description)} (x${li.quantity}) — ${escapeHtml(li.amount)}</li>`)
        .join('')}</ol>`
    : '<p style="margin: 0; color: #64748B;">No items recorded.</p>';

  const subtotalRows = [
    servicesSubtotal ? `<tr><td style="padding: 2px 0; color: #64748B; font-size: 13px;">Parts &amp; Services</td><td style="padding: 2px 0; text-align: right; color: #0F172A; font-size: 13px;">${escapeHtml(servicesSubtotal)}</td></tr>` : '',
    labourSubtotal ? `<tr><td style="padding: 2px 0; color: #64748B; font-size: 13px;">Labour</td><td style="padding: 2px 0; text-align: right; color: #0F172A; font-size: 13px;">${escapeHtml(labourSubtotal)}</td></tr>` : '',
    sundrySubtotal ? `<tr><td style="padding: 2px 0; color: #64748B; font-size: 13px;">Sundry</td><td style="padding: 2px 0; text-align: right; color: #0F172A; font-size: 13px;">${escapeHtml(sundrySubtotal)}</td></tr>` : '',
  ].join('');

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      The estimate for your vehicle's service has been approved. Please review it below — a deposit is required
      before work can begin.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(vehicleDescription)}</p>
          <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Estimate</p>
          <div style="font-size: 14px; color: #0F172A; margin-bottom: 16px;">${lineItemsHtml}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #E2E8F0; padding-top: 8px;">
            ${subtotalRows}
            <tr>
              <td style="padding-top: 8px; font-size: 16px; font-weight: bold; color: #0F172A;">Total Estimate</td>
              <td style="padding-top: 8px; text-align: right; font-size: 16px; font-weight: bold; color: #0F172A;">${escapeHtml(totalAmount)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0; background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #B45309;">Minimum deposit required (70%)</p>
          <p style="margin: 0; font-size: 20px; color: #0F172A; font-weight: bold;">${escapeHtml(minimumDepositAmount)}</p>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #78350F;">Work begins once this deposit is received and confirmed.</p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #0F172A;">How to pay</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: bold; color: #0F172A;">Option 1 — Bank transfer</p>
          <p style="margin: 0; font-size: 13px; color: #0F172A;">Bank: ${escapeHtml(bankName)}</p>
          <p style="margin: 0; font-size: 13px; color: #0F172A;">Account Name: ${escapeHtml(accountName)}</p>
          <p style="margin: 0 0 8px 0; font-size: 13px; color: #0F172A;">Account Number: ${escapeHtml(accountNumber)}</p>
          <p style="margin: 0; font-size: 12px; color: #64748B;">Please use this reference so we can match your payment: <strong>${escapeHtml(paymentRemarkSuggestion)}</strong></p>
          <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748B;">After transferring, reply to this email or use your dashboard to send your payment proof.</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 20px 16px 20px;">
          <p style="margin: 0 0 4px 0; font-size: 13px; font-weight: bold; color: #0F172A;">Option 2 — Pay in person</p>
          <p style="margin: 0; font-size: 13px; color: #0F172A;">Pay the cashier at our ${escapeHtml(branchName)} office; they'll confirm your payment on our system.</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Your estimate for Job Card ${jobNumber} has been approved — deposit ${minimumDepositAmount} required to begin.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Your estimate has been approved',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
